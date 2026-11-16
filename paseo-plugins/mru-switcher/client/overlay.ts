import { type Elem, type PointerEvt, document, getComputedStyle, window } from "./dom";
import type { Entry, Status } from "./mru";

/** The app's own status words and dot colours (sidebar.statusBucket, status-dot-color.ts). */
const STATUS: Record<Status, { label: string; colour: string }> = {
  needs_input: { label: "Needs input", colour: "#f59e0b" },
  failed: { label: "Failed", colour: "#ef4444" },
  running: { label: "Working", colour: "#3b82f6" },
  attention: { label: "Ready to review", colour: "#22c55e" },
  done: { label: "Done", colour: "" },
};

export interface Overlay {
  /** Lists `entries` in the middle of the window. */
  open(entries: readonly Entry[], selection: number, statuses: ReadonlyMap<string, Status>): void;
  select(selection: number): void;
  /** Repaints the status of every listed entry. */
  update(statuses: ReadonlyMap<string, Status>): void;
  close(): void;
  contains(node: unknown): boolean;
}

interface Row {
  key: string;
  element: Elem;
  dot: Elem;
  state: Elem;
}

/**
 * The list of recent tabs. `onHover` and `onPick` receive the index of the row under the
 * pointer: on a pointer move, and on a press.
 */
export function createOverlay(onHover: (index: number) => void, onPick: (index: number) => void): Overlay {
  const root = document.createElement("div");
  root.setAttribute("data-testid", "mru-switcher");
  let rows: Row[] = [];
  let foreground = "";
  /** Where the pointer was when the overlay opened under it. Only a move away from there selects. */
  let rest: { x: number; y: number } | null = null;

  const indexOf = (event: PointerEvt): number | null => {
    const index = event.target?.closest("[data-index]")?.getAttribute("data-index");
    return index == null ? null : Number(index);
  };
  root.addEventListener("pointermove", (event: PointerEvt) => {
    // The browser reports a move when the overlay appears under a pointer that has not moved.
    rest ??= { x: event.screenX, y: event.screenY };
    if (rest.x === event.screenX && rest.y === event.screenY) return;
    const index = indexOf(event);
    if (index !== null) onHover(index);
  });
  // A press, not a click: with Ctrl held, macOS turns the click into a context menu.
  root.addEventListener("pointerdown", (event: PointerEvt) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    const index = indexOf(event);
    if (index !== null) onPick(index);
  });
  root.addEventListener("contextmenu", (event: PointerEvt) => event.preventDefault());

  const span = (css: string, text = ""): Elem => {
    const element = document.createElement("span");
    element.style.cssText = css;
    element.textContent = text;
    return element;
  };
  const clip = "min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";

  function paintStatus(row: Row, status: Status | undefined): void {
    const { label, colour } = status ? STATUS[status] : { label: "", colour: "transparent" };
    const fill = colour || `color-mix(in srgb,${foreground} 30%,transparent)`;
    row.dot.style.cssText = `flex:none;width:8px;height:8px;border-radius:50%;background:${fill}`;
    row.state.style.cssText = `flex:none;font-size:11px;${colour ? `color:${colour}` : "opacity:.55"}`;
    row.state.textContent = label;
    if (status) row.element.setAttribute("data-status", status);
  }

  return {
    open(entries, selection, statuses) {
      const colours = sample();
      foreground = colours.foreground;
      rest = null;
      root.style.cssText =
        `position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:2147483647;` +
        `width:min(560px,90vw);padding:6px;border-radius:10px;box-sizing:border-box;cursor:default;` +
        `font:13px/1.3 system-ui,sans-serif;background:${colours.background};color:${foreground};` +
        `border:1px solid color-mix(in srgb,${foreground} 18%,transparent);box-shadow:0 12px 40px rgba(0,0,0,.3)`;
      rows = entries.map((entry, index) => {
        const element = document.createElement("div");
        element.setAttribute("data-index", String(index));
        const row: Row = { key: entry.key, element, dot: span(""), state: span("") };
        const title = span(`flex:1 1 auto;${clip}`, entry.title);
        title.setAttribute("data-part", "title");
        const workspace = span(`flex:0 1 auto;max-width:45%;opacity:.55;${clip}`, entry.workspace);
        workspace.setAttribute("data-part", "workspace");
        row.state.setAttribute("data-part", "status");
        element.append(row.dot, title, workspace, row.state);
        paintStatus(row, statuses.get(entry.key));
        return row;
      });
      root.replaceChildren(...rows.map((row) => row.element));
      this.select(selection);
      if (!root.isConnected) document.body.append(root);
    },
    select(selection) {
      rows.forEach((row, index) => {
        const selected = index === selection;
        row.element.setAttribute("aria-selected", String(selected));
        row.element.style.cssText =
          `display:flex;align-items:center;gap:10px;padding:7px 10px;border-radius:6px;` +
          (selected ? `background:color-mix(in srgb,${foreground} 14%,transparent)` : "");
      });
    },
    update(statuses) {
      for (const row of rows) paintStatus(row, statuses.get(row.key));
    },
    close() {
      root.remove();
      rows = [];
    },
    contains: (node) => root.contains(node),
  };
}

/** The opaque surface behind the middle of the window, and black or white text to go on it. */
function sample(): { background: string; foreground: string } {
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
