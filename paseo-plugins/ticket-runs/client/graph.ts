import type { Run, Ticket } from "../shared/status";

/**
 * The dependency graph of a run: what blocks what, drawn left to right. A plugin has no
 * drawing surface, so the graph is one SVG document that Paseo's `Icon` renders; taps come
 * from buttons laid over the nodes. This module only computes: it imports nothing at run time.
 */

export const NODE_H = 22;
const GAP_X = 28;
const GAP_Y = 6;
const PAD = 4;
const TAG_H = 20;

export interface GraphNode {
  id: string;
  /** What the node shows: the ticket's number, or its whole id when it is of another team. */
  label: string;
  /** Null when the blocker is not a ticket of this run. */
  ticket: Ticket | null;
  /** 0 for a ticket nothing in the graph blocks; else one more than its deepest blocker. */
  layer: number;
  /** Top left corner. */
  x: number;
  y: number;
}

export interface GraphEdge {
  /** The blocker. */
  from: string;
  /** The ticket it blocks. */
  to: string;
}

export interface Graph {
  nodes: GraphNode[];
  /** Every blocking link between two nodes. */
  edges: GraphEdge[];
  /** The links worth drawing: `edges` without those that a longer chain already implies. */
  drawn: GraphEdge[];
  nodeWidth: number;
  width: number;
  height: number;
}

function number(id: string): number {
  return Number(id.slice(id.lastIndexOf("-") + 1)) || 0;
}

/** Lay out every ticket that blocks or is blocked. Null when no open ticket blocks another. */
export function layoutGraph(run: Run): Graph | null {
  const tickets = new Map(run.tickets.map((t) => [t.id, t]));
  const edges: GraphEdge[] = [];
  const ids = new Set<string>();
  for (const t of run.tickets) {
    for (const blocker of t.blockedBy) {
      edges.push({ from: blocker, to: t.id });
      ids.add(blocker).add(t.id);
    }
  }
  if (edges.length === 0) return null;

  const blockers = (id: string) => tickets.get(id)?.blockedBy ?? [];
  const layers = new Map<string, number>();
  const depth = (id: string, path: Set<string>): number => {
    const known = layers.get(id);
    if (known !== undefined) return known;
    if (path.has(id)) return 0; // a cycle: Linear allows A blocks B blocks A
    path.add(id);
    const layer = blockers(id).reduce((deepest, b) => Math.max(deepest, depth(b, path) + 1), 0);
    path.delete(id);
    layers.set(id, layer);
    return layer;
  };
  for (const id of ids) depth(id, new Set());

  const columns: string[][] = [];
  for (const id of [...ids].sort((a, b) => number(a) - number(b) || a.localeCompare(b))) {
    (columns[layers.get(id) ?? 0] ??= []).push(id);
  }
  // Fewer crossings: order each column by where its blockers sit in the columns before it.
  const row = new Map<string, number>();
  columns.forEach((column, layer) => {
    if (layer > 0) {
      const mean = (id: string) => {
        const rows = blockers(id).map((b) => row.get(b)).filter((r): r is number => r !== undefined);
        return rows.length > 0 ? rows.reduce((sum, r) => sum + r, 0) / rows.length : 0;
      };
      const means = new Map(column.map((id) => [id, mean(id)]));
      column.sort((a, b) => (means.get(a) ?? 0) - (means.get(b) ?? 0) || number(a) - number(b));
    }
    // Rows are counted from the middle of the tallest column, so short columns sit centred.
    column.forEach((id, index) => row.set(id, index - (column.length - 1) / 2));
  });

  // A blocks B blocks C makes "A blocks C" redundant. A real run had 189 links, most of them
  // implied this way; without them the picture is readable and says the same.
  const above = new Map<string, Set<string>>();
  const allAbove = (id: string): Set<string> => {
    let known = above.get(id);
    if (!known) {
      known = new Set();
      above.set(id, known);
      for (const b of blockers(id)) {
        if ((layers.get(b) ?? 0) >= (layers.get(id) ?? 0)) continue; // a cycle's back link
        known.add(b);
        for (const further of allAbove(b)) known.add(further);
      }
    }
    return known;
  };
  const drawn = edges.filter(
    (edge) => !blockers(edge.to).some((other) => other !== edge.from && allAbove(other).has(edge.from)),
  );

  // Ids of one team differ only in their number, so the number is the label.
  const team = run.id.slice(0, run.id.lastIndexOf("-") + 1);
  const label = (id: string) => (team && id.startsWith(team) ? id.slice(team.length) : id);
  const nodeWidth = 18 + 7 * Math.max(...[...ids].map((id) => label(id).length));
  const tallest = Math.max(...columns.map((column) => column.length));
  const pitch = NODE_H + GAP_Y;
  const nodes: GraphNode[] = [];
  columns.forEach((column, layer) => {
    for (const id of column) {
      nodes.push({
        id,
        label: label(id),
        ticket: tickets.get(id) ?? null,
        layer,
        x: PAD + layer * (nodeWidth + GAP_X),
        y: PAD + ((row.get(id) ?? 0) + (tallest - 1) / 2) * pitch,
      });
    }
  });
  return {
    nodes,
    edges,
    drawn,
    nodeWidth,
    width: PAD * 2 + columns.length * nodeWidth + (columns.length - 1) * GAP_X,
    height: PAD * 2 + tallest * pitch - GAP_Y,
  };
}

/** The tickets one step away from `id`: what blocks it, and what it blocks. */
export function neighbours(graph: Graph, id: string): { blockedBy: string[]; blocks: string[] } {
  return {
    blockedBy: graph.edges.filter((e) => e.to === id).map((e) => e.from),
    blocks: graph.edges.filter((e) => e.from === id).map((e) => e.to),
  };
}

export interface GraphColors {
  /** Node outline by ticket; `null` is a blocker outside the run. */
  outline(ticket: Ticket | null): string;
  fill: string;
  text: string;
  muted: string;
  edge: string;
  highlight: string;
}

function escape(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * The graph as one SVG document. Paseo draws an icon square, so the canvas is a square of
 * `size` with the graph in its top left corner; the caller clips it to the graph's size.
 * With a `selected` ticket, every link of that ticket is drawn bright, its neighbours stay
 * bright and the rest dims.
 */
export interface Drawing {
  svg: string;
  size: number;
  /** Where the selected ticket's name tag sits, so a button can lie over it. */
  tag: { x: number; y: number; width: number; height: number } | null;
}

export function drawGraph(graph: Graph, colors: GraphColors, selected: string | null): Drawing {
  const size = Math.ceil(Math.max(graph.width, graph.height));
  const at = new Map(graph.nodes.map((n) => [n.id, n]));
  const near = new Set<string>(selected ? [selected] : []);
  if (selected) {
    const { blockedBy, blocks } = neighbours(graph, selected);
    for (const id of [...blockedBy, ...blocks]) near.add(id);
  }
  const parts: string[] = [];
  const lit: string[] = [];
  const touching = (edge: GraphEdge) => selected !== null && (edge.from === selected || edge.to === selected);
  for (const edge of [...graph.drawn.filter((e) => !touching(e)), ...graph.edges.filter(touching)]) {
    const from = at.get(edge.from);
    const to = at.get(edge.to);
    if (!from || !to) continue;
    const x1 = from.x + graph.nodeWidth;
    const y1 = from.y + NODE_H / 2;
    const x2 = to.x;
    const y2 = to.y + NODE_H / 2;
    const bend = Math.max(16, (x2 - x1) / 2);
    const d = `M${x1} ${y1}C${x1 + bend} ${y1} ${x2 - bend} ${y2} ${x2} ${y2}`;
    if (touching(edge)) lit.push(`<path d="${d}" stroke="${escape(colors.highlight)}" stroke-width="1.5" fill="none"/>`);
    else parts.push(`<path d="${d}" stroke="${escape(colors.edge)}" stroke-opacity="${selected ? 0.15 : 0.5}" fill="none"/>`);
  }
  parts.push(...lit); // bright links lie over the dim ones
  for (const node of graph.nodes) {
    const dim = selected !== null && !near.has(node.id);
    const chosen = node.id === selected;
    const outline = chosen ? colors.highlight : colors.outline(node.ticket);
    parts.push(
      `<g opacity="${dim ? 0.3 : 1}">` +
        `<rect x="${node.x}" y="${node.y}" width="${graph.nodeWidth}" height="${NODE_H}" rx="6" fill="${escape(colors.fill)}" ` +
        `stroke="${escape(outline)}" stroke-width="${chosen ? 2 : 1.25}"${node.ticket ? "" : ' stroke-dasharray="3 3"'}/>` +
        `<text x="${node.x + graph.nodeWidth / 2}" y="${node.y + NODE_H / 2 + 4}" text-anchor="middle" font-size="11" ` +
        `font-family="system-ui, sans-serif" fill="${escape(node.ticket ? colors.text : colors.muted)}">${escape(node.label)}</text>` +
        `</g>`,
    );
  }
  // The selected ticket's id and title, in a tag right above it (below, at the top edge).
  let tag: Drawing["tag"] = null;
  const chosen = selected ? at.get(selected) : undefined;
  if (chosen) {
    const room = graph.width - 2 * PAD;
    const full = `${chosen.id} ${chosen.ticket ? chosen.ticket.title : "not in this run"}`;
    const fits = Math.max(4, Math.floor((room - 14) / 6.2));
    const text = full.length > fits ? `${full.slice(0, fits - 1)}…` : full;
    const width = Math.min(room, Math.ceil(text.length * 6.2 + 14));
    const x = Math.min(Math.max(PAD, chosen.x + graph.nodeWidth / 2 - width / 2), graph.width - PAD - width);
    const above = chosen.y - TAG_H - 4;
    tag = { x, y: above >= 0 ? above : chosen.y + NODE_H + 4, width, height: TAG_H };
    parts.push(
      `<rect x="${tag.x}" y="${tag.y}" width="${width}" height="${TAG_H}" rx="5" fill="${escape(colors.highlight)}"/>` +
        `<text x="${tag.x + 7}" y="${tag.y + 14}" font-size="11" font-family="system-ui, sans-serif" ` +
        `fill="${escape(colors.fill)}">${escape(text)}</text>`,
    );
  }
  return {
    size,
    tag,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">${parts.join("")}</svg>`,
  };
}
