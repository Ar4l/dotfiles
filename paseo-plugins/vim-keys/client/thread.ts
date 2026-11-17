import {
  type Area,
  type DomRange,
  type Elem,
  type KeyEvt,
  type Rect,
  type TextNode,
  CSS,
  Highlight,
  MutationObserver,
  WheelEvent,
  document,
  getComputedStyle,
  requestAnimationFrame,
} from "./dom";
import { type Message, type Vim, create, matches, moveTo, notFound, peek, press, selection } from "./vim";

// The agent thread as a text Vim reads. The text is what the app has on the page, a cursor
// and a selection are drawn over it with highlights, and nothing in the page is changed.

// App internals this file leans on; README.md lists them.
const SCROLL = "[data-testid='agent-chat-scroll']";
const PANE = "[data-testid^='workspace-pane-']";
const ROW = "[data-history-row-id]";
/** Text that is on the page and not for reading. */
const SKIP = "[aria-hidden='true'],svg,style,script,[data-chat-find-widget='true']";
/** A message of the user's or the agent's: what `{ }` and `[[ ]]` move between. A tool call is none. */
const MESSAGE = "[data-testid='user-message'],[data-testid='assistant-message']";
const OWN = "[data-testid='user-message']";
/** The time under a user message, inside its element and no part of its text. */
const ASIDE = "[data-testid='user-message-trailing-row']";
/** An empty line parts these inside a message, and the rows themselves. */
const GROUP = "p,pre,ul,ol,h1,h2,h3,h4,h5,h6,table,blockquote";
/** A row of a long thread that the app draws only while it is near the view. */
const VIRTUAL = "[data-history-row-id][data-index]";
/** Shown at the top of the thread while the app fetches older messages. */
const LOADING = "[data-testid='load-older-history-spinner']";
/** How long the app may take to start fetching older messages before the thread counts as read to its start. */
const START_MS = 600;
/** How long after a key the cursor holds its place while the app settles its rows. */
const HOLD_MS = 600;
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
/** What Enter presses: a collapsed turn, a tool call, a link. */
const PRESSABLE = "button,[role='button'],a[href]";
/** `scrolloff`: the lines kept between the cursor and the edge of the thread. */
const SCROLLOFF = 3;
const ARROWS: Record<string, string> = { ArrowLeft: "h", ArrowRight: "l", ArrowUp: "k", ArrowDown: "j", Home: "0", End: "$" };
const DIGIT = /^[0-9]$/;

const NAME = { cursor: "vim-keys-cursor", visual: "vim-keys-visual", search: "vim-keys-search", match: "vim-keys-match" };
/** The colours of the thread's cursor, selection and matches. `colors` are the modes' own. */
export const threadStyles = (colors: { normal: string; visual: string }) =>
  `::highlight(${NAME.search}){background-color:#fde68a;color:#111827}` +
  `::highlight(${NAME.match}){background-color:#f97316;color:#fff}` +
  `::highlight(${NAME.visual}){background-color:${colors.visual};color:#fff}` +
  `::highlight(${NAME.cursor}){background-color:${colors.normal};color:#fff}`;

/** The thread's text, and where each stretch of it is on the page. */
interface Buffer {
  text: string;
  nodes: TextNode[];
  /** Where each node's text starts in `text`. */
  starts: number[];
  index: Map<TextNode, number>;
  messages: Message[];
}
/** A place in the text that survives a rebuild: a node and an offset, which may lie past the node's end. */
interface Mark {
  node: TextNode;
  offset: number;
}
interface Reading {
  vim: Vim;
  cursor: Mark | null;
  anchor: Mark | null;
}

/**
 * Reads the text under `scroll`. A text node is a stretch of a line. A new line starts with
 * each element the page lays out as a block, and an empty line parts paragraphs and rows.
 */
function read(scroll: Elem, measure: DomRange): Buffer {
  interface Place {
    shown: boolean;
    /** Line breaks in the text are drawn. */
    pre: boolean;
    block: Elem;
    group: Elem;
    message: Elem | null;
  }
  const places = new Map<Elem, Place>();
  const placeOf = (parent: Elem): Place => {
    const known = places.get(parent);
    if (known) return known;
    const shown = !parent.closest(SKIP) && parent.checkVisibility({ visibilityProperty: true });
    let block = parent;
    let group: Elem | null = null;
    let pre = false;
    if (shown) {
      pre = /^(pre|break-spaces)/.test(getComputedStyle(parent).whiteSpace);
      while (block !== scroll && block.parentElement && /^(inline|contents)/.test(getComputedStyle(block).display)) {
        block = block.parentElement;
      }
      for (let e: Elem | null = block; e && e !== scroll; e = e.parentElement) {
        if (e.matches(GROUP)) group = e;
        if (e.matches(ROW)) {
          group ??= e;
          break;
        }
      }
    }
    const message = shown && !parent.closest(ASIDE) ? parent.closest(MESSAGE) : null;
    const place = { shown, pre, block, group: group ?? block, message };
    places.set(parent, place);
    return place;
  };

  const buffer: Buffer = { text: "", nodes: [], starts: [], index: new Map(), messages: [] };
  const walker = document.createTreeWalker(scroll, 4);
  let last: Place | null = null;
  let open: Elem | null = null;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement;
    if (!parent || !node.data) continue;
    const place = placeOf(parent);
    if (!place.shown) continue;
    let data = node.data;
    if (!place.pre) {
      // Blanks between two elements are drawn only inside a line.
      if (!data.trim()) {
        measure.setStart(node, 0);
        measure.setEnd(node, data.length);
        if (measure.getBoundingClientRect().width === 0) continue;
      }
      data = data.replace(/[\n\r\t]/g, " ");
    }
    if (last) buffer.text += place.block === last.block ? "" : place.group === last.group ? "\n" : "\n\n";
    buffer.index.set(node, buffer.text.length);
    buffer.starts.push(buffer.text.length);
    buffer.nodes.push(node);
    if (place.message && place.message !== open) {
      open = place.message;
      buffer.messages.push({ start: buffer.text.length, end: 0, own: open.matches(OWN) });
    }
    buffer.text += data;
    if (place.message) buffer.messages[buffer.messages.length - 1].end = buffer.text.length;
    last = place;
  }
  return buffer;
}

/** The node whose text holds `i`, or the one before a line break between nodes. */
function nodeAt(b: Buffer, i: number): number {
  let lo = 0;
  let hi = b.nodes.length - 1;
  let k = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (b.starts[mid] <= i) {
      k = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return k;
}

const markOf = (b: Buffer, i: number): Mark | null => {
  if (b.nodes.length === 0) return null;
  const k = nodeAt(b, i);
  return { node: b.nodes[k], offset: i - b.starts[k] };
};
const indexOf = (b: Buffer, mark: Mark | null): number | null => {
  const start = mark ? b.index.get(mark.node) : undefined;
  return mark && start !== undefined ? Math.min(start + mark.offset, b.text.length) : null;
};

/** One range per text node between two places of the text. */
function spans(b: Buffer, start: number, end: number): DomRange[] {
  const ranges: DomRange[] = [];
  for (let k = nodeAt(b, start); k < b.nodes.length && b.starts[k] < end; k++) {
    const from = Math.max(0, start - b.starts[k]);
    const to = Math.min(b.nodes[k].data.length, end - b.starts[k]);
    if (from >= to) continue;
    const range = document.createRange();
    range.setStart(b.nodes[k], from);
    range.setEnd(b.nodes[k], to);
    ranges.push(range);
  }
  return ranges;
}

function paint(name: string, ranges: DomRange[], priority: number): void {
  if (!CSS.highlights || !Highlight) return;
  if (ranges.length === 0) return CSS.highlights.delete(name);
  const highlight = new Highlight(...ranges);
  highlight.priority = priority;
  CSS.highlights.set(name, highlight);
}

/** Two boxes share a line of the page when the middle of one lies within the other. */
const sameLine = (a: Rect, b: Rect) => {
  const middle = (r: Rect) => (r.top + r.bottom) / 2;
  return (middle(a) > b.top && middle(a) < b.bottom) || (middle(b) > a.top && middle(b) < a.bottom);
};

/** What a key looks for beyond the page: the next match of a search, or the next message. */
interface Quest {
  /** Where the text on the page has what is looked for, in order. */
  places(b: Buffer): number[];
  /** A search goes on from the other end of the thread. A move to a message stops at the end. */
  wraps: boolean;
  /** What the label says when the thread has none. */
  none: string;
}

export interface Host {
  /** Draws the mode's label by the composer the thread belongs to. */
  show(area: Area, vim: Vim): void;
  /** Gives the focus back to the composer, and `key` to its Vim. */
  compose(area: Area, key?: string): void;
  /** Puts yanked text on the system clipboard. */
  yank(text: string): void;
}

export interface Thread {
  /** The hidden field that has the focus while the keys are the thread's. */
  sink: Elem;
  active(): boolean;
  /** Moves the keys from a composer to the thread above it. False when there is none to read. */
  enter(area: Area): boolean;
  /** Stops reading. The focus stays where it is. */
  leave(): void;
  /** The composer the keys came from, while they are the thread's. */
  area(): Area | null;
  /** The thread's Vim, while the keys are the thread's. */
  vim(): Vim | null;
  /** Gives the focus back to a composer. */
  compose(area: Area, key?: string): void;
  /** Takes one key. False when the key is the app's or the browser's. */
  key(event: KeyEvt): boolean;
  /** Draws the cursor and the label again. */
  redraw(): void;
  /** The text of the visual selection, for the browser's own copy. */
  selected(): string | null;
  stop(): void;
}

export function createThread(host: Host): Thread {
  const readings = new WeakMap<Elem, Reading>();
  const measure = document.createRange();
  // In a text field the app leaves plain keys alone, and Escape, `?` and Space with them.
  const sink = document.createElement("textarea");
  sink.setAttribute("readonly", "");
  sink.setAttribute("tabindex", "-1");
  sink.setAttribute("aria-label", "Agent thread, Vim keys");
  sink.setAttribute("data-testid", "vim-keys-thread");
  sink.style.cssText = "position:fixed;left:0;top:0;width:1px;height:1px;margin:0;padding:0;border:0;opacity:0;resize:none;pointer-events:none";
  document.body.append(sink);

  let current: { scroll: Elem; area: Area; reading: Reading; buffer: Buffer | null } | null = null;
  /** The place across the page `j` and `k` aim for while they follow one another. */
  let aim: { cursor: number; x: number } | null = null;
  let frame = false;

  const buffer = (): Buffer => {
    const c = current!;
    c.buffer ??= read(c.scroll, measure);
    return c.buffer;
  };
  // The page changed: a reply grows, a turn unfolds. The text is read again at the next key.
  // Until then only the cursor is drawn again, in case its own text was rewritten.
  const observer = new MutationObserver(() => {
    if (!current) return;
    current.buffer = null;
    if (frame) return;
    frame = true;
    requestAnimationFrame(() => {
      frame = false;
      if (!current) return;
      const { cursor, vim } = current.reading;
      // The app took the text under the cursor away: find it a new place.
      if (!cursor?.node.isConnected) return redraw();
      if (vim.prompt || cursor.offset >= cursor.node.data.length) return;
      const range = document.createRange();
      range.setStart(cursor.node, cursor.offset);
      range.setEnd(cursor.node, cursor.offset + 1);
      paint(NAME.cursor, [range], 3);
    });
  });

  /** The box of the character at `i`, or null where nothing is drawn: a line break, a folded blank. */
  const rectAt = (b: Buffer, i: number): Rect | null => {
    if (i < 0 || i >= b.text.length || b.nodes.length === 0) return null;
    const k = nodeAt(b, i);
    const offset = i - b.starts[k];
    if (offset >= b.nodes[k].data.length) return null;
    measure.setStart(b.nodes[k], offset);
    measure.setEnd(b.nodes[k], offset + 1);
    const rect = measure.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 ? rect : null;
  };
  /** The first drawn character from `i` on, in the direction of `step`. */
  const drawn = (b: Buffer, i: number, step = 1): { at: number; rect: Rect } | null => {
    for (let k = i, tries = 0; k >= 0 && k < b.text.length && tries < 4000; k += step, tries++) {
      const rect = rectAt(b, k);
      if (rect) return { at: k, rect };
    }
    return null;
  };
  /** The first drawn character whose box passes `test`. Boxes run down the page, so a search by halves finds it. */
  const first = (b: Buffer, test: (rect: Rect) => boolean): { at: number; rect: Rect } | null => {
    let lo = 0;
    let hi = b.text.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      const found = drawn(b, mid);
      if (!found || test(found.rect)) hi = mid;
      else lo = found.at + 1;
    }
    return drawn(b, lo);
  };
  /** On the line of the page that starts at `start`, the character nearest to `x`. */
  const along = (b: Buffer, start: { at: number; rect: Rect }, x: number): number => {
    let best = start.at;
    let nearest = Infinity;
    for (let i = start.at, gap = 0; i < b.text.length && gap < 200; i++) {
      const rect = rectAt(b, i);
      if (!rect) {
        gap++;
        continue;
      }
      if (!sameLine(rect, start.rect)) break;
      gap = 0;
      const distance = x < rect.left ? rect.left - x : x > rect.right ? x - rect.right : 0;
      if (distance < nearest) [best, nearest] = [i, distance];
    }
    return best;
  };
  const box = () => current!.scroll.getBoundingClientRect();
  /** The room `scrolloff` keeps, for a line as tall as `rect`. */
  const margin = (rect: Rect) => Math.min(SCROLLOFF * rect.height * 1.4, box().height / 3);
  /** The room kept at the top and the bottom: none at an end of the thread, where it cannot scroll. */
  const rooms = (rect: Rect | null) => {
    const { scrollTop, scrollHeight, clientHeight } = current!.scroll;
    const room = rect ? margin(rect) : 0;
    return { top: scrollTop <= 0 ? 0 : room, bottom: scrollTop >= scrollHeight - clientHeight - 1 ? 0 : room };
  };
  /** The start of the first line of the page whose top is at `y` or below. */
  const lineBelow = (b: Buffer, y: number) => first(b, (rect) => rect.top >= y - 1);
  /** The start of the last line of the page that ends at `y` or above. */
  const lineAbove = (b: Buffer, y: number) => {
    const over = first(b, (rect) => rect.bottom > y + 1);
    const last = drawn(b, over ? over.at - 1 : b.text.length - 1, -1);
    return last && first(b, (rect) => rect.bottom > last.rect.top + 1);
  };

  /**
   * Scrolls the thread. The app follows a reply as it grows until the reader scrolls up, and
   * it takes a scroll for the reader's only after a wheel or a key of its own. So a scroll
   * upward comes with a wheel event, which by itself scrolls nothing.
   */
  const scrollBy = (dy: number) => {
    const { scroll } = current!;
    if (dy < 0) scroll.dispatchEvent(new WheelEvent("wheel", { deltaY: -1 }));
    scroll.scrollTop += dy;
  };

  /** Scrolls until the box is inside the thread, with `scrolloff` to spare. One far away lands in the middle. */
  const reveal = (rect: Rect | null) => {
    if (!current || !rect) return;
    const view = box();
    const room = margin(rect);
    if (rect.bottom < view.top || rect.top > view.bottom) scrollBy((rect.top + rect.bottom) / 2 - (view.top + view.bottom) / 2);
    else if (rect.top < view.top + room) scrollBy(rect.top - (view.top + room));
    else if (rect.bottom > view.bottom - room) scrollBy(rect.bottom - (view.bottom - room));
  };

  /** After a move to the message that starts at `at`: when it is not in view from start to end, its start goes to the top. */
  const present = (b: Buffer, at: number) => {
    const message = b.messages.find((m) => m.start === at);
    const start = drawn(b, at)?.rect;
    const end = message && drawn(b, message.end - 1, -1)?.rect;
    if (!start || !end) return reveal(start ?? null);
    const view = box();
    const room = margin(start);
    if (start.top < view.top + room || end.bottom > view.bottom - room) scrollBy(start.top - (view.top + room));
  };

  /** A place for a cursor that has none: the last line the thread shows. */
  const place = (b: Buffer): number => {
    const view = box();
    const line = lineAbove(b, view.bottom) ?? drawn(b, b.text.length - 1, -1);
    return line?.at ?? 0;
  };

  /** Reads the page into Vim: the text, and where the cursor's node now is. */
  const pull = (): Buffer => {
    const { reading } = current!;
    const { vim } = reading;
    const b = buffer();
    vim.text = b.text;
    vim.messages = b.messages;
    const cursor = indexOf(b, reading.cursor);
    if (cursor === null) {
      vim.cursor = vim.anchor = place(b);
      if (vim.mode !== "normal") vim.mode = "normal";
    } else {
      vim.cursor = cursor;
      vim.anchor = indexOf(b, reading.anchor) ?? cursor;
    }
    return b;
  };

  /** Draws Vim's cursor, selection and matches, and remembers where they are. */
  const push = (b: Buffer) => {
    const { reading, area } = current!;
    const { vim } = reading;
    reading.cursor = markOf(b, vim.cursor);
    reading.anchor = markOf(b, vim.anchor);
    const pair = b.text.charCodeAt(vim.cursor) >= 0xd800 && b.text.charCodeAt(vim.cursor) <= 0xdbff;
    const [start, end] = selection(vim);
    const next = peek(vim);
    paint(NAME.search, matches(vim).flatMap((m) => spans(b, m.start, m.end)), 0);
    paint(NAME.match, next ? spans(b, next.start, next.end) : [], 1);
    paint(NAME.visual, vim.mode === "normal" ? [] : spans(b, start, end), 2);
    // While a pattern is typed the cursor waits where the search started.
    paint(NAME.cursor, vim.prompt ? [] : spans(b, vim.cursor, vim.cursor + (pair ? 2 : 1)), 3);
    host.show(area, vim);
  };
  const clear = () => {
    for (const name of Object.values(NAME)) CSS.highlights?.delete(name);
  };

  const redraw = () => {
    if (!current) return;
    push(pull());
  };

  /** `j` and `k` without a count: one line of the page down or up, towards the same place across. */
  const rowMove = (b: Buffer, vim: Vim, down: boolean): boolean => {
    const from = vim.cursor;
    const here = rectAt(b, from);
    if (!here) return false;
    const x = aim?.cursor === from ? aim.x : (here.left + here.right) / 2;
    const step = down ? 1 : -1;
    let line: Rect | null = null;
    let best = -1;
    let nearest = Infinity;
    for (let i = from + step, gap = 0; i >= 0 && i < b.text.length && gap < 4000; i += step) {
      const rect = rectAt(b, i);
      if (!rect) {
        gap++;
        continue;
      }
      gap = 0;
      if (!line && sameLine(rect, here)) continue;
      if (line && !sameLine(rect, line)) break;
      line ??= rect;
      const distance = x < rect.left ? rect.left - x : x > rect.right ? x - rect.right : 0;
      if (distance < nearest) [best, nearest] = [i, distance];
    }
    if (best >= 0) {
      moveTo(vim, best);
      aim = { cursor: vim.cursor, x };
    }
    return true;
  };

  /** Scrolls by `dy` and moves the cursor as far down the page, so it keeps its place in the view. */
  const page = (b: Buffer, vim: Vim, dy: number) => {
    const scroll = current!.scroll;
    const here = rectAt(b, vim.cursor) ?? drawn(b, vim.cursor)?.rect;
    if (!here) return;
    const before = scroll.scrollTop;
    scrollBy(dy);
    // At an end of the thread the view stops and the cursor travels the rest.
    const y = here.top + dy - (scroll.scrollTop - before);
    const last = drawn(b, b.text.length - 1, -1);
    const line = first(b, (rect) => rect.bottom > y + 1) ?? (last && first(b, (rect) => rect.bottom > last.rect.top + 1));
    if (line) moveTo(vim, along(b, line, (here.left + here.right) / 2));
  };

  /** Brings a cursor the thread scrolled away from back into view. True when it moved. */
  const keep = (b: Buffer, vim: Vim): boolean => {
    const here = rectAt(b, vim.cursor);
    const view = box();
    if (!here || (here.bottom > view.top && here.top < view.bottom)) return false;
    const room = rooms(here);
    const line = here.top < view.top ? lineBelow(b, view.top + room.top) : lineAbove(b, view.bottom - room.bottom);
    if (line) moveTo(vim, line.at);
    return line !== null;
  };
  /**
   * After the thread scrolled on its own. The wheel, or a reply that grows, takes the cursor
   * along. Right after a key the app may still be settling: it measures rows it has just
   * drawn and fits in the messages it fetched. Then the cursor stays and the view returns.
   */
  const follow = () => {
    if (!current || current.reading.vim.prompt || reaching) return;
    const b = pull();
    const { vim } = current.reading;
    if (Date.now() < held) {
      const rect = rectAt(b, vim.cursor);
      const view = box();
      if (rect && (rect.bottom < view.top || rect.top > view.bottom)) reveal(rect);
    } else if (keep(b, vim)) push(b);
  };
  /** Until when the cursor holds its place against a scroll of the app's. */
  let held = 0;
  let following = false;
  const onScroll = () => {
    if (following || !current) return;
    following = true;
    requestAnimationFrame(() => {
      following = false;
      follow();
    });
  };

  /** The search beyond the page that is under way. Any key stops it. */
  let reaching: { stopped: boolean } | null = null;

  /**
   * Finds the next match or message where the text on the page does not reach. Of a long
   * thread the app draws the rows near the view and the latest ones, and it fetches older
   * messages when the reader gets to the top. So this reads a screen at a time, up or down
   * from `from`, where the key was pressed: to the end of the thread, and a search then
   * around from the other end, as Vim wraps.
   */
  const reach = async (from: Mark | null, up: boolean, quest: Quest) => {
    const c = current!;
    const { scroll } = c;
    const { vim } = c.reading;
    const job = { stopped: false };
    reaching = job;
    const live = () => !job.stopped && current === c;
    // How far along the way a place is. Rows change height as the app draws them, and older
    // messages arrive above: the distance to the end behind the search stays the same.
    const way = (y: number) => (up ? scroll.scrollHeight - (y - box().top + scroll.scrollTop) : y - box().top + scroll.scrollTop);
    const start = indexOf(buffer(), from);
    const here = start === null ? null : rectAt(buffer(), start);
    const origin = here ? way(here.top) : way(up ? box().bottom : box().top);
    const home = scroll.scrollHeight - scroll.scrollTop;
    c.reading.cursor = from;
    vim.message = up ? "searching older messages" : "searching on";
    host.show(c.area, vim);

    /** The nearest place past `read`, as far as `until`. Null at the end of the thread or at `until`. */
    const sweep = async (read: number, until: number): Promise<{ b: Buffer; at: number; rect: Rect } | null> => {
      for (let quiet = 0; live(); ) {
        c.buffer = null;
        const b = buffer();
        vim.text = b.text;
        vim.messages = b.messages;
        const view = box();
        const edge = way(up ? view.top : view.bottom);
        const found = quest.places(b);
        for (let n = 0; n < found.length; n++) {
          const at = found[up ? found.length - 1 - n : n];
          const rect = rectAt(b, at);
          const place = rect ? way(rect.top) : -Infinity;
          if (!rect || place <= read + 1) continue;
          // Past the view, rows the app has not drawn may lie in between.
          if (place > edge || place > until + 1) break;
          return { b, at, rect };
        }
        read = Math.max(read, edge);
        if (read >= until) return null;
        const before = scroll.scrollTop;
        scrollBy(view.height * (up ? -0.8 : 0.8));
        if (scroll.scrollTop !== before) {
          quiet = 0;
          await sleep(40);
        } else if (!up) {
          return null;
        } else {
          // At the top the app fetches what comes before, when there is any.
          await sleep(100);
          quiet += 100;
          while (live() && scroll.querySelector(LOADING)) {
            quiet = 0;
            await sleep(50);
          }
          if (quiet >= START_MS) return null;
        }
      }
      return null;
    };

    let hit = await sweep(origin, Infinity);
    const around = !hit && quest.wraps && live();
    if (around) {
      scrollBy(up ? scroll.scrollHeight : -scroll.scrollTop);
      await sleep(80);
      hit = await sweep(-Infinity, origin);
    }
    if (reaching === job) reaching = null;
    if (!live()) return;
    if (hit) {
      vim.cursor = vim.anchor = hit.at;
      vim.message = !around ? null : up ? "hit TOP, continuing at BOTTOM" : "hit BOTTOM, continuing at TOP";
      if (quest.wraps) reveal(hit.rect);
      else present(hit.b, hit.at);
      held = Date.now() + HOLD_MS;
      return push(hit.b);
    }
    // The thread has none: back to where the key was pressed.
    scrollBy(scroll.scrollHeight - home - scroll.scrollTop);
    await sleep(60);
    if (current !== c) return;
    const b = pull();
    vim.message = quest.none;
    push(b);
  };

  const leave = () => {
    if (!current) return;
    if (reaching) reaching.stopped = true;
    reaching = null;
    current.scroll.removeEventListener("scroll", onScroll);
    current = null;
    aim = null;
    observer.disconnect();
    clear();
  };

  const threadOf = (area: Area): Elem | null => {
    for (const scroll of (area.closest(PANE) ?? document.body).querySelectorAll(SCROLL)) if (scroll.checkVisibility()) return scroll;
    return null;
  };

  const enter = (area: Area): boolean => {
    const scroll = threadOf(area);
    if (!scroll) return false;
    leave();
    let reading = readings.get(scroll);
    if (!reading) {
      reading = { vim: Object.assign(create("", 0), { mode: "normal", readonly: true }), cursor: null, anchor: null };
      readings.set(scroll, reading);
    }
    current = { scroll, area, reading, buffer: null };
    if (!buffer().text.trim()) {
      current = null;
      return false;
    }
    // A cursor left out of sight starts again at the bottom, next to the composer.
    const b = buffer();
    const at = indexOf(b, reading.cursor);
    const rect = at === null ? null : rectAt(b, at);
    const view = box();
    if (!rect || rect.bottom < view.top || rect.top > view.bottom) reading.cursor = null;
    reading.vim.pending = [];
    reading.vim.prompt = null;
    observer.observe(scroll, { childList: true, characterData: true, subtree: true });
    scroll.addEventListener("scroll", onScroll);
    sink.focus({ preventScroll: true });
    redraw();
    return true;
  };

  const key = (event: KeyEvt): boolean => {
    if (!current) return false;
    const { scroll, area, reading } = current;
    const { vim } = reading;
    if (!scroll.isConnected || !scroll.checkVisibility()) {
      // The tab changed under the thread: the keys go back to a composer.
      leave();
      host.compose(area);
      return false;
    }
    if (event.isComposing || event.metaKey || event.altKey) return false;
    if (reaching) {
      // A key stops the search for older matches where it is. Escape does only that.
      reaching.stopped = true;
      reaching = null;
      vim.message = null;
      reading.cursor = null;
      if (event.key === "Escape") {
        redraw();
        return true;
      }
    }
    let pressed = event.key;
    if (event.ctrlKey) {
      // The app's shortcuts run first and cancel the key they take: off a Mac, most of these.
      if (event.defaultPrevented) return false;
      const letter = pressed.toLowerCase();
      if (letter === "[") pressed = "Escape";
      else if (letter.length === 1 && "dufbey".includes(letter)) pressed = `<C-${letter}>`;
      else return false;
    } else if (!vim.prompt && !event.shiftKey) pressed = ARROWS[pressed] ?? pressed;

    const b = pull();
    const view = box();
    const here = rectAt(b, vim.cursor);
    const line = here ? here.height * 1.4 : 24;
    // Nothing is under way but a count: the keys below are the thread's own, not the editor's.
    const idle = vim.pending.every((k) => DIGIT.test(k));
    const counted = idle && vim.pending.length > 0;
    const zed = vim.pending[vim.pending.length - 1] === "z" && vim.pending.slice(0, -1).every((k) => DIGIT.test(k));
    const register = vim.register;
    const from = { cursor: vim.cursor, top: scroll.scrollTop, bottom: scroll.scrollTop >= scroll.scrollHeight - scroll.clientHeight - 1 };
    /** The key that began the command this key completes. */
    const lead = [...vim.pending, pressed].find((k) => !DIGIT.test(k)) ?? "";
    vim.message = null;
    let taken = true;
    let stay = false;

    if (zed) {
      vim.pending = [];
      const room = here ? margin(here) : 0;
      if (here && pressed === "t") scrollBy(here.top - (view.top + room));
      else if (here && pressed === "z") scrollBy((here.top + here.bottom) / 2 - (view.top + view.bottom) / 2);
      else if (here && pressed === "b") scrollBy(here.bottom - (view.bottom - room));
      stay = true;
    } else if (idle && pressed === "z") {
      vim.pending.push("z");
    } else if (idle && (pressed === "j" || pressed === "k")) {
      // By the lines of the page, also with a count and in visual mode: a paragraph is one long line.
      const times = counted ? Number(vim.pending.join("")) : 1;
      vim.pending = [];
      for (let n = 0; n < times; n++) if (!rowMove(b, vim, pressed === "j")) press(vim, pressed);
    } else if (idle && /^<C-[dufb]>$/.test(pressed)) {
      vim.pending = [];
      const half = pressed === "<C-d>" || pressed === "<C-u>";
      const down = pressed === "<C-d>" || pressed === "<C-f>";
      page(b, vim, (half ? view.height / 2 : view.height - 2 * line) * (down ? 1 : -1));
    } else if (idle && (pressed === "<C-e>" || pressed === "<C-y>")) {
      vim.pending = [];
      scrollBy(pressed === "<C-e>" ? line : -line);
      stay = true;
    } else if (idle && !counted && (pressed === "H" || pressed === "M" || pressed === "L")) {
      const room = rooms(here);
      const to =
        pressed === "H"
          ? lineBelow(b, view.top + room.top)
          : pressed === "L"
            ? lineAbove(b, view.bottom - room.bottom)
            : first(b, (rect) => rect.bottom > (view.top + view.bottom) / 2);
      if (to) moveTo(vim, to.at);
    } else if (idle && !counted && vim.mode === "normal" && pressed === "Enter") {
      const target = markOf(b, vim.cursor)?.node.parentElement?.closest(PRESSABLE);
      if (target && scroll.contains(target)) target.click();
    } else if (idle && !counted && vim.mode === "normal" && pressed.length === 1 && "iaIAoO".includes(pressed)) {
      leave();
      host.compose(area, pressed);
      return true;
    } else if (pressed.startsWith("<C-")) {
      // A scroll key in the middle of a command or a pattern does nothing.
    } else {
      taken = press(vim, pressed);
      // `G` also follows the thread again as it grows.
      if (idle && !counted && pressed === "G") scroll.scrollTop = scroll.scrollHeight;
    }

    if (vim.register !== register) host.yank(vim.register.text);
    if (aim && aim.cursor !== vim.cursor) aim = null;
    const done = taken && lead !== "" && vim.pending.length === 0 && !vim.prompt;
    const searched = done && "?/nN#*".includes(lead);
    /** `{ }` and `[[ ]]`: a move to a message. */
    const hopped = done && "{}[]".includes(lead);
    if (vim.mode === "normal" && (searched || hopped)) {
      // What the editor found is the next match or message in the text on the page. One out
      // of view may lie past rows the app has not drawn, and older messages past the top.
      const found = rectAt(b, vim.cursor);
      const seen = found !== null && found.bottom > view.top && found.top < view.bottom;
      const sparse = scroll.querySelector(VIRTUAL) !== null;
      const moved = vim.cursor !== from.cursor;
      if (vim.missed === "above" || (sparse && (vim.missed === "below" || (moved && !seen)))) {
        const up = vim.missed ? vim.missed === "above" : vim.cursor < from.cursor;
        const own = lead === "[" || lead === "]";
        vim.cursor = vim.anchor = from.cursor;
        const quest: Quest = searched
          ? { places: () => matches(vim).map((m) => m.start), wraps: true, none: notFound(vim.searched?.pattern ?? "") }
          : { places: (page) => page.messages.filter((m) => m.own || !own).map((m) => m.start), wraps: false, none: up ? "no earlier message" : "no later message" };
        void reach(markOf(b, from.cursor), up, quest);
        return true;
      }
    }
    const next = peek(vim);
    if (stay) keep(b, vim);
    else if (hopped && vim.cursor !== from.cursor) present(b, vim.cursor);
    else reveal(next ? rectAt(b, next.start) : (rectAt(b, vim.cursor) ?? drawn(b, vim.cursor)?.rect ?? null));
    held = stay ? 0 : Date.now() + HOLD_MS;
    // A cursor that moves up is reading: the app stops following the reply as it grows.
    if (vim.cursor < from.cursor && from.bottom && scroll.scrollTop >= from.top) scrollBy(-2);
    push(b);
    return taken;
  };

  const selected = (): string | null => {
    if (!current || current.reading.vim.mode === "normal") return null;
    const { vim } = current.reading;
    const [start, end] = selection(vim);
    return vim.text.slice(start, end) + (vim.mode === "visual-line" ? "\n" : "");
  };

  return {
    sink,
    active: () => current !== null,
    enter,
    leave,
    area: () => current?.area ?? null,
    vim: () => current?.reading.vim ?? null,
    compose: (area, key) => host.compose(area, key),
    key,
    redraw,
    selected,
    stop() {
      leave();
      sink.remove();
    },
  };
}
