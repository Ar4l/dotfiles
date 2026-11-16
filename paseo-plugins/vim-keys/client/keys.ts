// The keys for moving around the app, and the app's shortcuts as key events. No DOM:
// client/app.ts presses the shortcuts.

export type Action =
  | "pane-left"
  | "pane-down"
  | "pane-up"
  | "pane-right"
  | "tab-next"
  | "tab-previous"
  | "tab-index"
  | "workspace-next"
  | "workspace-previous"
  | "split-right"
  | "split-down"
  | "command-center"
  | "sidebar";
export interface Move {
  action: Action;
  /** The tab to go to, counted from 1, for `tab-index`. */
  index?: number;
}

/**
 * The app's shortcuts for each action: the binding's id in Settings → Shortcuts and the keys
 * it ships with. Which bindings exist depends on the platform and on the Paseo version, and
 * the first one the app answers wins. e2e/bindings.mjs checks this table against the app's code.
 */
export const BINDINGS: Record<Action, [id: string, keys: string][]> = {
  "pane-left": [["workspace-pane-focus-left-cmd-shift-left", "Cmd+Shift+ArrowLeft"]],
  "pane-down": [["workspace-pane-focus-down-cmd-shift-down", "Cmd+Shift+ArrowDown"]],
  "pane-up": [["workspace-pane-focus-up-cmd-shift-up", "Cmd+Shift+ArrowUp"]],
  "pane-right": [["workspace-pane-focus-right-cmd-shift-right", "Cmd+Shift+ArrowRight"]],
  // Paseo.app from 0.16.0, a browser on a Mac from 0.16.0, and everything before.
  "tab-next": [
    ["workspace-tab-navigate-relative-cmd-shift-right-mac", "Cmd+Shift+]"],
    ["workspace-tab-navigate-relative-alt-shift-right-mac-web", "Alt+Shift+]"],
    ["workspace-tab-navigate-relative-alt-shift-right", "Alt+Shift+]"],
  ],
  "tab-previous": [
    ["workspace-tab-navigate-relative-cmd-shift-left-mac", "Cmd+Shift+["],
    ["workspace-tab-navigate-relative-alt-shift-left-mac-web", "Alt+Shift+["],
    ["workspace-tab-navigate-relative-alt-shift-left", "Alt+Shift+["],
  ],
  // Paseo.app first, then a browser.
  "tab-index": [
    ["workspace-tab-navigate-index-cmd-alt-digit-mac-desktop", "Cmd+Alt+Digit"],
    ["workspace-tab-navigate-index-alt-shift-digit-web", "Alt+Shift+Digit"],
  ],
  "workspace-next": [
    ["workspace-navigate-relative-cmd-right-mac", "Cmd+]"],
    ["workspace-navigate-relative-alt-right-web", "Alt+]"],
  ],
  "workspace-previous": [
    ["workspace-navigate-relative-cmd-left-mac", "Cmd+["],
    ["workspace-navigate-relative-alt-left-web", "Alt+["],
  ],
  "split-right": [["workspace-pane-split-right-cmd-backslash", "Cmd+\\"]],
  "split-down": [["workspace-pane-split-down-cmd-shift-backslash", "Cmd+Shift+\\"]],
  "command-center": [["command-center-toggle-cmd-k-mac", "Cmd+K"]],
  sidebar: [["sidebar-toggle-left-mac-cmd-b", "Cmd+B"]],
};

const PANES: Record<string, Action> = { h: "pane-left", j: "pane-down", k: "pane-up", l: "pane-right" };
const DIGIT = /^[0-9]$/;
/** The keys that start a command here and mean nothing to the editor. `g` is the editor's too. */
const PREFIXES = ["<Space>", "<C-w>", "]", "["];
export const isPrefix = (key: string) => PREFIXES.includes(key);

/**
 * What the keys of a command ask for. `keys` are those waiting and the one just pressed, a
 * count first. "more" when they only start a command, null when they are not for the app.
 */
export function navigate(keys: string[]): Move | "more" | null {
  let digits = 0;
  while (digits < keys.length && DIGIT.test(keys[digits]) && (digits > 0 || keys[digits] !== "0")) digits++;
  const count = digits > 0 ? Number(keys.slice(0, digits).join("")) : null;
  const [first, second, ...rest] = keys.slice(digits);
  if (first === undefined || rest.length > 0) return null;
  const pane = /^<C-[hjkl]>$/.test(first) ? PANES[first[3]] : undefined;
  if (pane) return second === undefined ? { action: pane } : null;
  if (second === undefined) return isPrefix(first) ? "more" : null;
  switch (first) {
    case "<C-w>": {
      const letter = /^<C-[hjkl]>$/.test(second) ? second[3] : second;
      if (PANES[letter]) return { action: PANES[letter] };
      return second === "v" ? { action: "split-right" } : second === "s" ? { action: "split-down" } : null;
    }
    case "g":
      if (second === "t") return count === null ? { action: "tab-next" } : { action: "tab-index", index: count };
      return second === "T" ? { action: "tab-previous" } : null;
    case "<Space>":
      // `<leader>n` and `<leader>p` are the next and the previous buffer in the Vim config.
      if (second === "n") return { action: "tab-next" };
      if (second === "p") return { action: "tab-previous" };
      if (second === "b") return { action: "sidebar" };
      return second === "<Space>" ? { action: "command-center" } : null;
    case "]":
      return second === "w" ? { action: "workspace-next" } : null;
    case "[":
      return second === "w" ? { action: "workspace-previous" } : null;
    default:
      return null;
  }
}

const CODES: Record<string, string> = { "[": "BracketLeft", "]": "BracketRight", "\\": "Backslash", "/": "Slash", ".": "Period", ",": "Comma", ";": "Semicolon", "'": "Quote", "`": "Backquote", "-": "Minus", "=": "Equal", Space: "Space" };
const SHIFTED: Record<string, string> = { "[": "{", "]": "}", "\\": "|", "/": "?", ".": ">", ",": "<", ";": ":", "'": '"', "`": "~", "-": "_", "=": "+" };

/** What a key event for keys such as `Cmd+Shift+ArrowLeft` carries. Null for keys this cannot spell. */
export function eventInit(keys: string, digit?: number): Record<string, unknown> | null {
  const parts = keys.split("+");
  const name = parts.pop() ?? "";
  const has = (modifier: string) => parts.includes(modifier);
  if (parts.some((part) => !["Cmd", "Ctrl", "Alt", "Shift"].includes(part))) return null;
  let key = name;
  let code = name;
  if (name === "Digit") {
    if (digit === undefined || digit < 1 || digit > 9) return null;
    [key, code] = [String(digit), `Digit${digit}`];
  } else if (/^[A-Z]$/.test(name)) [key, code] = [has("Shift") ? name : name.toLowerCase(), `Key${name}`];
  else if (DIGIT.test(name)) code = `Digit${name}`;
  else if (CODES[name]) [key, code] = [name === "Space" ? " " : has("Shift") ? (SHIFTED[name] ?? name) : name, CODES[name]];
  else if (!/^(Arrow(Left|Right|Up|Down)|Enter|Tab|Escape|Backspace|Delete|Home|End|Page(Up|Down)|F[0-9]+)$/.test(name)) return null;
  return { key, code, metaKey: has("Cmd"), ctrlKey: has("Ctrl"), altKey: has("Alt"), shiftKey: has("Shift"), bubbles: true, cancelable: true };
}
