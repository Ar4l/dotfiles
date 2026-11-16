import type { Elem } from "./dom";

/** A copy of a workspace as it looked with one tab in front. A card draws it scaled down. */
export interface Preview {
  node: Elem;
  width: number;
  height: number;
  /** Scroll offsets, lost whenever `node` leaves the document. */
  scrolls: [Elem, number][];
}

/** Elements that would load or play again once the copy enters the document. */
const LIVE = "iframe,webview,video,audio,object,embed,script";

/**
 * Copies `deck`, a workspace on screen. `panes` selects its panes. `focused` is the pane of
 * the tab the copy stands for. The other panes of a split are dimmed.
 */
export function capture(deck: Elem, panes: string, focused: Elem | null): Preview {
  const { width, height } = deck.getBoundingClientRect();
  const node = deck.cloneNode(true);
  const copies = [...node.querySelectorAll("*")];
  const scrolls: [Elem, number][] = [];
  [...deck.querySelectorAll("*")].forEach((element, index) => {
    if (element.scrollTop) scrolls.push([copies[index], element.scrollTop]);
  });
  const split = [...deck.querySelectorAll(panes)];
  [...node.querySelectorAll(panes)].forEach((pane, index) => {
    const front = split[index] === focused;
    pane.setAttribute("data-pane", front ? "focused" : "");
    if (!front && focused && split.length > 1) pane.style.cssText += ";opacity:.35";
  });
  for (const element of node.querySelectorAll(LIVE)) element.remove();
  // The app, this plugin and the tests find elements by test id and id. The copy must not answer.
  for (const element of [node, ...node.querySelectorAll("[data-testid],[id]")]) {
    element.removeAttribute("data-testid");
    element.removeAttribute("id");
  }
  return { node, width, height, scrolls };
}
