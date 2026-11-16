// The plugin typechecks without the DOM library. This declares only what it uses.

export interface Rect {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
}
export interface DomNode {
  isConnected: boolean;
  parentElement: Elem | null;
}
/** A text node. */
export interface TextNode extends DomNode {
  data: string;
}
export interface DomRange {
  setStart(node: DomNode, offset: number): void;
  setEnd(node: DomNode, offset: number): void;
  getBoundingClientRect(): Rect;
}
export interface Elem extends DomNode {
  tagName: string;
  style: { cssText: string };
  textContent: string | null;
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  closest(selector: string): Elem | null;
  querySelector(selector: string): Elem | null;
  querySelectorAll(selector: string): Iterable<Elem>;
  matches(selector: string): boolean;
  contains(node: DomNode | null): boolean;
  checkVisibility(options?: { visibilityProperty: boolean }): boolean;
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
  getBoundingClientRect(): Rect;
  focus(options?: { preventScroll: boolean }): void;
  blur(): void;
  click(): void;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  append(...nodes: Elem[]): void;
  remove(): void;
  dispatchEvent(event: unknown): boolean;
  /** Missing in browsers without the Popover API. */
  showPopover?(): void;
  hidePopover?(): void;
}
export interface Area extends Elem {
  value: string;
  selectionStart: number;
  selectionEnd: number;
  selectionDirection: string;
  setSelectionRange(start: number, end: number, direction?: string): void;
}
export interface KeyEvt {
  key: string;
  target: Elem | null;
  isComposing: boolean;
  defaultPrevented: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  preventDefault(): void;
  stopImmediatePropagation(): void;
}
export interface TargetEvt {
  target: Elem | null;
}
export interface CopyEvt extends TargetEvt {
  clipboardData: { setData(type: string, text: string): void } | null;
  preventDefault(): void;
}
export type Listener = (event: never) => void;

interface Globals {
  window: {
    __composerVim?: unknown;
    innerWidth: number;
    innerHeight: number;
    addEventListener(type: string, listener: Listener, capture?: boolean): void;
    removeEventListener(type: string, listener: Listener, capture?: boolean): void;
  };
  document: {
    head: Elem;
    body: Elem;
    activeElement: Elem | null;
    createElement(tag: string): Elem;
    createRange(): DomRange;
    /** Walks the text nodes under `root`: `show` is `NodeFilter.SHOW_TEXT`, 4. */
    createTreeWalker(root: Elem, show: number): { nextNode(): TextNode | null };
    querySelector(selector: string): Elem | null;
    querySelectorAll(selector: string): Iterable<Elem>;
    /** Types `text` over the selection of the focused field, as the keyboard would. */
    execCommand(command: "insertText" | "delete", showUi?: boolean, text?: string): boolean;
    addEventListener(type: string, listener: Listener, capture?: boolean): void;
    removeEventListener(type: string, listener: Listener, capture?: boolean): void;
  };
  localStorage: { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void };
  Event: new (type: string, init: { bubbles: boolean }) => unknown;
  getComputedStyle(element: Elem): { color: string; fontFamily: string; display: string; whiteSpace: string };
  /** The window's selection, which is the focused textarea's. `modify` is missing in some browsers. */
  getSelection(): { modify?(alter: "move", direction: "forward" | "backward", by: "line" | "lineboundary"): void } | null;
  navigator: { clipboard?: { readText(): Promise<string>; writeText(text: string): Promise<void> } };
  ResizeObserver?: new (changed: () => void) => { observe(element: Elem): void; disconnect(): void };
  MutationObserver: new (changed: () => void) => {
    observe(element: Elem, what: { childList: boolean; characterData: boolean; subtree: boolean }): void;
    disconnect(): void;
  };
  /** The CSS Custom Highlight API: colours ranges of text without touching the page. Missing in old browsers. */
  CSS: { highlights?: { set(name: string, highlight: unknown): void; delete(name: string): void } };
  Highlight?: new (...ranges: DomRange[]) => { priority: number };
  requestAnimationFrame(run: () => void): number;
  KeyboardEvent: new (type: string, init: Record<string, unknown>) => unknown;
  WheelEvent: new (type: string, init: { deltaY: number }) => unknown;
}

// Undefined on native, where the plugin never starts.
export const {
  window,
  document,
  localStorage,
  Event,
  KeyboardEvent,
  WheelEvent,
  getComputedStyle,
  getSelection,
  navigator,
  ResizeObserver,
  MutationObserver,
  CSS,
  Highlight,
  requestAnimationFrame,
} = globalThis as unknown as Globals;
