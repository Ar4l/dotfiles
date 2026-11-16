import { Platform } from "react-native";
import {
  type Elem,
  type KeyEvt,
  type Listener,
  type PointerEvt,
  CustomEvent,
  PopStateEvent,
  document,
  history,
  idle,
  localStorage,
  location,
  window,
} from "./dom";
import {
  type AgentState,
  CARDS,
  type Entry,
  type Key,
  type Place,
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
import { type Preview, capture } from "./preview";

/** The part of a host's API the switcher uses. */
export interface Paseo {
  agents: {
    ref(agentId: string): {
      /** Reads the agent's state. Resolves to null for an agent the host no longer knows. */
      refresh(): Promise<{ agent: AgentState } | null>;
      /** Reopens the agent's session. It unarchives an archived agent and interrupts a running one. */
      reload(): Promise<unknown>;
    };
  };
}
/** `getPaseoClient` of one installation: the API of an online host, or a throw. */
export type HostApi = (serverId: string) => Paseo;

// App internals this plugin leans on; README.md lists them.
const TAB_PREFIX = "workspace-tab-";
const ANY_TAB = `[data-testid^="${TAB_PREFIX}"]`;
const SELECTED_TAB = `${ANY_TAB}[aria-selected="true"]`;
const DECK_PREFIX = "workspace-deck-entry-";
const PANE = '[data-testid^="workspace-pane-"]';
const testId = (id: string) => `[data-testid=${JSON.stringify(id)}]`;
const deckOf = (place: { serverId: string; workspaceId: string }) =>
  testId(`${DECK_PREFIX}${place.serverId}:${place.workspaceId}`);
const sidebarRowOf = (entry: Entry) => testId(`sidebar-workspace-row-${entry.serverId}:${entry.workspaceId}`);
/**
 * The app opens an agent on this window event, which it raises itself for a click on a
 * notification. It shows the agent's workspace, selects or reopens its tab and focuses its
 * pane, and it cancels the event to say so.
 */
const OPEN_AGENT = "paseo:web-notification-click";
const agentTabOf = (entry: Entry) => `${deckOf(entry)} ${testId(`${TAB_PREFIX}agent_${entry.agentId}`)}`;
/** The narrow layout draws this menu in place of the tabs. */
const TAB_MENU = testId(`${TAB_PREFIX}switcher-trigger`);

const STORE = "mru-switcher";
/** Holds the agent tabs closed in this window, the one closed last first. */
const CLOSED = "mru-switcher:closed";
/** Holds `cards` while the experimental layout is on: a row of cards with previews. */
const LAYOUT = "mru-switcher:layout";
/** A quick Ctrl+Tab toggle is over before this, and never draws the overlay. */
const SHOW_MS = 150;
/** How often a jump on its way is looked at. */
const POLL_MS = 30;
/** How long a click on a tab may take to land before the app is asked to open the agent. */
const RETRY_MS = 400;
/** How long a jump may take to land before its entry counts as gone. */
const LAND_MS = 3000;
/** A status this recent is not requested again. */
const FRESH_MS = 1000;

function cards(): boolean {
  try {
    return localStorage.getItem(LAYOUT) === CARDS;
  } catch {
    return false;
  }
}

/** Switches the overlay between the list and the cards. */
export function toggleCards(): void {
  try {
    localStorage.setItem(LAYOUT, cards() ? "list" : CARDS);
  } catch {
    // Storage is blocked: the overlay stays a list.
  }
}

/** Reopens the agent tab closed last, as Cmd+Shift+T does. */
export function reopenClosed(): void {
  (window.__mruSwitcher as Partial<Shared> | undefined)?.reopen?.();
}

interface Running {
  stop(): void;
  reopen(): void;
}

interface Shared extends Running {
  /** One per host that serves the plugin. Each stops working when its host unloads the plugin. */
  hosts: Set<HostApi>;
}

/**
 * Starts the switcher once per window, however many hosts evaluate the bundle. The bundle
 * evaluated last runs it: after `paseo plugin reload` on one host, that is the new code.
 */
export function start(host: HostApi): () => void {
  if (Platform.OS !== "web") return () => {};
  const previous = window.__mruSwitcher as Partial<Shared> | undefined;
  previous?.stop?.();
  const hosts = previous?.hosts instanceof Set ? previous.hosts : new Set<HostApi>();
  hosts.add(host);
  const shared: Shared = { hosts, ...run(hosts) };
  window.__mruSwitcher = shared;
  return () => {
    if (!hosts.delete(host) || hosts.size > 0) return;
    (window.__mruSwitcher as Shared | undefined)?.stop();
    delete window.__mruSwitcher;
  };
}

/** A jump that has not landed yet. Its entry is already at the front of the list. */
interface Pending {
  entry: Entry;
  /** When the entry counts as gone. */
  until: number;
  /** When the app is asked to open the entry, unless the jump can ask or click at once. */
  askAt: number;
  /** The tab was clicked or the app was asked: the entry's tab, once selected, is the tab on screen. */
  acted: boolean;
  asked: boolean;
}

function run(hosts: ReadonlySet<HostApi>): Running {
  let list = load(STORE);
  let saved = JSON.stringify(list);
  /** The agent tabs closed in this window and not reopened, the one closed last first. */
  let reopenable = load(CLOSED);
  /** The agent tabs of the workspace on screen at the last look. */
  let strip: { deck: string; agents: Entry[] } | null = null;
  /** Reopens run one at a time, so each press takes the tab closed before the last one. */
  let reopening: Promise<void> = Promise.resolve();
  /** The entries the open overlay lists, frozen while Ctrl is held. */
  let shown: Entry[] = [];
  let selection: Selection = null;
  let first = 1;
  let drawn = false;
  let pending: Pending | null = null;
  /** Last known status per entry key, shown at once while a fresh one is fetched. */
  const statuses = new Map<string, Status>();
  /** When each entry's status was last requested. */
  const asked = new Map<string, number>();
  /** Key of the tab last recorded as on screen. */
  let last: string | null = null;
  /** With the cards layout on: what each listed entry's workspace looked like, at most SHOWN of them. */
  const previews = new Map<string, Preview>();
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

  /**
   * The tab on screen. Null outside a workspace route and while that workspace is not shown
   * yet. With split panes every pane has a selected tab. The one named `prefer` wins, then
   * the one in the pane with the keyboard focus, then the one recorded last.
   */
  function current(prefer?: string): Entry | null {
    const place = placeOf(location.pathname);
    if (!place) return null;
    // Other workspaces stay mounted while hidden, and the URL can change before the screen does.
    const deck = document.querySelector(deckOf(place));
    if (!deck?.checkVisibility()) return null;
    const tabs = [...deck.querySelectorAll(`${PANE} ${SELECTED_TAB}`)].filter((tab) => tab.checkVisibility());
    const entries = entriesOf(place, deck, tabs);
    const focused = tabs.findIndex((tab) => tab.closest(PANE)?.contains(document.activeElement));
    return (
      entries.find((entry) => entry.key === prefer) ??
      entries[focused] ??
      entries.find((entry) => entry.key === last) ??
      entries[0] ??
      null
    );
  }

  function save(): void {
    const next = JSON.stringify(list);
    if (next === saved) return;
    saved = next;
    store(STORE, next);
  }

  /**
   * Records the agent tabs that left the workspace on screen since the last look. The app
   * takes a closed tab off the screen before the host has archived its agent, so this asks
   * no host. An agent archived from elsewhere while its workspace is on screen counts too.
   *
   * An early look runs at a pointer press or a modifier key press, before the app acts on
   * it. It only adds tabs: a tab can appear without a click, and the app takes a tab out
   * for a moment when it moves it to another pane.
   */
  function noteClosed(early = false): void {
    const place = placeOf(location.pathname);
    const deck = place && document.querySelector(deckOf(place));
    if (!place || !deck?.checkVisibility()) {
      strip = null;
      return;
    }
    // The narrow layout has no tabs to compare.
    if (deck.querySelector(TAB_MENU)) return;
    const agents = entriesOf(place, deck, [...deck.querySelectorAll(ANY_TAB)]).filter(
      (entry) => entry.agentId !== null,
    );
    const before = strip?.deck === deckOf(place) ? strip.agents : [];
    const gone = before.filter((entry) => !agents.some((other) => other.key === entry.key));
    // Tabs an early look misses come first, so that a later look records them as closed first.
    strip = { deck: deckOf(place), agents: early ? [...gone, ...agents] : agents };
    if (early || gone.length === 0) return;
    for (const entry of gone) reopenable = visit(reopenable, entry);
    store(CLOSED, JSON.stringify(reopenable));
  }

  /** Reopens the agent tab closed last. Each further call takes the one closed before it. */
  function reopen(): void {
    reopening = reopening.then(reopenNext).catch(() => {
      // The app or the host failed: the next press starts afresh.
    });
  }

  async function reopenNext(): Promise<void> {
    // A tab closed a moment ago has not been looked at yet.
    noteClosed();
    for (const entry of reopenable) {
      const { agentId, key } = entry;
      const api = apiOf(entry);
      // The tabs of an offline host wait for a later press.
      if (!api || agentId === null) continue;
      const agent = api.agents.ref(agentId);
      let state: AgentState | null = null;
      if (!document.querySelector(agentTabOf(entry))) {
        try {
          state = (await agent.refresh())?.agent ?? null;
        } catch {
          continue;
        }
      }
      reopenable = drop(reopenable, key);
      store(CLOSED, JSON.stringify(reopenable));
      // The tab is open again already, or the agent was deleted.
      if (!state) continue;
      statuses.delete(key);
      jump(entry);
      // Only an archived agent is reloaded: a reload interrupts a running one. The tab of a
      // subagent closes without archiving it. When the reload fails, the tab offers Unarchive.
      if (state.archivedAt) agent.reload().catch(() => {});
      return;
    }
  }

  /**
   * Moves a jump along and reports whether it is over. A click on a tab of the workspace on
   * screen is what the app does fastest. Everything else goes through `open`.
   */
  function arrive(jump: Pending, entry: Entry | null): boolean {
    const target = jump.entry;
    const now = Date.now();
    const place = placeOf(location.pathname);
    const here = place?.serverId === target.serverId && place.workspaceId === target.workspaceId;
    if (here && entry && (target.agentId === null || entry.key === target.key)) return true;
    if (now >= jump.until) return true;
    if (jump.asked) return false;
    const tab = here && entry && target.agentId !== null ? document.querySelector(agentTabOf(target)) : null;
    if (tab && !jump.acted && tab.getAttribute("aria-selected") !== "true") {
      jump.acted = true;
      jump.askAt = now + RETRY_MS;
      tab.click();
    } else if (now >= jump.askAt || !(jump.acted || (here && !entry))) {
      // Not waiting for a click to land, nor for the screen to catch up with the URL: the tab
      // is in another workspace, closed, or selected in a pane without the focus.
      jump.acted = jump.asked = true;
      open(target);
    }
    return false;
  }

  /**
   * Has the app open an entry. An agent goes through the app's own event, which leaves the
   * other workspaces mounted and the other agents unread. A workspace has only its sidebar
   * row. The entry's URL is the last resort: it is slower and unmounts the other workspaces.
   */
  function open(target: Entry): void {
    if (target.agentId !== null) {
      const detail = { data: { serverId: target.serverId, agentId: target.agentId } };
      if (!window.dispatchEvent(new CustomEvent(OPEN_AGENT, { cancelable: true, detail }))) return;
    } else {
      const row = document.querySelector(sidebarRowOf(target));
      if (row) return row.click();
    }
    // Expo Router follows the URL on popstate.
    history.pushState(null, "", target.path);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }

  /**
   * Records the tab on screen. An agent tab replaces the entry of its own workspace: that
   * entry would now lead to this same tab.
   */
  function track(): void {
    clearTimeout(poll);
    noteClosed();
    const jumped = pending?.entry;
    const entry = current(pending?.acted ? jumped?.key : undefined);
    if (pending && !arrive(pending, entry)) {
      poll = setTimeout(track, POLL_MS);
      return;
    }
    pending = null;
    // Gone, or a workspace jump that landed on an agent tab with its own entry.
    if (jumped && entry?.key !== jumped.key) list = drop(list, jumped.key);
    const front = list[0];
    const recorded =
      !jumped && front?.key === entry?.key && front?.title === entry?.title && front?.workspace === entry?.workspace;
    if (entry && !recorded) list = visit(drop(list, workspaceKey(entry)), entry);
    if (entry) last = entry.key;
    save();
    refresh(closed());
  }

  /**
   * The agents among the listed entries whose tab was closed: their workspace is mounted and
   * shows tabs, and theirs is not one. Closing a tab archives its agent, except for a subagent.
   */
  function closed(): Entry[] {
    const decks = new Map<string | null, Elem>();
    for (const deck of document.querySelectorAll(`[data-testid^="${DECK_PREFIX}"]`)) {
      if (deck.querySelector(ANY_TAB)) decks.set(deck.getAttribute("data-testid"), deck);
    }
    return list.slice(0, SHOWN).filter((entry) => {
      const deck = decks.get(`${DECK_PREFIX}${entry.serverId}:${entry.workspaceId}`);
      return entry.agentId !== null && deck && !deck.querySelector(testId(`${TAB_PREFIX}agent_${entry.agentId}`));
    });
  }

  /** Takes an archived or deleted agent off the list, and off an overlay that is not drawn yet. */
  function forget(key: string): void {
    list = drop(list, key);
    save();
    const index = shown.findIndex((entry) => entry.key === key);
    // A drawn overlay keeps its rows: this one now reads Gone.
    if (selection === null || drawn || index < 0) return;
    shown = drop(shown, key);
    if (shown.length === 0) return press("cancel");
    // A selection on the entry that left moves to the one behind it.
    if (index < selection) selection -= 1;
    selection %= shown.length;
  }

  /** Looks again once the app has settled: a click or a shortcut changes the tab a little later. */
  function onActivity(): void {
    clearTimeout(soon);
    clearTimeout(late);
    soon = setTimeout(track, 150);
    late = setTimeout(() => {
      track();
      snap();
    }, 1000);
  }

  /**
   * Copies the workspace on screen for its entry's card. It runs a second after the last click
   * or shortcut, when the app is idle, and never during a jump.
   */
  function snap(): void {
    if (!cards()) return previews.clear();
    idle(
      () => {
        const entry = current();
        const deck = entry && document.querySelector(deckOf(entry));
        if (!entry || !deck || pending || selection !== null) return;
        const tab = entry.agentId === null ? null : document.querySelector(agentTabOf(entry));
        previews.set(entry.key, capture(deck, PANE, tab?.closest(PANE) ?? null));
        const listed = list.slice(0, SHOWN);
        for (const key of previews.keys()) if (!listed.some((other) => other.key === key)) previews.delete(key);
      },
      { timeout: 2000 },
    );
  }

  function jump(entry: Entry): void {
    if (statuses.get(entry.key) === "gone") return;
    if (entry.key === (pending?.entry.key ?? current()?.key)) return;
    list = visit(list, entry);
    const now = Date.now();
    pending = { entry, until: now + LAND_MS, askAt: now + RETRY_MS, acted: false, asked: false };
    track();
  }

  /**
   * Asks each agent's host for its status, at most once a second, and repaints the overlay
   * as answers arrive. An agent that was archived or deleted leaves the list.
   */
  function refresh(entries: readonly Entry[]): void {
    const listed = (key: string) => [...list, ...shown].some((entry) => entry.key === key);
    for (const key of statuses.keys()) if (!listed(key)) statuses.delete(key);
    for (const key of asked.keys()) if (!listed(key)) asked.delete(key);
    const now = Date.now();
    for (const entry of entries) {
      const { agentId, key } = entry;
      if (agentId === null || now < (asked.get(key) ?? 0) + FRESH_MS) continue;
      const api = apiOf(entry);
      if (!api) continue;
      asked.set(key, now);
      Promise.resolve()
        .then(() => api.agents.ref(agentId).refresh())
        .then((result) => {
          const status = statusOf(result?.agent ?? null, document.querySelector(agentTabOf(entry)) !== null);
          if (status === "gone") forget(key);
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
    overlay.open(shown, selection, statuses, cards() ? previews : undefined);
    refresh(shown);
  }

  function press(key: Key): void {
    const opening = selection === null && key !== "release" && key !== "cancel";
    if (opening) {
      if (!pending) track();
      shown = list.slice(0, SHOWN);
      // Skip entry 0 only when it is the tab on screen.
      first = pending || current()?.key === shown[0]?.key ? 1 : 0;
      // A quick toggle never draws the list, and needs to know only whether its target still exists.
      refresh(shown.slice(first, first + 1));
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
    if (event.metaKey || event.ctrlKey || event.altKey) noteClosed(true);
    if (event.code === "KeyT" && event.metaKey && event.shiftKey && !event.ctrlKey && !event.altKey) {
      // The app's shortcuts run first and cancel the key they take. Cmd+Shift+T is the app's
      // until New terminal is moved off it in Settings → Shortcuts.
      if (event.defaultPrevented) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!event.repeat) reopen();
      return;
    }
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
    noteClosed(true);
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

  function stop(): void {
    for (const [type, listener] of listeners) window.removeEventListener(type, listener, true);
    for (const timer of [soon, late, poll, draw]) clearTimeout(timer);
    overlay.close();
  }
  return { stop, reopen };
}

/** The entry of each given tab of a workspace. */
function entriesOf(place: Place, deck: Elem, tabs: readonly Elem[]): Entry[] {
  const header = (part: string) => deck.querySelector(testId(`workspace-header-${part}`))?.textContent;
  const workspace = [header("subtitle"), header("title")].filter(Boolean).join(" / ");
  return tabs.map((tab) => {
    const tabId = tab.getAttribute("data-testid")?.slice(TAB_PREFIX.length) ?? null;
    return entryFor(place, tabId, tab.getAttribute("aria-label") || document.title, workspace);
  });
}

function load(key: string): Entry[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(stored) ? stored.filter(isEntry) : [];
  } catch {
    return [];
  }
}

function store(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage is full or blocked: the lists still work until the window closes.
  }
}
