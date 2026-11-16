// Pure logic for the switcher: the recency list and the key state machine. No globals.

export interface Entry {
  /** `agent:<serverId>/<agentId>` or `ws:<serverId>/<workspaceId>`. */
  key: string;
  /** Where a jump goes: the stable agent URL or the workspace pathname. */
  path: string;
  title: string;
}

/** Entries kept in storage. */
export const CAP = 20;
/** Entries listed in the overlay. */
export const SHOWN = 7;

const WORKSPACE_PATH = /^\/h\/([^/]+)\/workspace\/([^/]+)\/?$/;
const AGENT_TAB = "agent_";

export interface Place {
  serverId: string;
  workspaceId: string;
}

/** The workspace a pathname shows, or null for any other route. */
export function placeOf(pathname: string): Place | null {
  const match = WORKSPACE_PATH.exec(pathname);
  if (!match) return null;
  return { serverId: decodeURIComponent(match[1]), workspaceId: decodeURIComponent(match[2]) };
}

/** Key of the entry that stands for a whole workspace. */
export function workspaceKey(place: Place): string {
  return `ws:${place.serverId}/${place.workspaceId}`;
}

/** The entry for a workspace and its selected tab. A non-agent tab is tracked as its workspace. */
export function entryFor(place: Place, tabId: string | null, title: string): Entry {
  const host = `/h/${encodeURIComponent(place.serverId)}`;
  if (tabId?.startsWith(AGENT_TAB)) {
    const agentId = tabId.slice(AGENT_TAB.length);
    return {
      key: `agent:${place.serverId}/${agentId}`,
      path: `${host}/agent/${encodeURIComponent(agentId)}`,
      title,
    };
  }
  return {
    key: workspaceKey(place),
    path: `${host}/workspace/${encodeURIComponent(place.workspaceId)}`,
    title,
  };
}

/** Moves `entry` to the front and keeps at most `cap` entries. */
export function visit(list: readonly Entry[], entry: Entry, cap = CAP): Entry[] {
  return [entry, ...list.filter((other) => other.key !== entry.key)].slice(0, cap);
}

export function drop(list: readonly Entry[], key: string): Entry[] {
  return list.filter((entry) => entry.key !== key);
}

/** Index of the highlighted entry while Ctrl is held, or null when the overlay is closed. */
export type Selection = number | null;
export type Key = "tab" | "shift-tab" | "release" | "cancel";

export interface Step {
  selection: Selection;
  /** Index to jump to, set only by a release with the overlay open. */
  jump: number | null;
}

/**
 * Advances the overlay by one key. `count` is how many entries the overlay lists. `start` is
 * where the first Tab lands: 1 when entry 0 is the tab on screen, 0 when it is not.
 */
export function step(selection: Selection, key: Key, count: number, start = 1): Step {
  if (key === "cancel" || count === 0) return { selection: null, jump: null };
  if (key === "release") return { selection: null, jump: selection };
  const back = key === "shift-tab";
  if (selection === null) {
    return { selection: back ? count - 1 : start % count, jump: null };
  }
  return { selection: (selection + (back ? count - 1 : 1)) % count, jump: null };
}
