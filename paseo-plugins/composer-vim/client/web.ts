import { Platform } from "react-native";
import {
  type Area,
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
import { type Vim, create, moveTo, press, puts, select, selection } from "./vim";

// App internals this plugin leans on; README.md lists them.
const COMPOSER = "[data-testid='message-input-root']";
const AUTOCOMPLETE = "[data-testid='composer-autocomplete-popover']";
/** Set while the keys are turned off. */
const OFF = "composer-vim:off";
/** Outside insert mode the arrow keys move the block: the browser would only collapse it. */
const ARROWS: Record<string, string> = { ArrowLeft: "h", ArrowRight: "l", ArrowUp: "k", ArrowDown: "j", Home: "0", End: "$" };
const METER = "[data-testid='context-window-meter']";
const LABEL = { insert: "INSERT", normal: "NORMAL", visual: "VISUAL", "visual-line": "V-LINE" };
// White text reads on each of these in the light and the dark theme.
const COLOR = { insert: "#15803d", normal: "#2563eb", visual: "#9333ea", "visual-line": "#9333ea" };
/** The attribute that carries a composer's mode, for the styles below. */
const MODE = "data-composer-vim";
// Normal mode's block is the selected character, in the mode's colour. An empty line has no
// character to select, so the caret itself is a block there, where the browser can draw one.
const STYLES =
  `textarea[${MODE}="normal"]{caret-shape:block;caret-animation:manual;caret-color:${COLOR.normal}}` +
  `textarea[${MODE}="normal"]::selection{background:${COLOR.normal};color:#fff}` +
  `textarea[${MODE}^="visual"]::selection{background:${COLOR.visual};color:#fff}`;
/** How long a put waits for the system clipboard before it uses what Vim yanked last. */
const CLIPBOARD_WAIT = 300;

interface Running {
  stop(): void;
  toggle(): void;
}

/** Turns the keys off or on, as the command-center item does. */
export function toggle(): void {
  (window.__composerVim as Partial<Running> | undefined)?.toggle?.();
}

/**
 * Starts the keys once per window, however many hosts evaluate the bundle. The bundle
 * evaluated last runs them: after `paseo plugin reload` on one host, that is the new code.
 */
export function start(): () => void {
  if (Platform.OS !== "web") return () => {};
  (window.__composerVim as Partial<Running> | undefined)?.stop?.();
  const running = run();
  window.__composerVim = running;
  return () => {
    if (window.__composerVim !== running) return;
    running.stop();
    delete window.__composerVim;
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
  badge.setAttribute("data-testid", "composer-vim-mode");
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

  /** Draws the mode of the composer that has the focus, and opens the guard while it has it. */
  const show = (area: Area | null) => {
    const vim = area && !off() && document.activeElement === area ? vims.get(area) : undefined;
    setGuard(Boolean(vim));
    const root = area && vim ? (area.closest(COMPOSER) ?? area) : null;
    watch(root);
    if (!area || !vim || !root) {
      badge.style.cssText = "display:none";
      return;
    }
    area.setAttribute(MODE, vim.mode);
    badge.textContent = [LABEL[vim.mode], vim.pending.join("")].filter(Boolean).join(" ");
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
  const redraw = () => show(composerOf(document.activeElement));

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

  const onKey = (event: KeyEvt) => {
    const area = composerOf(event.target);
    if (!area || off() || event.isComposing || event.metaKey || event.altKey) return;
    let key = event.key;
    if (event.ctrlKey) {
      // Ctrl+[ is Escape, unless the app has it: its shortcuts run first and cancel the key.
      if (key === "[" && !event.defaultPrevented) key = "Escape";
      else if (key.toLowerCase() === "r") key = "<C-r>";
      else return;
    }
    const take = () => {
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    if (waiting) {
      take();
      waiting.push(key);
      return;
    }
    const vim = pull(area);
    if (vim.mode === "insert" && key === "<C-r>") return;
    const normal = vim.mode !== "insert";
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
    if (vim.mode !== "insert") push(area, vim);
    show(area);
  };

  /** Text the app inserts into a blurred composer must not replace the character under the block. */
  const collapse = (area: Area) => {
    const vim = vims.get(area);
    if (vim?.mode === "normal") area.setSelectionRange(vim.cursor, vim.cursor);
  };
  const onBlur = (event: TargetEvt) => {
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
  const unmark = () => {
    for (const area of document.querySelectorAll(`textarea[${MODE}]`)) area.removeAttribute(MODE);
  };

  const listeners: [{ addEventListener: typeof window.addEventListener; removeEventListener: typeof window.removeEventListener }, string, Listener][] = [
    [window, "keydown", onKey],
    [window, "focusin", onFocus],
    [window, "focusout", onBlur],
    [window, "paste", onPaste],
    [window, "input", redraw],
    [window, "resize", redraw],
    [document, "selectionchange", onSelection],
  ];
  for (const [target, type, listener] of listeners) target.addEventListener(type, listener, true);
  redraw();

  return {
    stop() {
      for (const [target, type, listener] of listeners) target.removeEventListener(type, listener, true);
      setGuard(false);
      watch(null);
      unmark();
      guard.remove();
      badge.remove();
      styles.remove();
    },
    toggle() {
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
