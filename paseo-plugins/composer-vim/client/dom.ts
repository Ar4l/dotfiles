// The plugin typechecks without the DOM library. This declares only what it uses.

export interface Elem {
  tagName: string;
  style: { cssText: string };
  textContent: string | null;
  isConnected: boolean;
  closest(selector: string): Elem | null;
  matches(selector: string): boolean;
  getBoundingClientRect(): { left: number; right: number; top: number; bottom: number };
  setAttribute(name: string, value: string): void;
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
    body: Elem;
    activeElement: Elem | null;
    createElement(tag: string): Elem;
    querySelector(selector: string): Elem | null;
    /** Types `text` over the selection of the focused field, as the keyboard would. */
    execCommand(command: "insertText" | "delete", showUi?: boolean, text?: string): boolean;
    addEventListener(type: string, listener: Listener, capture?: boolean): void;
    removeEventListener(type: string, listener: Listener, capture?: boolean): void;
  };
  localStorage: { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void };
  Event: new (type: string, init: { bubbles: boolean }) => unknown;
  getComputedStyle(element: Elem): { color: string; fontFamily: string };
}

// Undefined on native, where the plugin never starts.
export const { window, document, localStorage, Event, getComputedStyle } = globalThis as unknown as Globals;
