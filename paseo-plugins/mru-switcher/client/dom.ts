// The plugin typechecks without the DOM library. This declares only what the switcher uses.

export interface Elem {
  style: { cssText: string };
  textContent: string | null;
  isConnected: boolean;
  parentElement: Elem | null;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  checkVisibility(): boolean;
  contains(node: unknown): boolean;
  closest(selector: string): Elem | null;
  querySelector(selector: string): Elem | null;
  querySelectorAll(selector: string): Iterable<Elem>;
  focus(): void;
  append(...nodes: Elem[]): void;
  replaceChildren(...nodes: Elem[]): void;
  remove(): void;
  click(): void;
  addEventListener(type: string, listener: Listener): void;
}
export interface KeyEvt {
  key: string;
  ctrlKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  preventDefault(): void;
  stopImmediatePropagation(): void;
}
export interface PointerEvt {
  target: Elem | null;
  screenX: number;
  screenY: number;
  preventDefault(): void;
  stopImmediatePropagation(): void;
}
export type Listener = (event: never) => void;

interface Globals {
  window: {
    __mruSwitcher?: unknown;
    innerWidth: number;
    innerHeight: number;
    addEventListener(type: string, listener: Listener, capture?: boolean): void;
    removeEventListener(type: string, listener: Listener, capture?: boolean): void;
    dispatchEvent(event: unknown): void;
  };
  document: {
    title: string;
    body: Elem;
    activeElement: Elem | null;
    querySelector(selector: string): Elem | null;
    querySelectorAll(selector: string): Iterable<Elem>;
    elementFromPoint(x: number, y: number): Elem | null;
    createElement(tag: string): Elem;
  };
  history: { pushState(data: unknown, unused: string, url: string): void };
  location: { pathname: string };
  localStorage: { getItem(key: string): string | null; setItem(key: string, value: string): void };
  PopStateEvent: new (type: string) => unknown;
  getComputedStyle(element: Elem): { backgroundColor: string };
}

// Undefined on native, where the switcher never starts.
export const { window, document, history, location, localStorage, PopStateEvent, getComputedStyle } =
  globalThis as unknown as Globals;
