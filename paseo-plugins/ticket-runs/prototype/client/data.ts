import { useRpc } from "@getpaseo/plugin/client";
import { useQuery } from "@tanstack/react-query";
import { statusRpc, type Run, type Status, type Ticket } from "../shared/status";
import { elapsed } from "./time";

export type Tone = "success" | "warning" | "danger" | "muted";

export const STATUS_KEY = ["status"] as const;

/** The sidebar row and the screen share this query through the plugin's query client. */
export function useStatus(refetchInterval: number) {
  const getStatus = useRpc(statusRpc);
  return useQuery({ queryKey: STATUS_KEY, queryFn: () => getStatus({}), refetchInterval });
}

export interface StatusMark {
  icon: string;
  tone: Tone;
}

const MARKS: Record<Ticket["state"], StatusMark> = {
  waiting: { icon: "Clock", tone: "muted" },
  working: { icon: "CirclePlay", tone: "success" },
  ready_to_merge: { icon: "GitMerge", tone: "success" },
  checks_failed: { icon: "CircleX", tone: "danger" },
  your_decision: { icon: "Eye", tone: "warning" },
  idle_no_pr: { icon: "Moon", tone: "muted" },
  closed_agent_running: { icon: "CircleAlert", tone: "warning" },
  could_not_start: { icon: "CircleAlert", tone: "danger" },
  not_started: { icon: "CircleSlash", tone: "muted" },
};

/** The icon a ticket leads with in a list row and in the dependency tree. */
export function statusMark(ticket: Ticket): StatusMark {
  return MARKS[ticket.state];
}

export type GroupKey = "soon" | "working" | "needs_you" | "blocked";

export interface Group {
  key: GroupKey;
  label: string;
  mark: StatusMark;
  tickets: Ticket[];
  /** One line under or beside the label, such as "10 to merge · 1 failed". */
  summary: string | null;
  /** Rows offer "Start now". */
  startNow: boolean;
}

/** Order of the reasons inside "Needs you". */
const NEEDS_YOU_ORDER: readonly Ticket["state"][] = [
  "ready_to_merge",
  "checks_failed",
  "your_decision",
  "idle_no_pr",
  "closed_agent_running",
  "could_not_start",
];
const BLOCKED_ORDER: readonly Ticket["reason"][] = ["blocked", "no_ready_label", "assigned_no_agent"];

function byInstant(a: Ticket, b: Ticket): number {
  if (a.at === b.at) return a.id.localeCompare(b.id);
  if (a.at === null) return 1;
  if (b.at === null) return -1;
  return a.at < b.at ? -1 : 1;
}

function needsYou(run: Run): Ticket[] {
  return run.tickets
    .filter((t) => NEEDS_YOU_ORDER.includes(t.state))
    .sort((a, b) => NEEDS_YOU_ORDER.indexOf(a.state) - NEEDS_YOU_ORDER.indexOf(b.state) || byInstant(a, b));
}

function needsYouSummary(tickets: Ticket[]): string {
  const count = (...states: Ticket["state"][]) => tickets.filter((t) => states.includes(t.state)).length;
  const parts: [number, string][] = [
    [count("ready_to_merge"), "to merge"],
    [count("checks_failed"), "failed"],
    [count("your_decision"), "in review"],
    [count("idle_no_pr"), "idle"],
    [count("closed_agent_running", "could_not_start"), "other"],
  ];
  return parts
    .filter(([n]) => n > 0)
    .map(([n, label]) => `${n} ${label}`)
    .join(" · ");
}

/** The groups of the main list in display order; empty ones are left out. */
export function groupsOf(run: Run): Group[] {
  const inState = (state: Ticket["state"]) => run.tickets.filter((t) => t.state === state).sort(byInstant);
  const waiting = needsYou(run);
  const blocked = run.tickets
    .filter((t) => t.state === "not_started")
    .sort((a, b) => BLOCKED_ORDER.indexOf(a.reason) - BLOCKED_ORDER.indexOf(b.reason) || a.id.localeCompare(b.id));
  const groups: Group[] = [
    { key: "soon", label: "Starting soon", mark: MARKS.waiting, tickets: inState("waiting"), summary: null, startNow: true },
    { key: "working", label: "Working", mark: MARKS.working, tickets: inState("working"), summary: null, startNow: false },
    {
      key: "needs_you",
      label: "Needs you",
      mark: { icon: "UserRound", tone: "warning" },
      tickets: waiting,
      summary: needsYouSummary(waiting),
      startNow: false,
    },
    { key: "blocked", label: "Blocked", mark: MARKS.not_started, tickets: blocked, summary: null, startNow: false },
  ];
  return groups.filter((group) => group.tickets.length > 0);
}

export function needsYouCount(run: Run): number {
  return run.tickets.filter((t) => NEEDS_YOU_ORDER.includes(t.state)).length;
}

export interface Segment {
  text: string;
  tone?: Tone;
}

/** The short text at the right of a list row. `at` renders a clock time. */
export function rowDetail(t: Ticket, now: number, at: (iso: string) => string): Segment[] {
  const idle = t.at ? elapsed(t.at, now) : null;
  const after = (text: string): Segment[] => (idle ? [{ text: `${text} · ${idle}` }] : [{ text }]);
  switch (t.state) {
    case "waiting":
      return [{ text: t.at ? `starts ${at(t.at)}` : "starts at the next check" }];
    case "working":
      return [{ text: t.at ? `since ${at(t.at)}` : "running" }];
    case "ready_to_merge":
      return [{ text: `PR #${t.pr} ` }, { text: "passed", tone: "success" }, ...(idle ? [{ text: ` · ${idle}` }] : [])];
    case "checks_failed":
      return [{ text: `PR #${t.pr} ` }, { text: "failed", tone: "danger" }, ...(idle ? [{ text: ` · ${idle}` }] : [])];
    case "your_decision":
      return after("In Review");
    case "idle_no_pr":
      return [{ text: idle ? `idle ${idle}` : "idle" }];
    case "closed_agent_running":
      return [{ text: "ticket closed, agent still running" }];
    case "could_not_start":
      return [{ text: `could not start: ${t.error ?? "unknown error"}`, tone: "danger" }];
    case "not_started":
      if (t.reason === "blocked") return [{ text: `by ${t.blockedBy.join(", ")}` }];
      if (t.reason === "no_ready_label") return [{ text: "no ready-for-agent label" }];
      return [{ text: "assigned, no agent" }];
  }
}

export interface TreeNode {
  id: string;
  /** Null when the blocker is not a ticket of this run. */
  ticket: Ticket | null;
  children: TreeNode[];
}

/**
 * What unblocks what: each root is a blocker that nothing in the run blocks, with the tickets
 * it blocks nested under it. A ticket with two blockers appears under both.
 */
export function dependencyTree(run: Run): TreeNode[] {
  const byId = new Map(run.tickets.map((t) => [t.id, t]));
  const dependents = new Map<string, string[]>();
  for (const t of run.tickets) {
    for (const blocker of t.blockedBy) dependents.set(blocker, [...(dependents.get(blocker) ?? []), t.id]);
  }
  const node = (id: string, path: readonly string[]): TreeNode => ({
    id,
    ticket: byId.get(id) ?? null,
    children: (dependents.get(id) ?? [])
      .filter((child) => !path.includes(child))
      .sort()
      .map((child) => node(child, [...path, id])),
  });
  // Blockers outside the run sort last: the run cannot act on them.
  const outside = (id: string) => (byId.has(id) ? 0 : 1);
  return [...dependents.keys()]
    .filter((id) => (byId.get(id)?.blockedBy.length ?? 0) === 0)
    .sort((a, b) => outside(a) - outside(b) || a.localeCompare(b))
    .map((id) => node(id, []));
}

export interface Summary {
  needsYou: number;
  /** Worst check state over all runs. */
  alert: "failed" | "stale" | null;
}

export function summarize(status: Status): Summary {
  const states = status.runs.map((run) => run.health.state);
  return {
    needsYou: status.runs.reduce((sum, run) => sum + needsYouCount(run), 0),
    alert: states.includes("failed") ? "failed" : states.includes("stale") ? "stale" : null,
  };
}

/** Runs still being checked first, finished ones last. */
export function orderedRuns(status: Status): Run[] {
  const finished = (run: Run) => (run.health.state === "finished" ? 1 : 0);
  return [...status.runs].sort((a, b) => finished(a) - finished(b));
}

type MaybeRunId = string | undefined;
let chosenRun: MaybeRunId;

/**
 * The run last chosen with the tabs, kept while the app runs. The tabs do not write screen
 * params: `openScreen` with other params puts a second copy of the screen on the back stack.
 */
export function rememberRun(runId: string) {
  chosenRun = runId;
}

export function rememberedRun(): MaybeRunId {
  return chosenRun;
}
