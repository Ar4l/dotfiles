import { Platform } from "react-native";
import {
  type Area,
  type CopyEvt,
  type Elem,
  type KeyEvt,
  type Listener,
  type TargetEvt,
  Event,
  ResizeObserver,
  document,
  getComputedStyle,
  getSelection,
  localStorage,
  navigator,
  window,
} from "./dom";
import { hasPane, isReplay, replay } from "./app";
import { type Move, isJump, navigate } from "./keys";
import { createThread, threadStyles } from "./thread";
import { type Vim, create, moveTo, press, puts, select, selection } from "./vim";

// App internals this plugin leans on; README.md lists them.
const COMPOSER = "[data-testid='message-input-root']";
const AUTOCOMPLETE = "[data-testid='composer-autocomplete-popover']";
/** Set while the keys are turned off. */
const OFF = "vim-keys:off";
/** Outside insert mode the arrow keys move the block: the browser would only collapse it. */
const ARROWS: Record<string, string> = { ArrowLeft: "h", ArrowRight: "l", ArrowUp: "k", ArrowDown: "j", Home: "0", End: "$" };
const METER = "[data-testid='context-window-meter']";
const LABEL = { insert: "INSERT", normal: "NORMAL", visual: "VISUAL", "visual-line": "V-LINE" };
// White text reads on each of these in the light and the dark theme.
const COLOR = { insert: "#15803d", normal: "#2563eb", visual: "#9333ea", "visual-line": "#9333ea" };
/** The attribute that carries a composer's mode, for the styles below. */
const MODE = "data-vim-keys";
// Normal mode's block is the selected character, in the mode's colour. An empty line has no
// character to select, so the caret itself is a block there, where the browser can draw one.
const STYLES =
  `textarea[${MODE}="normal"]{caret-shape:block;caret-animation:manual;caret-color:${COLOR.normal}}` +
  `textarea[${MODE}="normal"]::selection{background:${COLOR.normal};color:#fff}` +
  `textarea[${MODE}^="visual"]::selection{background:${COLOR.visual};color:#fff}` +
  threadStyles(COLOR);
/** The composers of a pane: one per tab, and only the tab on top is visible. */
const PANE = "[data-testid^='workspace-pane-']";
/** How long a composer that gets the focus after a key for the app is still put in normal mode. */
const ARRIVE_MS = 1000;
/** How long the app may take to focus the pane a key asked for, before the keys return to where they were. */
const RETURN_MS = 600;
/** How long a command begun outside a composer and a thread waits for its next key. */
const STRAY_MS = 2000;
/** Where plain keys are text, or a program's: Ctrl+H there is not a key for the app. */
const TYPING = "input,textarea,select,[contenteditable='true'],.xterm,[data-testid='terminal-surface']";
/** How long a put waits for the system clipboard before it uses what Vim yanked last. */
const CLIPBOARD_WAIT = 300;

interface Running {
  stop(): void;
  toggle(): void;
}

/** Turns the keys off or on, as the command-center item does. */
export function toggle(): void {
  (window.__vimKeys as Partial<Running> | undefined)?.toggle?.();
}

/**
 * Starts the keys once per window, however many hosts evaluate the bundle. The bundle
 * evaluated last runs them: after `paseo plugin reload` on one host, that is the new code.
 */
export function start(): () => void {
  if (Platform.OS !== "web") return () => {};
  (window.__vimKeys as Partial<Running> | undefined)?.stop?.();
  const running = run();
  window.__vimKeys = running;
  return () => {
    if (window.__vimKeys !== running) return;
    running.stop();
    delete window.__vimKeys;
  };
}

/** Replaces the textarea's text the way typing does, so the app and the browser's own undo follow. */
function write(area: Area, next: string): void {
  const text = area.value;
  let a = 0;
  while (a < text.length && a < next.length && text[a] === next[a]) a++;
  let b = 0;
  while (b < text.length - a && b < next.length - a && text[text.length - 1 - b] === next[next.length - 1 - b]) b++;
  area.setSelectionRange(a, text.length - b);
  const added = next.slice(a, next.length - b);
  if (added ? document.execCommand("insertText", false, added) : document.execCommand("delete")) {
    if (area.value === next) return;
  }
  // A browser without execCommand for text fields: set the value React reads and tell it.
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(area), "value")?.set;
  setter?.call(area, next);
  area.dispatchEvent(new Event("input", { bubbles: true }));
}

function run(): Running {
  const vims = new WeakMap<Area, Vim>();
  const off = () => localStorage.getItem(OFF) !== null;
  const composerOf = (target: Elem | null) =>
    target?.tagName === "TEXTAREA" && target.closest(COMPOSER) ? (target as Area) : null;

  // The app binds Escape in the composer to Interrupt agent, and leaves Escape alone while a
  // popover is open (its `keyBelongsToDomPopover`). This empty one is open while a composer
  // with the keys on has the focus, so Escape there is Vim's in every mode.
  const guard = document.createElement("div");
  guard.setAttribute("popover", "manual");
  guard.setAttribute("aria-hidden", "true");
  guard.style.cssText = "position:fixed;width:0;height:0;margin:0;padding:0;border:0;opacity:0;pointer-events:none";
  const badge = document.createElement("div");
  badge.setAttribute("data-testid", "vim-keys-mode");
  badge.setAttribute("aria-hidden", "true");
  const styles = document.createElement("style");
  styles.textContent = STYLES;
  document.head.append(styles);
  document.body.append(guard, badge);

  const guarded = () => guard.matches(":popover-open");
  const setGuard = (open: boolean) => {
    try {
      if (open !== guarded()) (open ? guard.showPopover : guard.hidePopover)?.call(guard);
    } catch {
      // No Popover API: Escape is Vim's and also interrupts a running agent.
    }
  };

  // The composer grows with its text and its toolbar moves: the label follows.
  let watched: Elem | null = null;
  const observer = ResizeObserver ? new ResizeObserver(() => redraw()) : null;
  const watch = (root: Elem | null) => {
    if (root === watched) return;
    observer?.disconnect();
    watched = root;
    if (root) observer?.observe(root);
  };

  /**
   * Draws the mode of the composer that has the focus, and opens the guard while it has it.
   * With `reading`, the mode is the thread's above that composer.
   */
  const show = (area: Area | null, reading?: Vim) => {
    const vim = reading ?? (area && !off() && document.activeElement === area ? vims.get(area) : undefined);
    setGuard(Boolean(vim) && !reading);
    const root = area && vim ? (area.closest(COMPOSER) ?? area) : null;
    watch(root);
    if (!area || !vim || !root) {
      badge.style.cssText = "display:none";
      return;
    }
    if (!reading) area.setAttribute(MODE, vim.mode);
    badge.textContent = [LABEL[vim.mode], vim.pending.join(""), vim.message].filter(Boolean).join(" ");
    // Left of the context window meter, or above the composer's corner when it has none.
    const meter = root.querySelector(METER)?.getBoundingClientRect();
    const box = root.getBoundingClientRect();
    const place = meter?.width
      ? `right:${window.innerWidth - meter.left + 8}px;top:${meter.top + meter.height / 2}px;transform:translateY(-50%)`
      : `right:${window.innerWidth - box.right + 14}px;bottom:${window.innerHeight - box.top + 3}px`;
    badge.style.cssText =
      `position:fixed;z-index:2147483647;pointer-events:none;${place};padding:4px 6px;border-radius:4px;` +
      `font:700 9px/1 ${getComputedStyle(area).fontFamily};letter-spacing:.08em;white-space:nowrap;` +
      `color:#fff;background:${COLOR[vim.mode]}`;
  };
  const redraw = (): void => (thread.active() ? thread.redraw() : show(composerOf(document.activeElement)));

  /** Reads the textarea into its Vim: the text, and a selection the user or the app made. */
  const pull = (area: Area): Vim => {
    let vim = vims.get(area);
    if (!vim) {
      vim = create(area.value, area.selectionStart);
      vims.set(area, vim);
    }
    vim.text = area.value;
    select(vim, area.selectionStart, area.selectionEnd, area.selectionDirection === "backward");
    return vim;
  };

  /** Writes a Vim's text and cursor to its textarea. */
  const push = (area: Area, vim: Vim) => {
    if (area.value !== vim.text) write(area, vim.text);
    const [start, end, backward] = selection(vim);
    if (area.selectionStart !== start || area.selectionEnd !== end) {
      area.setSelectionRange(start, end, backward ? "backward" : "forward");
    }
  };

  /** A message sent from normal mode leaves an empty composer, which starts in insert mode. */
  const afterSend = (area: Area, vim: Vim) => {
    for (const wait of [60, 400]) {
      setTimeout(() => {
        if (area.value !== "" || vim.mode === "insert") return;
        vim.text = "";
        vim.mode = "insert";
        vim.cursor = 0;
        vim.pending = [];
        if (document.activeElement === area) push(area, vim);
        show(area);
      }, wait);
    }
  };

  // `j` and `k` without a count move by the lines the composer wraps, as `gj` and `gk` do.
  // The column they aim for is kept while they follow one another.
  let aim: { area: Area; cursor: number; column: number } | null = null;
  const rowMove = (area: Area, vim: Vim, down: boolean): boolean => {
    const caret = getSelection();
    if (!caret?.modify) return false;
    const from = vim.cursor;
    area.setSelectionRange(from, from);
    caret.modify("move", "backward", "lineboundary");
    const row = area.selectionStart;
    area.setSelectionRange(from, from);
    caret.modify("move", down ? "forward" : "backward", "line");
    caret.modify("move", "backward", "lineboundary");
    const start = area.selectionStart;
    caret.modify("move", "forward", "lineboundary");
    const end = area.selectionStart;
    // On the first and the last line the browser moves within the line: stay.
    if (start !== row) {
      const column = aim?.area === area && aim.cursor === from ? aim.column : from - row;
      moveTo(vim, Math.min(start + column, Math.max(start, end - 1)));
      aim = { area, cursor: vim.cursor, column };
    }
    return true;
  };

  /** Gives one key to a composer's Vim and writes the result. False when the key is the app's. */
  const feed = (area: Area, vim: Vim, key: string): boolean => {
    const plain = vim.mode === "normal" && vim.pending.length === 0;
    const register = vim.register;
    const taken = plain && (key === "j" || key === "k") ? rowMove(area, vim, key === "j") || press(vim, key) : press(vim, key);
    if (taken) push(area, vim);
    // `clipboard=unnamedplus`: what Vim yanks or deletes is on the system clipboard.
    if (vim.register !== register) navigator.clipboard?.writeText(vim.register.text).catch(() => {});
    return taken;
  };

  // A put reads the system clipboard first, which takes a moment. The keys pressed
  // meanwhile wait for it.
  let waiting: string[] | null = null;
  const put = (area: Area, vim: Vim, key: string) => {
    waiting = [key];
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), CLIPBOARD_WAIT));
    const read = navigator.clipboard?.readText().catch(() => null) ?? Promise.resolve(null);
    void Promise.race([read, timeout]).then((text) => {
      const keys = waiting ?? [];
      waiting = null;
      if (document.activeElement !== area) return;
      // Text copied elsewhere replaces what Vim yanked last. A final line break makes it lines.
      if (text && text !== vim.register.text) vim.register = { text, linewise: text.endsWith("\n") };
      for (const k of keys) {
        vim.text = area.value;
        feed(area, vim, k);
      }
      show(area);
    });
  };

  /** The composer on top in the pane of `area`, which may have left the page. */
  const composerNear = (area: Area): Area | null => {
    if (area.isConnected && area.checkVisibility()) return area;
    const areas = [...document.querySelectorAll(`${COMPOSER} textarea`)].filter((other) => other.checkVisibility());
    const pane = area.closest(PANE);
    return ((areas.find((other) => other.closest(PANE) === pane) ?? areas[0]) as Area | undefined) ?? null;
  };

  const thread = createThread({
    show,
    compose(from, key) {
      const area = composerNear(from);
      if (!area) return;
      area.focus();
      if (!key || off()) return;
      const vim = pull(area);
      feed(area, vim, key);
      show(area);
    },
    yank: (text) => void navigator.clipboard?.writeText(text).catch(() => {}),
  });

  /** The name the app's keys know a key by: `<C-h>`, `<Space>`, or the key itself. Null with other modifiers. */
  const named = (event: KeyEvt): string | null => {
    if (event.metaKey || event.altKey) return null;
    if (!event.ctrlKey) return event.key === " " ? "<Space>" : event.key;
    const letter = event.key.toLowerCase();
    // The app's shortcuts run first and cancel the key they take.
    return !event.defaultPrevented && letter.length === 1 && "hjklw".includes(letter) ? `<C-${letter}>` : null;
  };

  /** Until when a composer that gets the focus is put in normal mode: a key for the app moved the focus there. */
  let arriving = 0;
  /** The keys of a command for the app, pressed where no Vim holds them. */
  const stray: string[] = [];
  let strayUntil = 0;

  /**
   * Goes where a key asked. The thread is the window above its composer, so Ctrl+K and
   * Ctrl+J move between those two first. Every other move is a shortcut of the app's.
   */
  const go = (move: Move, from: { area: Area | null; reading: boolean; target: Elem | null }) => {
    const { area, reading } = from;
    arriving = Date.now() + ARRIVE_MS;
    if (reading && area && move.action === "pane-down") {
      thread.leave();
      return thread.compose(area);
    }
    if (!reading && area && move.action === "pane-up" && thread.enter(area)) return;
    if (!move.action.startsWith("pane-")) return void replay(move);
    const origin = area ?? from.target;
    const pane = origin?.closest(PANE);
    if (pane && !hasPane(pane, move.action)) return;
    // The app moves between panes only while no text field has the focus. It then focuses
    // the pane it chose. When it chose none, the keys return to where they were.
    if (reading) thread.leave();
    document.activeElement?.blur();
    show(null);
    replay(move);
    setTimeout(() => {
      const active = document.activeElement;
      if (active && active !== document.body) return;
      if (!reading || !area || !thread.enter(area)) origin?.focus();
    }, RETURN_MS);
  };

  /** Gives a key to the commands for the app. `pending` holds the keys of a command under way. True when the key was theirs. */
  const steer = (pending: string[], name: string, from: Parameters<typeof go>[1]): boolean => {
    const keys = [...pending, name];
    const move = navigate(keys);
    if (move === "more") pending.push(name);
    else if (move) {
      pending.length = 0;
      go(move, from);
    } else if (navigate(pending) === "more" && !isJump(keys)) {
      // A command for the app that ends in a key it does not know is dropped.
      pending.length = 0;
    } else return false;
    return true;
  };

  const onKey = (event: KeyEvt) => {
    if (isReplay() || off() || event.isComposing) return;
    const take = () => {
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    const name = named(event);
    if (event.target === thread.sink) {
      const vim = thread.vim();
      const from = { area: thread.area(), reading: vim !== null, target: event.target };
      // A pattern being typed and a selection keep their keys.
      if (name && (!vim || (vim.mode === "normal" && !vim.prompt)) && steer(vim?.pending ?? stray, name, from)) {
        take();
        thread.redraw();
      } else if (vim && thread.key(event)) take();
      return;
    }
    const area = composerOf(event.target);
    if (!area) {
      // Outside a text field Ctrl+H, J, K, L and Ctrl+W still move between panes: a pane
      // may hold no composer. The key after Ctrl+W has to follow soon.
      if (Date.now() > strayUntil) stray.length = 0;
      const ours = name !== null && (stray.length > 0 || /^<C-[hjklw]>$/.test(name));
      if (ours && !event.target?.closest(TYPING) && steer(stray, name, { area: null, reading: false, target: event.target })) take();
      strayUntil = Date.now() + STRAY_MS;
      return;
    }
    if (event.metaKey || event.altKey) return;
    let key = event.key;
    if (event.ctrlKey) {
      // Ctrl+[ is Escape, unless the app has it: its shortcuts run first and cancel the key.
      if (key === "[" && !event.defaultPrevented) key = "Escape";
      else if (key.toLowerCase() === "r") key = "<C-r>";
      else if (name) key = name;
      else return;
    }
    if (waiting) {
      take();
      waiting.push(key);
      return;
    }
    const vim = pull(area);
    if (vim.mode === "insert" && key.startsWith("<C-")) return;
    const normal = vim.mode !== "insert";
    if (vim.mode === "normal" && name && steer(vim.pending, name, { area, reading: false, target: area })) {
      take();
      // The keys may have gone to the thread, which then drew the label.
      if (document.activeElement === area) show(area);
      return;
    }
    if (key.startsWith("<C-") && key !== "<C-r>") {
      // In visual mode these do nothing: on a Mac the browser would cut text.
      take();
      return;
    }
    // While the app lists commands or files, the arrows walk that list.
    const listed = document.querySelector(AUTOCOMPLETE) !== null;
    if (normal && !listed && !event.shiftKey && area.value !== "") key = ARROWS[key] ?? key;
    // Natively Shift+Enter would replace the block with a line break.
    if (normal && key === "Enter" && event.shiftKey) key = "<S-CR>";
    if (puts(vim, key)) {
      take();
      put(area, vim, key);
    } else if (feed(area, vim, key)) {
      take();
    } else if (normal && key === "Enter") {
      afterSend(area, vim);
    }
    show(area);
  };

  /** A click, a drag or an arrow key moved the caret: put the block back, or select. */
  const onSelection = () => {
    const area = composerOf(document.activeElement);
    if (!area || off() || waiting) return;
    const vim = pull(area);
    if (vim.mode !== "insert") push(area, vim);
    show(area);
  };

  const onFocus = (event: TargetEvt) => {
    const area = composerOf(event.target);
    if (!area || off()) return;
    const vim = pull(area);
    // A key for the app brought the focus here from normal mode: the mode comes along.
    if (Date.now() < arriving && vim.mode === "insert") press(vim, "Escape");
    if (vim.mode !== "insert") push(area, vim);
    show(area);
  };

  /** Text the app inserts into a blurred composer must not replace the character under the block. */
  const collapse = (area: Area) => {
    const vim = vims.get(area);
    if (vim?.mode === "normal") area.setSelectionRange(vim.cursor, vim.cursor);
  };
  const onBlur = (event: TargetEvt) => {
    if (event.target === thread.sink) {
      // The focus went elsewhere: a click, a shortcut of the app. A window that only lost
      // the focus keeps the thread.
      setTimeout(() => {
        if (document.activeElement === thread.sink || !thread.active()) return;
        thread.leave();
        redraw();
      }, 0);
      return;
    }
    const area = composerOf(event.target);
    if (!area) return;
    if (!off()) collapse(area);
    show(null);
  };
  /** Cmd+V in normal mode goes before the block, like `P`. */
  const onPaste = (event: TargetEvt) => {
    const area = composerOf(event.target);
    if (area && !off()) collapse(area);
  };
  /** Cmd+C in the thread copies what visual mode has selected. */
  const onCopy = (event: CopyEvt) => {
    const text = event.target === thread.sink ? thread.selected() : null;
    if (text === null) return;
    event.clipboardData?.setData("text/plain", text);
    event.preventDefault();
  };
  const unmark = () => {
    for (const area of document.querySelectorAll(`textarea[${MODE}]`)) area.removeAttribute(MODE);
  };

  const listeners: [{ addEventListener: typeof window.addEventListener; removeEventListener: typeof window.removeEventListener }, string, Listener][] = [
    [window, "keydown", onKey],
    [window, "focusin", onFocus],
    [window, "focusout", onBlur],
    [window, "paste", onPaste],
    [window, "copy", onCopy],
    [window, "input", redraw],
    [window, "resize", redraw],
    [document, "selectionchange", onSelection],
  ];
  for (const [target, type, listener] of listeners) target.addEventListener(type, listener, true);
  redraw();

  return {
    stop() {
      for (const [target, type, listener] of listeners) target.removeEventListener(type, listener, true);
      thread.stop();
      setGuard(false);
      watch(null);
      unmark();
      guard.remove();
      badge.remove();
      styles.remove();
    },
    toggle() {
      const reading = thread.area();
      thread.leave();
      if (reading) thread.compose(reading);
      const area = composerOf(document.activeElement);
      if (off()) localStorage.removeItem(OFF);
      else {
        localStorage.setItem(OFF, "1");
        if (area) collapse(area);
        unmark();
      }
      if (area && !off()) {
        const vim = pull(area);
        if (vim.mode !== "insert") push(area, vim);
      }
      show(area);
    },
  };
}
