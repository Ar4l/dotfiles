import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CAP,
  ago,
  type Entry,
  type Key,
  type Selection,
  cardWidth,
  drop,
  entryFor,
  isEntry,
  placeOf,
  promptedAt,
  statusOf,
  step,
  visit,
  workspaceKey,
} from "./mru.ts";

const entry = (n: number): Entry => entryFor({ serverId: "srv", workspaceId: "wks_1" }, `agent_${n}`, `Agent ${n}`);

/** Feeds keys to a closed overlay listing `count` entries and returns the index it jumps to. */
function press(keys: Key[], count = 7, start = 1): number | null {
  let selection: Selection = null;
  let jump: number | null = null;
  for (const key of keys) ({ selection, jump } = step(selection, key, count, start));
  assert.equal(selection, null, "the overlay closes after the last key");
  return jump;
}

const tabs = (n: number): Key[] => Array<Key>(n).fill("tab");

test("an agent tab is tracked by its stable agent URL", () => {
  const place = placeOf("/h/srv/workspace/wks_1");
  assert.deepEqual(place, { serverId: "srv", workspaceId: "wks_1" });
  assert.deepEqual(entryFor(place!, "agent_abc", "Fix bug", "dotfiles / main"), {
    key: "agent:srv/abc",
    path: "/h/srv/agent/abc",
    title: "Fix bug",
    serverId: "srv",
    workspaceId: "wks_1",
    agentId: "abc",
    workspace: "dotfiles / main",
  });
});

test("any other tab is tracked as its workspace", () => {
  const expected = {
    key: "ws:srv/wks_1",
    path: "/h/srv/workspace/wks_1",
    title: "zsh",
    serverId: "srv",
    workspaceId: "wks_1",
    agentId: null,
    workspace: "",
  };
  assert.deepEqual(entryFor(placeOf("/h/srv/workspace/wks_1")!, "terminal_9", "zsh"), expected);
  assert.deepEqual(entryFor(placeOf("/h/srv/workspace/wks_1/")!, null, "zsh"), expected);
});

test("an agent visit replaces the entry of its own workspace", () => {
  const place = placeOf("/h/srv/workspace/wks_1")!;
  const other = entryFor(placeOf("/h/srv/workspace/wks_2")!, null, "other");
  const list = [entryFor(place, "terminal_9", "zsh"), other];
  const agent = entryFor(place, "agent_abc", "Fix bug");
  assert.deepEqual(visit(drop(list, workspaceKey(place)), agent), [agent, other]);
});

test("routes outside a workspace are not tracked", () => {
  for (const path of ["/", "/settings", "/h/srv/agent/abc", "/h/srv/plugins/x/go", "/h/srv/workspace/w/extra"]) {
    assert.equal(placeOf(path), null, path);
  }
});

test("visiting moves an entry to the front and keeps its newest title", () => {
  const list = [1, 2, 3].reduce<Entry[]>((acc, n) => visit(acc, entry(n)), []);
  assert.deepEqual(list.map((e) => e.key), ["agent:srv/3", "agent:srv/2", "agent:srv/1"]);
  const again = visit(list, { ...entry(1), title: "Renamed" });
  assert.deepEqual(again.map((e) => e.title), ["Renamed", "Agent 3", "Agent 2"]);
});

test("the list is capped at 20 entries", () => {
  let list: Entry[] = [];
  for (let n = 1; n <= 25; n++) list = visit(list, entry(n));
  assert.equal(list.length, CAP);
  assert.equal(list[0].key, "agent:srv/25");
  assert.equal(list.at(-1)?.key, "agent:srv/6");
});

test("Ctrl+Tab then release selects entry 1", () => {
  assert.equal(press(["tab", "release"]), 1);
});

test("six Tabs select entry 6 and a seventh wraps to entry 0", () => {
  assert.equal(press([...tabs(6), "release"]), 6);
  assert.equal(press([...tabs(7), "release"]), 0);
});

test("Shift+Tab walks back", () => {
  assert.equal(press(["tab", "tab", "tab", "shift-tab", "release"]), 2);
  assert.equal(press(["tab", "shift-tab", "shift-tab", "release"]), 6);
  assert.equal(press(["shift-tab", "release"]), 6, "opening backwards starts at the last entry");
});

test("the first Tab lands on entry 0 when it is not the tab on screen", () => {
  assert.equal(press(["tab", "release"], 7, 0), 0);
});

test("short lists wrap within their length", () => {
  assert.equal(press(["tab", "release"], 1), 0);
  assert.equal(press(["tab", "tab", "release"], 2), 0);
  assert.equal(press(["tab", "release"], 0), null);
});

test("Escape and blur select nothing", () => {
  assert.equal(press(["tab", "tab", "cancel"]), null);
  assert.equal(press(["tab", "cancel", "release"]), null, "a release after a cancel does not jump");
  assert.equal(press(["release"]), null, "a release with the overlay closed does not jump");
});

test("a failed jump drops the entry", () => {
  const list = [1, 2, 3].reduce<Entry[]>((acc, n) => visit(acc, entry(n)), []);
  assert.deepEqual(drop(list, "agent:srv/2").map((e) => e.key), ["agent:srv/3", "agent:srv/1"]);
});

test("entries stored by an older version are not loaded", () => {
  assert.equal(isEntry(entry(1)), true);
  assert.equal(isEntry(entryFor(placeOf("/h/srv/workspace/wks_1")!, "terminal_9", "zsh")), true);
  assert.equal(isEntry({ key: "agent:srv/1", path: "/h/srv/agent/1", title: "Agent 1" }), false);
  assert.equal(isEntry(null), false);
});

test("an agent's status follows the app's own rules, most urgent first", () => {
  const idle = { status: "idle", requiresAttention: false, attentionReason: null, pendingPermissions: [] };
  assert.equal(statusOf(idle), "done");
  assert.equal(statusOf({ ...idle, requiresAttention: true, attentionReason: "finished" }), "attention");
  assert.equal(statusOf({ ...idle, status: "running" }), "running");
  assert.equal(statusOf({ ...idle, status: "running", requiresAttention: true }), "running");
  assert.equal(statusOf({ ...idle, status: "error" }), "failed");
  assert.equal(statusOf({ ...idle, requiresAttention: true, attentionReason: "error" }), "failed");
  assert.equal(statusOf({ ...idle, status: "running", pendingPermissions: [{}] }), "needs_input");
  assert.equal(statusOf({ ...idle, status: "error", attentionReason: "permission" }), "needs_input");
  assert.equal(statusOf({ status: "idle" }), "done");
});

test("a row says how long ago its agent was last prompted, in the app's words", () => {
  const now = Date.parse("2026-11-16T12:00:00Z");
  const minute = 60_000;
  assert.equal(promptedAt({ status: "idle", lastUserMessageAt: "2026-11-16T11:55:00Z" }), now - 5 * minute);
  assert.equal(promptedAt({ status: "idle", lastUserMessageAt: null }), null);
  assert.equal(promptedAt({ status: "idle" }), null);
  assert.equal(promptedAt(null), null);
  assert.equal(ago(now - 59_000, now), "just now");
  assert.equal(ago(now - 5 * minute, now), "5m ago");
  assert.equal(ago(now - 59 * minute, now), "59m ago");
  assert.equal(ago(now - 60 * minute, now), "1h ago");
  assert.equal(ago(now - 47 * 60 * minute, now), "1d ago");
  assert.equal(ago(now - 6 * 24 * 60 * minute, now), "6d ago");
  assert.equal(ago(new Date(2026, 9, 3, 12).getTime(), now), "Oct 3");
});

test("an archived or deleted agent is gone, unless its tab is open", () => {
  const archived = { status: "closed", archivedAt: "2026-11-16T05:49:03.938Z" };
  assert.equal(statusOf(null), "gone");
  assert.equal(statusOf(null, true), "gone");
  assert.equal(statusOf(archived), "gone");
  assert.equal(statusOf(archived, true), "done");
  assert.equal(statusOf({ status: "running", archivedAt: null }), "running");
});

test("cards share the window's width, and a few cards stay narrow", () => {
  for (const width of [600, 1400, 2560]) {
    const row = 7 * cardWidth(7, width) + 6 * 6 + 12;
    assert.ok(row <= width * 0.94 && row <= 1180, `seven cards fit a ${width} px window`);
  }
  assert.equal(cardWidth(7, 1400), 161);
  assert.equal(cardWidth(2, 1400), 220);
});
