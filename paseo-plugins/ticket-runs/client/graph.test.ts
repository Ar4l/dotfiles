import assert from "node:assert/strict";
import { test } from "node:test";
import type { Run, Ticket } from "../shared/status";
import { NODE_H, chain, drawGraph, layoutGraph, neighbours } from "./graph.ts";

function ticket(id: string, blockedBy: string[] = []): Ticket {
  return {
    id,
    title: `Title of ${id} <&>`,
    state: "not_started",
    linearState: "Todo",
    agentId: null,
    pr: null,
    at: null,
    addedAt: null,
    reason: null,
    blockedBy,
    error: null,
  };
}

function run(tickets: Ticket[]): Run {
  const health = { state: "ok" as const, watching: false, checkedAt: null, nextCheckAt: null, lastResult: null, error: null };
  return { id: "T-1", title: "Run", health, label: null, what: [], tickets, recent: [] };
}

const colors = { outline: () => "#111", fill: "#222", text: "#333", muted: "#444", edge: "#555", highlight: "#666" };

test("a run where nothing blocks anything has no graph", () => {
  assert.equal(layoutGraph(run([ticket("T-2"), ticket("T-3")])), null);
});

test("blockers sit left of what they block, and unlinked tickets are left out", () => {
  const graph = layoutGraph(run([ticket("T-2"), ticket("T-3", ["T-2"]), ticket("T-4", ["T-3", "X-9"]), ticket("T-5")]));
  assert.ok(graph);
  const layer = Object.fromEntries(graph.nodes.map((n) => [n.id, n.layer]));
  assert.deepEqual(layer, { "T-2": 0, "X-9": 0, "T-3": 1, "T-4": 2 });
  // Numbers for the run's own team, the whole id for another team's blocker, which is no ticket of the run.
  assert.deepEqual(Object.fromEntries(graph.nodes.map((n) => [n.id, n.label])), { "T-2": "2", "X-9": "X-9", "T-3": "3", "T-4": "4" });
  assert.equal(graph.nodes.find((n) => n.id === "X-9")?.ticket, null);
  const left = new Map(graph.nodes.map((n) => [n.id, n.x]));
  for (const edge of graph.edges) {
    assert.ok((left.get(edge.from) ?? NaN) < (left.get(edge.to) ?? NaN), `${edge.from} is left of ${edge.to}`);
  }
});

test("no two tickets overlap, and all lie inside the picture", () => {
  const tickets = [ticket("T-2"), ticket("T-3")];
  for (let n = 4; n < 40; n++) tickets.push(ticket(`T-${n}`, n % 3 === 0 ? ["T-2", "T-3"] : [`T-${n - 1}`, "T-2"].slice(0, (n % 2) + 1)));
  const graph = layoutGraph(run(tickets));
  assert.ok(graph);
  const seen = new Set<string>();
  for (const node of graph.nodes) {
    const key = `${node.x}:${node.y}`;
    assert.ok(!seen.has(key), `two tickets at ${key}`);
    seen.add(key);
    assert.ok(node.x >= 0 && node.y >= 0 && node.x + graph.nodeWidth <= graph.width && node.y + NODE_H <= graph.height);
  }
});

test("a link that a longer chain implies is not drawn, but still counts", () => {
  const graph = layoutGraph(run([ticket("T-2"), ticket("T-3", ["T-2"]), ticket("T-4", ["T-2", "T-3"])]));
  assert.ok(graph);
  assert.equal(graph.edges.length, 3);
  assert.deepEqual(graph.drawn, [{ from: "T-2", to: "T-3" }, { from: "T-3", to: "T-4" }]);
  assert.deepEqual(neighbours(graph, "T-4").blockedBy.sort(), ["T-2", "T-3"]);
  // Unselected: two links. With T-4 selected, all its links show, the implied one too.
  assert.equal(drawGraph(graph, colors, null).svg.split("<path").length - 1, 2);
  assert.equal(drawGraph(graph, colors, "T-4").svg.split("<path").length - 1, 3);
});

test("a ticket's chain is all that must finish first and all that waits for it", () => {
  // 2 -> 3 -> 4 -> 6, and 5 -> 6. Ticket 7 hangs off 2 alone.
  const graph = layoutGraph(run([ticket("T-2"), ticket("T-3", ["T-2"]), ticket("T-4", ["T-3"]), ticket("T-5"), ticket("T-6", ["T-4", "T-5"]), ticket("T-7", ["T-2"])]));
  assert.ok(graph);
  const whole = chain(graph, "T-4");
  assert.deepEqual([...whole.before].sort(), ["T-2", "T-3"]);
  assert.deepEqual([...whole.after], ["T-6"]);
  assert.deepEqual([...whole.all].sort(), ["T-2", "T-3", "T-4", "T-6"]);
  // The chain stays bright; T-5 and T-7 dim.
  const dimmed = (svg: string) => svg.split('<g opacity="0.3">').length - 1;
  assert.equal(dimmed(drawGraph(graph, colors, "T-4").svg), 2);
  assert.equal(dimmed(drawGraph(graph, colors, null).svg), 0);
  // Without a selection, `show` picks what stays bright.
  assert.equal(dimmed(drawGraph(graph, colors, null, (node) => node.id === "T-5").svg), 5);
});

test("two tickets that block each other still draw", () => {
  const graph = layoutGraph(run([ticket("T-2", ["T-3"]), ticket("T-3", ["T-2"])]));
  assert.ok(graph);
  assert.equal(graph.nodes.length, 2);
  assert.deepEqual([...chain(graph, "T-2").all].sort(), ["T-2", "T-3"]);
});

test("the picture is a square SVG that escapes titles and tags the selected ticket", () => {
  const graph = layoutGraph(run([ticket("T-2"), ticket("T-3", ["T-2"])]));
  assert.ok(graph);
  const plain = drawGraph(graph, colors, null);
  assert.equal(plain.tag, null);
  assert.match(plain.svg, new RegExp(`^<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${plain.size} ${plain.size}"`));
  assert.ok(plain.size >= graph.width && plain.size >= graph.height);
  const picked = drawGraph(graph, colors, "T-3");
  assert.ok(picked.tag && picked.tag.x >= 0 && picked.tag.x + picked.tag.width <= graph.width);
  assert.ok(picked.svg.includes("&lt;&amp;&gt;") || picked.svg.includes("…"));
  assert.ok(!picked.svg.includes("<&>"));
});
