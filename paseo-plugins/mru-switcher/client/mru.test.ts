import assert from "node:assert/strict";
import { test } from "node:test";
import { CAP, type Entry, type Key, type Selection, drop, entryFor, placeOf, step, visit, workspaceKey } from "./mru.ts";

const entry = (n: number): Entry => ({ key: `agent:srv/${n}`, path: `/h/srv/agent/${n}`, title: `Agent ${n}` });

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
  assert.deepEqual(entryFor(place!, "agent_abc", "Fix bug"), {
    key: "agent:srv/abc",
    path: "/h/srv/agent/abc",
    title: "Fix bug",
  });
});

test("any other tab is tracked as its workspace", () => {
  const expected = { key: "ws:srv/wks_1", path: "/h/srv/workspace/wks_1", title: "zsh" };
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
