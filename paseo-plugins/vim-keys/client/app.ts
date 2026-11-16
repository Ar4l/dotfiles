import { type Elem, KeyboardEvent, document, localStorage } from "./dom";
import { type Action, BINDINGS, type Move, eventInit } from "./keys";

// Moving around the app with Vim's keys for windows, tabs and workspaces. The app gives a
// plugin none of its actions, and it has a shortcut for each: a key here presses that
// shortcut, as a key event the app's own listener answers. client/keys.ts names the keys.

/** Where the app keeps the shortcuts changed in Settings: binding id to keys, null for none. */
const OVERRIDES = "@paseo:keyboard-shortcut-overrides";

let replaying = false;
/** A key event under way is one this file made: the plugin's own listener skips it. */
export const isReplay = () => replaying;

/**
 * Presses the app's shortcut for an action, with the keys set in Settings → Shortcuts when
 * they were changed there. True when the app answered: it cancels a key it takes.
 */
export function replay({ action, index }: Move): boolean {
  let changed: Record<string, string | null> = {};
  try {
    changed = JSON.parse(localStorage.getItem(OVERRIDES) ?? "{}") ?? {};
  } catch {
    // Unreadable: the keys the app ships with.
  }
  const target = document.activeElement ?? document.body;
  for (const [id, shipped] of BINDINGS[action]) {
    const keys = id in changed ? changed[id] : shipped;
    const init = keys ? eventInit(keys, index) : null;
    if (!init) continue;
    replaying = true;
    try {
      const taken = !target.dispatchEvent(new KeyboardEvent("keydown", init));
      // Other plugins look at the page again when a shortcut's key comes up.
      target.dispatchEvent(new KeyboardEvent("keyup", init));
      if (taken) return true;
    } finally {
      replaying = false;
    }
  }
  return false;
}

const PANE = "[data-testid^='workspace-pane-']";
/** Whether a pane lies next to `from` on that side. The app decides which one gets the focus. */
export function hasPane(from: Elem, action: Action): boolean {
  const here = from.getBoundingClientRect();
  for (const pane of document.querySelectorAll(PANE)) {
    if (pane === from || !pane.checkVisibility()) continue;
    const there = pane.getBoundingClientRect();
    const beside = there.top < here.bottom - 1 && there.bottom > here.top + 1;
    const stacked = there.left < here.right - 1 && there.right > here.left + 1;
    if (action === "pane-left" && beside && there.right <= here.left + 1) return true;
    if (action === "pane-right" && beside && there.left >= here.right - 1) return true;
    if (action === "pane-up" && stacked && there.bottom <= here.top + 1) return true;
    if (action === "pane-down" && stacked && there.top >= here.bottom - 1) return true;
  }
  return false;
}
