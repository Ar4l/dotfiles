// The plugin typechecks without the DOM library. This declares only what the switcher uses.

export interface Elem {
  style: { cssText: string };
  textContent: string | null;
  isConnected: boolean;
  scrollTop: number;
  parentElement: Elem | null;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  getBoundingClientRect(): { width: number; height: number };
  cloneNode(deep: boolean): Elem;
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
  /** The physical key, as the app's own bindings name it: `KeyT`. */
  code: string;
  repeat: boolean;
  defaultPrevented: boolean;
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
    /** False when a listener cancelled the event. */
    dispatchEvent(event: unknown): boolean;
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
  sessionStorage: {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
  };
  PopStateEvent: new (type: string) => unknown;
  CustomEvent: new (type: string, init: { cancelable: boolean; detail: unknown }) => unknown;
  getComputedStyle(element: Elem): { backgroundColor: string };
  requestAnimationFrame(callback: () => void): number;
  cancelAnimationFrame(handle: number): void;
  /** Missing in Safari. */
  requestIdleCallback?(callback: () => void, options: { timeout: number }): number;
}

// Undefined on native, where the switcher never starts.
const { requestIdleCallback } = globalThis as unknown as Globals;
export const {
  window,
  document,
  history,
  location,
  localStorage,
  sessionStorage,
  PopStateEvent,
  CustomEvent,
  getComputedStyle,
  requestAnimationFrame,
  cancelAnimationFrame,
} = globalThis as unknown as Globals;

/** Runs `run` once the browser has nothing else to do, or after `timeout` ms. */
export const idle: (run: () => void, options: { timeout: number }) => unknown =
  requestIdleCallback ?? ((run) => setTimeout(run, 0));
