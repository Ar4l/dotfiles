import {
  type Elem,
  type PointerEvt,
  cancelAnimationFrame,
  document,
  getComputedStyle,
  requestAnimationFrame,
  window,
} from "./dom";
import { type Entry, type Status, cardWidth } from "./mru";
import type { Preview } from "./preview";

/**
 * The app's own status words (sidebar.statusBucket) and the dot colours of its light and
 * dark themes (status-dot-color.ts). `gone` is this plugin's.
 */
const STATUS: Record<Status, { label: string; colours?: [light: string, dark: string] }> = {
  needs_input: { label: "Needs input", colours: ["#b37824", "#db932e"] },
  failed: { label: "Failed", colours: ["#f12e2f", "#f7796d"] },
  running: { label: "Working", colours: ["#268ae0", "#5caaf6"] },
  attention: { label: "Ready to review", colours: ["#299f51", "#35c264"] },
  done: { label: "Done" },
  gone: { label: "Gone" },
};

export interface Overlay {
  /** Lists `entries` in the middle of the window: as rows, or given `previews` as a row of cards. */
  open(
    entries: readonly Entry[],
    selection: number,
    statuses: ReadonlyMap<string, Status>,
    previews?: ReadonlyMap<string, Preview>,
  ): void;
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
  title: Elem;
  state: Elem;
  /** Where a card draws its preview. */
  box?: Elem;
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
  let dark = false;
  /** The style of a row or card that is not selected. */
  let rowCss = "";
  let frame = 0;
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
  const titleCss = `flex:1 1 auto;${clip}`;
  const line = (...children: Elem[]): Elem => {
    const element = document.createElement("div");
    element.style.cssText = "display:flex;align-items:center;gap:6px;min-width:0";
    element.append(...children);
    return element;
  };

  function paintStatus(row: Row, status: Status | undefined): void {
    const { label, colours } = status ? STATUS[status] : { label: "", colours: undefined };
    const colour = colours?.[dark ? 1 : 0] ?? "";
    const fill = !status ? "transparent" : colour || `color-mix(in srgb,${foreground} 30%,transparent)`;
    row.dot.style.cssText = `flex:none;width:8px;height:8px;border-radius:50%;background:${fill}`;
    row.state.style.cssText = `flex:none;font-size:11px;${colour ? `color:${colour}` : "opacity:.55"}`;
    row.state.textContent = label;
    if (status) row.element.setAttribute("data-status", status);
    row.title.style.cssText = titleCss + (status === "gone" ? "opacity:.45;text-decoration:line-through" : "");
  }

  return {
    open(entries, selection, statuses, previews) {
      const colours = sample();
      foreground = colours.foreground;
      dark = colours.dark;
      rest = null;
      const width = cardWidth(entries.length, window.innerWidth);
      root.setAttribute("data-layout", previews ? "cards" : "list");
      root.style.cssText =
        `position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:2147483647;` +
        (previews ? "display:flex;gap:6px;" : "width:min(560px,90vw);") +
        `padding:6px;border-radius:10px;box-sizing:border-box;cursor:default;` +
        `font:13px/1.3 system-ui,sans-serif;background:${colours.background};color:${foreground};` +
        `border:1px solid color-mix(in srgb,${foreground} 18%,transparent);box-shadow:0 12px 40px rgba(0,0,0,.3)`;
      rowCss = previews
        ? `flex:none;width:${width}px;box-sizing:border-box;display:flex;flex-direction:column;gap:5px;padding:6px;border-radius:8px;`
        : "display:flex;align-items:center;gap:10px;padding:7px 10px;border-radius:6px;";
      rows = entries.map((entry, index) => {
        const element = document.createElement("div");
        element.setAttribute("data-index", String(index));
        const title = span(titleCss, entry.title);
        title.setAttribute("data-part", "title");
        const row: Row = { key: entry.key, element, dot: span(""), title, state: span("") };
        const workspace = span(`flex:${previews ? "1 1 0" : "0 1 auto;max-width:45%"};opacity:.55;${clip}`, entry.workspace);
        workspace.setAttribute("data-part", "workspace");
        row.state.setAttribute("data-part", "status");
        if (previews) {
          row.box = document.createElement("div");
          row.box.setAttribute("data-part", "preview");
          // The copy inside is a picture: it takes no focus, clicks or screen-reader attention.
          row.box.setAttribute("inert", "");
          row.box.style.cssText =
            `height:${Math.round((width - 12) * 0.8)}px;border-radius:4px;overflow:hidden;contain:strict;` +
            `pointer-events:none;background:color-mix(in srgb,${foreground} 8%,transparent)`;
          element.append(row.box, line(row.dot, title), line(workspace, row.state));
        } else {
          element.append(row.dot, title, workspace, row.state);
        }
        paintStatus(row, statuses.get(entry.key));
        return row;
      });
      root.replaceChildren(...rows.map((row) => row.element));
      this.select(selection);
      if (!root.isConnected) document.body.append(root);

      // One copy enters the document per frame, after the cards are on screen: laying out
      // seven workspaces at once would hold up the next Tab.
      cancelAnimationFrame(frame);
      const waiting = rows.filter((row) => previews?.has(row.key));
      const draw = () => {
        const row = waiting.shift();
        const preview = row && previews?.get(row.key);
        if (!row?.box || !preview) return;
        const scaled = document.createElement("div");
        scaled.style.cssText =
          `position:relative;display:flex;width:${preview.width}px;height:${preview.height}px;` +
          `transform:scale(${(width - 12) / preview.width});transform-origin:0 0`;
        scaled.append(preview.node);
        row.box.append(scaled);
        for (const [element, top] of preview.scrolls) element.scrollTop = top;
        frame = requestAnimationFrame(draw);
      };
      if (waiting.length > 0) frame = requestAnimationFrame(draw);
    },
    select(selection) {
      rows.forEach((row, index) => {
        const selected = index === selection;
        row.element.setAttribute("aria-selected", String(selected));
        row.element.style.cssText =
          rowCss + (selected ? `background:color-mix(in srgb,${foreground} 14%,transparent)` : "");
      });
    },
    update(statuses) {
      for (const row of rows) paintStatus(row, statuses.get(row.key));
    },
    close() {
      cancelAnimationFrame(frame);
      root.remove();
      rows = [];
    },
    contains: (node) => root.contains(node),
  };
}

/** The opaque surface behind the middle of the window, and black or white text to go on it. */
function sample(): { background: string; foreground: string; dark: boolean } {
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
  return { background, foreground: dark ? "rgb(255, 255, 255)" : "rgb(0, 0, 0)", dark };
}
