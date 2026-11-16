import { Platform } from "react-native";
import { type Entry, type Key, type Selection, SHOWN, drop, entryFor, placeOf, step, visit, workspaceKey } from "./mru";

// The plugin typechecks without the DOM library. Declare only what this module uses.
interface Elem {
  style: { cssText: string };
  textContent: string | null;
  isConnected: boolean;
  parentElement: Elem | null;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  checkVisibility(): boolean;
  contains(node: unknown): boolean;
  closest(selector: string): Elem | null;
  append(...nodes: Elem[]): void;
  replaceChildren(...nodes: Elem[]): void;
  remove(): void;
}
interface KeyEvt {
  key: string;
  ctrlKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  preventDefault(): void;
  stopImmediatePropagation(): void;
}
type Listener = (event: never) => void;
declare const window: {
  __mruSwitcher?: { refs: number; stop(): void };
  innerWidth: number;
  innerHeight: number;
  addEventListener(type: string, listener: Listener, capture?: boolean): void;
  removeEventListener(type: string, listener: Listener, capture?: boolean): void;
  dispatchEvent(event: unknown): void;
};
declare const document: {
  title: string;
  body: Elem;
  activeElement: Elem | null;
  querySelectorAll(selector: string): Iterable<Elem>;
  elementFromPoint(x: number, y: number): Elem | null;
  createElement(tag: string): Elem;
};
declare const history: { pushState(data: unknown, unused: string, url: string): void };
declare const location: { pathname: string };
declare const localStorage: { getItem(key: string): string | null; setItem(key: string, value: string): void };
declare const PopStateEvent: new (type: string) => unknown;
declare function getComputedStyle(element: Elem): { backgroundColor: string };

// App internals this plugin leans on; README.md lists them.
const SELECTED_TAB = '[data-testid^="workspace-tab-"][aria-selected="true"]';
const TAB_PREFIX = "workspace-tab-";
const PANE = '[data-testid^="workspace-pane-"]';
const deck = (serverId: string, workspaceId: string) =>
  `[data-testid=${JSON.stringify(`workspace-deck-entry-${serverId}:${workspaceId}`)}]`;

const STORE = "mru-switcher";
/** How long a jump may take to land before its entry counts as gone. */
const LAND_MS = 5000;

/** Starts the switcher once per window, however many hosts evaluate the bundle. */
export function start(): () => void {
  if (Platform.OS !== "web") return () => {};
  const shared = (window.__mruSwitcher ??= { refs: 0, stop: run() });
  shared.refs++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--shared.refs > 0) return;
    shared.stop();
    delete window.__mruSwitcher;
  };
}

function run(): () => void {
  let list = load();
  let saved = JSON.stringify(list);
  /** The entries the open overlay lists, frozen while Ctrl is held. */
  let shown: Entry[] = [];
  let selection: Selection = null;
  let first = 1;
  /** A jump that has not landed yet. Its entry is already at the front of the list. */
  let pending: { entry: Entry; until: number } | null = null;
  let soon = 0;
  let late = 0;
  let poll = 0;
  const overlay = document.createElement("div");
  overlay.setAttribute("data-testid", "mru-switcher");

  /** The tab on screen. Null outside a workspace route and while that workspace is not shown yet. */
  function current(): Entry | null {
    const place = placeOf(location.pathname);
    if (!place) return null;
    // Other workspaces stay mounted while hidden, and the URL can change before the screen does.
    const tabs = [...document.querySelectorAll(`${deck(place.serverId, place.workspaceId)} ${SELECTED_TAB}`)].filter(
      (tab) => tab.checkVisibility(),
    );
    // With split panes every pane has a selected tab; the focused pane wins.
    const tab = tabs.find((candidate) => candidate.closest(PANE)?.contains(document.activeElement)) ?? tabs[0];
    if (!tab) return null;
    const tabId = tab.getAttribute("data-testid")?.slice(TAB_PREFIX.length) ?? null;
    return entryFor(place, tabId, tab.getAttribute("aria-label") || document.title);
  }

  /**
   * Records the tab on screen. An agent tab replaces the entry of its own workspace: that
   * entry would now lead to this same tab.
   */
  function track(): void {
    clearTimeout(poll);
    const entry = current();
    if (pending) {
      const landed = entry !== null && (entry.key === pending.entry.key || location.pathname === pending.entry.path);
      if (!landed && Date.now() < pending.until) {
        poll = setTimeout(track, 100);
        return;
      }
      // Gone, or a workspace jump that landed on an agent tab with its own entry.
      if (entry?.key !== pending.entry.key) list = drop(list, pending.entry.key);
      pending = null;
    }
    const place = placeOf(location.pathname);
    if (entry && place) list = visit(drop(list, workspaceKey(place)), entry);
    const next = JSON.stringify(list);
    if (next === saved) return;
    saved = next;
    try {
      localStorage.setItem(STORE, next);
    } catch {
      // Storage is full or blocked: the list still works until the window closes.
    }
  }

  /** Looks again once the app has settled: a click or a shortcut changes the tab a little later. */
  function onActivity(): void {
    clearTimeout(soon);
    clearTimeout(late);
    soon = setTimeout(track, 150);
    late = setTimeout(track, 1000);
  }

  function jump(entry: Entry): void {
    if (entry.key === (pending?.entry.key ?? current()?.key)) return;
    list = visit(list, entry);
    pending = { entry, until: Date.now() + LAND_MS };
    // Expo Router follows the URL on popstate, and the agent route opens the tab itself.
    history.pushState(null, "", entry.path);
    window.dispatchEvent(new PopStateEvent("popstate"));
    track();
  }

  function render(): void {
    if (selection === null) {
      overlay.remove();
      return;
    }
    const { background, foreground } = colours();
    overlay.style.cssText =
      `position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:2147483647;` +
      `width:min(420px,80vw);padding:6px;border-radius:10px;box-sizing:border-box;` +
      `font:13px/1.3 system-ui,sans-serif;background:${background};color:${foreground};` +
      `border:1px solid color-mix(in srgb,${foreground} 18%,transparent);box-shadow:0 12px 40px rgba(0,0,0,.3)`;
    overlay.replaceChildren(
      ...shown.map((entry, index) => {
        const row = document.createElement("div");
        row.textContent = entry.title;
        row.setAttribute("aria-selected", String(index === selection));
        row.style.cssText =
          `padding:7px 10px;border-radius:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;` +
          (index === selection ? `background:color-mix(in srgb,${foreground} 14%,transparent)` : "opacity:.7");
        return row;
      }),
    );
    if (!overlay.isConnected) document.body.append(overlay);
  }

  function press(key: Key): void {
    if (selection === null && key !== "release" && key !== "cancel") {
      if (!pending) track();
      shown = list.slice(0, SHOWN);
      // Skip entry 0 only when it is the tab on screen.
      first = pending || current()?.key === shown[0]?.key ? 1 : 0;
    }
    const next = step(selection, key, shown.length, first);
    selection = next.selection;
    render();
    if (next.jump !== null) jump(shown[next.jump]);
  }

  function onKeyDown(event: KeyEvt): void {
    const tab = event.key === "Tab" && event.ctrlKey && !event.metaKey && !event.altKey;
    if (!tab && !(event.key === "Escape" && selection !== null)) return;
    // Capture phase on window: the composer and the terminal never see the key.
    event.preventDefault();
    event.stopImmediatePropagation();
    press(!tab ? "cancel" : event.shiftKey ? "shift-tab" : "tab");
  }

  function onKeyUp(event: KeyEvt): void {
    if (event.key === "Control") press("release");
    onActivity();
  }

  function onBlur(event: { target: unknown }): void {
    if (event.target === window) press("cancel");
  }

  const listeners: [string, Listener][] = [
    ["keydown", onKeyDown],
    ["keyup", onKeyUp],
    ["pointerup", onActivity],
    ["popstate", onActivity],
    ["blur", onBlur],
  ];
  for (const [type, listener] of listeners) window.addEventListener(type, listener, true);
  onActivity();

  return () => {
    for (const [type, listener] of listeners) window.removeEventListener(type, listener, true);
    for (const timer of [soon, late, poll]) clearTimeout(timer);
    overlay.remove();
  };
}

function load(): Entry[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(STORE) ?? "[]");
    if (!Array.isArray(stored)) return [];
    return stored.filter(
      (entry): entry is Entry =>
        typeof entry?.key === "string" && typeof entry.path === "string" && typeof entry.title === "string",
    );
  } catch {
    return [];
  }
}

/** The overlay takes the opaque surface behind the middle of the window, and black or white text. */
function colours(): { background: string; foreground: string } {
  let background = "rgb(255, 255, 255)";
  let element = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
  for (; element; element = element.parentElement) {
    const colour = getComputedStyle(element).backgroundColor;
    // An opaque computed colour serialises as rgb(); anything translucent as rgba().
    if (colour.startsWith("rgb(")) {
      background = colour;
      break;
    }
  }
  const [red, green, blue] = (background.match(/\d+/g) ?? []).map(Number);
  const dark = red * 0.299 + green * 0.587 + blue * 0.114 < 128;
  return { background, foreground: dark ? "rgb(255, 255, 255)" : "rgb(0, 0, 0)" };
}
