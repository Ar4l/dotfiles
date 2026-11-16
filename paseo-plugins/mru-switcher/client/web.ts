import { Platform } from "react-native";
import {
  type Elem,
  type KeyEvt,
  type Listener,
  type PointerEvt,
  PopStateEvent,
  document,
  history,
  localStorage,
  location,
  window,
} from "./dom";
import {
  type AgentState,
  type Entry,
  type Key,
  type Selection,
  SHOWN,
  type Status,
  drop,
  entryFor,
  isEntry,
  placeOf,
  statusOf,
  step,
  visit,
  workspaceKey,
} from "./mru";
import { createOverlay } from "./overlay";

/** The part of a host's API the switcher reads agent state from. */
export interface Paseo {
  agents: {
    ref(agentId: string): { refresh(): Promise<{ agent: AgentState } | null> };
    list(options: { includeBackground: boolean; filter: { requiresAttention: boolean } }): Promise<{
      entries: readonly { agent: { id: string; workspaceId?: string | null } }[];
      pageInfo: { hasMore: boolean };
    }>;
  };
}
/** `getPaseoClient` of one installation: the API of an online host, or a throw. */
export type HostApi = (serverId: string) => Paseo;

// App internals this plugin leans on; README.md lists them.
const TAB_PREFIX = "workspace-tab-";
const SELECTED_TAB = `[data-testid^="${TAB_PREFIX}"][aria-selected="true"]`;
const PANE = '[data-testid^="workspace-pane-"]';
const testId = (id: string) => `[data-testid=${JSON.stringify(id)}]`;
const deckOf = (place: { serverId: string; workspaceId: string }) =>
  testId(`workspace-deck-entry-${place.serverId}:${place.workspaceId}`);
const sidebarRowOf = (entry: Entry) => testId(`sidebar-workspace-row-${entry.serverId}:${entry.workspaceId}`);
const agentTabOf = (entry: Entry) => `${deckOf(entry)} ${testId(`${TAB_PREFIX}agent_${entry.agentId}`)}`;

const STORE = "mru-switcher";
/** A quick Ctrl+Tab toggle is over before this, and never draws the overlay. */
const SHOW_MS = 150;
/** How often a jump on its way is looked at. */
const POLL_MS = 30;
/** How long clicking the tab may take before the jump goes through the entry's URL instead. */
const CLICK_MS = 1200;
/** How long a jump waits for a host to say whether a workspace holds unread agents. */
const ASK_MS = 250;
/** How long a jump may take to land before its entry counts as gone. */
const LAND_MS = 5000;

interface Shared {
  /** One per host that serves the plugin. Each stops working when its host unloads the plugin. */
  hosts: Set<HostApi>;
  stop(): void;
}

/** Starts the switcher once per window, however many hosts evaluate the bundle. */
export function start(host: HostApi): () => void {
  if (Platform.OS !== "web") return () => {};
  let shared = window.__mruSwitcher as Shared | undefined;
  if (!shared) {
    const hosts = new Set<HostApi>();
    shared = window.__mruSwitcher = { hosts, stop: run(hosts) };
  }
  const { hosts, stop } = shared;
  hosts.add(host);
  return () => {
    if (!hosts.delete(host) || hosts.size > 0) return;
    stop();
    delete window.__mruSwitcher;
  };
}

/** A jump that has not landed yet. Its entry is already at the front of the list. */
interface Pending {
  entry: Entry;
  /** When the jump began. */
  startedAt: number;
  /** When the jump stops clicking and pushes the entry's URL. 0 once it has. */
  urlAt: number;
  /** When the entry counts as gone. */
  until: number;
  /** The sidebar row of the entry's workspace was clicked. */
  opened: boolean;
  nextClick: number;
  /** Whether the entry's workspace holds another unread agent: undefined before asking, null while asking. */
  unread?: boolean | null;
}

function run(hosts: ReadonlySet<HostApi>): () => void {
  let list = load();
  let saved = JSON.stringify(list);
  /** The entries the open overlay lists, frozen while Ctrl is held. */
  let shown: Entry[] = [];
  let selection: Selection = null;
  let first = 1;
  let drawn = false;
  let pending: Pending | null = null;
  /** Last known status per entry key, shown at once while a fresh one is fetched. */
  const statuses = new Map<string, Status>();
  let soon = 0;
  let late = 0;
  let poll = 0;
  let draw = 0;
  const overlay = createOverlay(
    (index) => {
      if (selection === null || selection === index) return;
      selection = index;
      overlay.select(index);
    },
    (index) => {
      const entry = shown[index];
      press("cancel");
      if (entry) jump(entry);
    },
  );

  /** The API of the host that owns an entry, or null while that host is offline. */
  function apiOf(entry: Entry): Paseo | null {
    for (const host of hosts) {
      try {
        return host(entry.serverId);
      } catch {
        // This installation has stopped, or the host is offline.
      }
    }
    return null;
  }

  /** The tab on screen. Null outside a workspace route and while that workspace is not shown yet. */
  function current(): Entry | null {
    const place = placeOf(location.pathname);
    if (!place) return null;
    // Other workspaces stay mounted while hidden, and the URL can change before the screen does.
    const deck = document.querySelector(deckOf(place));
    if (!deck?.checkVisibility()) return null;
    const tabs = [...document.querySelectorAll(`${deckOf(place)} ${SELECTED_TAB}`)];
    // With split panes every pane has a selected tab; the focused pane wins.
    const tab = tabs.find((candidate) => candidate.closest(PANE)?.contains(document.activeElement)) ?? tabs[0];
    if (!tab) return null;
    const tabId = tab.getAttribute("data-testid")?.slice(TAB_PREFIX.length) ?? null;
    const header = (part: string) => deck.querySelector(testId(`workspace-header-${part}`))?.textContent;
    const workspace = [header("subtitle"), header("title")].filter(Boolean).join(" / ");
    return entryFor(place, tabId, tab.getAttribute("aria-label") || document.title, workspace);
  }

  function save(): void {
    const next = JSON.stringify(list);
    if (next === saved) return;
    saved = next;
    try {
      localStorage.setItem(STORE, next);
    } catch {
      // Storage is full or blocked: the list still works until the window closes.
    }
  }

  /**
   * Moves a jump along and reports whether it is over. Clicking is what the app does fastest:
   * a tab of the workspace on screen, or the workspace's sidebar row and then the tab. The
   * entry's URL is slower and unmounts the other workspaces, and it reopens a closed tab.
   */
  function arrive(jump: Pending, entry: Entry | null): boolean {
    const target = jump.entry;
    const now = Date.now();
    const place = placeOf(location.pathname);
    const here = place?.serverId === target.serverId && place.workspaceId === target.workspaceId;
    if (here && entry && (target.agentId === null || entry.key === target.key)) return true;
    if (now >= jump.until) return true;
    if (jump.urlAt === 0) return false;

    const url = () => {
      jump.urlAt = 0;
      // Expo Router follows the URL on popstate, and the agent route opens the tab itself.
      history.pushState(null, "", target.path);
      window.dispatchEvent(new PopStateEvent("popstate"));
    };
    const tab = target.agentId === null ? null : document.querySelector(agentTabOf(target));
    if (now >= jump.urlAt) {
      url();
    } else if (here) {
      // Without an entry the URL has changed and the screen has not. Without the tab, it was closed.
      if (entry && !tab) url();
      else if (entry && tab && now >= jump.nextClick) {
        jump.nextClick = now + 200;
        if (tab.getAttribute("aria-selected") !== "true") tab.click();
        // Selected already, in a split pane without the focus: focusing its composer moves the focus there.
        else [...(tab.closest(PANE)?.querySelectorAll("textarea") ?? [])].find((input) => input.checkVisibility())?.focus();
      }
    } else if (!jump.opened) {
      const row = document.querySelector(sidebarRowOf(target));
      // The row opens the workspace on its unread agent, if it has one, and that marks the agent
      // as read. Clicking the tab in the same tick keeps a mounted workspace from ever showing
      // that agent. A workspace that is not mounted has no tab to click yet, so its host is
      // asked first, and the URL is the way in when another agent there is unread.
      if (row && (tab || target.agentId === null || jump.unread === false)) {
        jump.opened = true;
        row.click();
        tab?.click();
      } else if (!row || jump.unread || now >= jump.startedAt + ASK_MS) {
        url();
      } else if (jump.unread === undefined) {
        const api = apiOf(target);
        if (api) ask(api, jump);
        else url();
      }
    }
    return false;
  }

  /** Asks the host whether the workspace of a jump holds an unread agent other than its target. */
  function ask(api: Paseo, jump: Pending): void {
    jump.unread = null;
    const target = jump.entry;
    Promise.resolve()
      .then(() => api.agents.list({ includeBackground: true, filter: { requiresAttention: true } }))
      .then(({ entries, pageInfo }) => {
        if (pending !== jump) return;
        jump.unread =
          pageInfo.hasMore ||
          entries.some(({ agent }) => agent.workspaceId === target.workspaceId && agent.id !== target.agentId);
        track();
      })
      .catch(() => {
        // The host went offline: the jump goes through the URL once ASK_MS has passed.
      });
  }

  /**
   * Records the tab on screen. An agent tab replaces the entry of its own workspace: that
   * entry would now lead to this same tab.
   */
  function track(): void {
    clearTimeout(poll);
    const entry = current();
    const landing = pending !== null;
    if (pending) {
      if (!arrive(pending, entry)) {
        poll = setTimeout(track, POLL_MS);
        return;
      }
      // Gone, or a workspace jump that landed on an agent tab with its own entry.
      if (entry?.key !== pending.entry.key) list = drop(list, pending.entry.key);
      pending = null;
    }
    const front = list[0];
    const recorded =
      !landing && front?.key === entry?.key && front?.title === entry?.title && front?.workspace === entry?.workspace;
    if (entry && !recorded) list = visit(drop(list, workspaceKey(entry)), entry);
    save();
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
    const now = Date.now();
    pending = { entry, startedAt: now, urlAt: now + CLICK_MS, until: now + LAND_MS, opened: false, nextClick: 0 };
    track();
  }

  /** Asks each listed agent's host for its status, and repaints the overlay as answers arrive. */
  function refresh(entries: readonly Entry[]): void {
    for (const key of statuses.keys()) if (!list.some((entry) => entry.key === key)) statuses.delete(key);
    for (const entry of entries) {
      const { agentId, key } = entry;
      const api = agentId === null ? null : apiOf(entry);
      if (agentId === null || !api) continue;
      Promise.resolve()
        .then(() => api.agents.ref(agentId).refresh())
        .then((result) => {
          if (!result) return;
          const status = statusOf(result.agent);
          if (statuses.get(key) === status) return;
          statuses.set(key, status);
          overlay.update(statuses);
        })
        .catch(() => {
          // The host went offline: the row keeps the last status it showed.
        });
    }
  }

  function show(): void {
    clearTimeout(draw);
    if (selection === null || drawn) return;
    drawn = true;
    overlay.open(shown, selection, statuses);
  }

  function press(key: Key): void {
    const opening = selection === null && key !== "release" && key !== "cancel";
    if (opening) {
      if (!pending) track();
      shown = list.slice(0, SHOWN);
      // Skip entry 0 only when it is the tab on screen.
      first = pending || current()?.key === shown[0]?.key ? 1 : 0;
      refresh(shown);
    }
    const next = step(selection, key, shown.length, first);
    selection = next.selection;
    if (selection === null) {
      clearTimeout(draw);
      drawn = false;
      overlay.close();
    } else if (drawn) {
      overlay.select(selection);
    } else if (opening) {
      draw = setTimeout(show, SHOW_MS);
    } else {
      show();
    }
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
    // Typing does not change the tab; a named key or a shortcut can.
    if (event.key.length > 1 || event.ctrlKey || event.metaKey || event.altKey) onActivity();
  }

  function onPointerDown(event: PointerEvt): void {
    if (selection !== null && !overlay.contains(event.target)) press("cancel");
  }

  function onBlur(event: { target: unknown }): void {
    if (event.target === window) press("cancel");
  }

  const listeners: [string, Listener][] = [
    ["keydown", onKeyDown],
    ["keyup", onKeyUp],
    ["pointerdown", onPointerDown],
    ["pointerup", onActivity],
    ["popstate", onActivity],
    ["blur", onBlur],
  ];
  for (const [type, listener] of listeners) window.addEventListener(type, listener, true);
  onActivity();

  return () => {
    for (const [type, listener] of listeners) window.removeEventListener(type, listener, true);
    for (const timer of [soon, late, poll, draw]) clearTimeout(timer);
    overlay.close();
  };
}

function load(): Entry[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(STORE) ?? "[]");
    return Array.isArray(stored) ? stored.filter(isEntry) : [];
  } catch {
    return [];
  }
}
