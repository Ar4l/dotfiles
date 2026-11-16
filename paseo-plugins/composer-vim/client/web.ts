import { Platform } from "react-native";
import { type Area, type Elem, type KeyEvt, type Listener, type TargetEvt, Event, document, getComputedStyle, localStorage, window } from "./dom";
import { type Vim, create, ownsEscape, press, select, selection } from "./vim";

// App internals this plugin leans on; README.md lists them.
const COMPOSER = "[data-testid='message-input-root']";
const AUTOCOMPLETE = "[data-testid='composer-autocomplete-popover']";
/** Set while the keys are turned off. */
const OFF = "composer-vim:off";
/** Outside insert mode the arrow keys move the block: the browser would only collapse it. */
const ARROWS: Record<string, string> = { ArrowLeft: "h", ArrowRight: "l", ArrowUp: "k", ArrowDown: "j", Home: "0", End: "$" };
const LABEL = { insert: "INSERT", normal: "NORMAL", visual: "VISUAL", "visual-line": "V-LINE" };

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

  // The app leaves Escape alone while a popover is open (its `keyBelongsToDomPopover`), so
  // this empty one is open whenever Escape is Vim's. Otherwise Escape interrupts the agent.
  const guard = document.createElement("div");
  guard.setAttribute("popover", "manual");
  guard.setAttribute("aria-hidden", "true");
  guard.style.cssText = "position:fixed;width:0;height:0;margin:0;padding:0;border:0;opacity:0;pointer-events:none";
  const badge = document.createElement("div");
  badge.setAttribute("data-testid", "composer-vim-mode");
  badge.setAttribute("aria-hidden", "true");
  document.body.append(guard, badge);

  const guarded = () => guard.matches(":popover-open");
  const setGuard = (open: boolean) => {
    try {
      if (open !== guarded()) (open ? guard.showPopover : guard.hidePopover)?.call(guard);
    } catch {
      // No Popover API: Escape leaves insert mode and also interrupts a running agent.
    }
  };

  /** Draws the mode by the composer that has the focus, and opens or closes the guard. */
  const show = (area: Area | null) => {
    const vim = area && !off() && document.activeElement === area ? vims.get(area) : undefined;
    setGuard(Boolean(vim && ownsEscape(vim)));
    if (!area || !vim) {
      badge.style.cssText = "display:none";
      return;
    }
    const box = (area.closest(COMPOSER) ?? area).getBoundingClientRect();
    const { color, fontFamily } = getComputedStyle(area);
    badge.textContent = [LABEL[vim.mode], vim.pending.join("")].filter(Boolean).join("  ");
    badge.style.cssText =
      `position:fixed;z-index:2147483647;pointer-events:none;right:${window.innerWidth - box.right + 14}px;` +
      `bottom:${window.innerHeight - box.top + 2}px;font:600 9px/1 ${fontFamily};letter-spacing:.08em;` +
      `color:${color};opacity:${vim.mode === "insert" ? 0.4 : 0.75}`;
  };

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
    const vim = pull(area);
    if (vim.mode === "insert" && key === "<C-r>") return;
    const normal = vim.mode !== "insert";
    // While the app lists commands or files, the arrows walk that list.
    const listed = document.querySelector(AUTOCOMPLETE) !== null;
    if (normal && !listed && !event.shiftKey && area.value !== "") key = ARROWS[key] ?? key;
    if (press(vim, key)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      push(area, vim);
    } else if (normal && key === "Enter") {
      afterSend(area, vim);
    }
    show(area);
  };

  /** A click, a drag or an arrow key moved the caret: put the block back, or select. */
  const onSelection = () => {
    const area = composerOf(document.activeElement);
    if (!area || off()) return;
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
  /** Paste in normal mode goes before the block, like `P`. */
  const onPaste = (event: TargetEvt) => {
    const area = composerOf(event.target);
    if (area && !off()) collapse(area);
  };
  const redraw = () => show(composerOf(document.activeElement));

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
      guard.remove();
      badge.remove();
    },
    toggle() {
      const area = composerOf(document.activeElement);
      if (off()) localStorage.removeItem(OFF);
      else {
        localStorage.setItem(OFF, "1");
        if (area) collapse(area);
      }
      if (area && !off()) {
        const vim = pull(area);
        if (vim.mode !== "insert") push(area, vim);
      }
      show(area);
    },
  };
}
