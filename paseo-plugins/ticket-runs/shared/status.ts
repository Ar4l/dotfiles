import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

/** ISO 8601 instant. The client formats every clock time in the device's time zone. */
const instant = z.string();

export const NEEDS_YOU_STATES = ["ready_to_merge", "checks_failed", "idle", "closed_agent_running", "could_not_start"] as const;

const pullRequest = z.object({
  number: z.number(),
  url: z.string().nullable(),
  state: z.enum(["open", "merged", "closed"]),
  checks: z.enum(["passed", "failed", "running", "none"]),
});

const ticket = z.object({
  id: z.string(),
  title: z.string(),
  state: z.enum([...NEEDS_YOU_STATES, "working", "waiting", "not_started"]),
  /** Name of the ticket's state in Linear, such as "In Review". */
  linearState: z.string(),
  /** The ticket's running agent, else its latest one. Null when it has none. */
  agentId: z.string().nullable(),
  /** Pull request of the branch in the ticket's workspace: needs-you states. */
  pr: pullRequest.nullable(),
  /** Idle since (needs-you states), running since (`working`), or planned start (`waiting`). */
  at: instant.nullable(),
  /** When a check first saw the ticket. */
  addedAt: instant.nullable(),
  /** Why an open ticket does not start: `not_started`, and `idle` when its agents gave it back too often. */
  reason: z.enum(["blocked", "sub_tickets", "no_label", "assigned_no_agent", "given_back"]).nullable(),
  /** Ids of the open tickets that block this one. */
  blockedBy: z.array(z.string()),
  /** Start error: `could_not_start`. */
  error: z.string().nullable(),
});

const health = z.object({
  state: z.enum(["ok", "paused_by_user", "failed", "stale", "finished"]),
  /** The run only reads: it starts no agent and writes nothing to Linear. */
  watching: z.boolean(),
  /** Last completed check, successful or not. */
  checkedAt: instant.nullable(),
  /** Next scheduled check; null when none is known. */
  nextCheckAt: instant.nullable(),
  /** Outcome of the last successful check, such as "started TEST-352". */
  lastResult: z.string().nullable(),
  /** Short error text of the last check: `failed`. */
  error: z.string().nullable(),
});

const start = z.object({
  id: z.string(),
  title: z.string(),
  startedAt: instant,
  agentId: z.string().nullable(),
});

const run = z.object({
  id: z.string(),
  title: z.string(),
  health,
  /** The label a ticket needs to start, when the run asks for one. */
  label: z.string().nullable(),
  /** The run's settings in words, written by the script: "Starts", "Prompt", "Agent" and so on. */
  what: z.array(z.object({ label: z.string(), text: z.string() })),
  tickets: z.array(ticket),
  /** Latest starts, newest first. */
  recent: z.array(start),
});

export type Run = z.infer<typeof run>;
export type Ticket = z.infer<typeof ticket>;
export type PullRequest = z.infer<typeof pullRequest>;
export type Health = z.infer<typeof health>;
export type Start = z.infer<typeof start>;
export type Status = z.infer<typeof status>;
export type Done = z.infer<typeof done>;

const status = z.object({ runs: z.array(run) });
/** `pending`: the script still runs; the screen shows the result when it ends. */
const done = z.object({ ok: z.boolean(), pending: z.boolean() });
const ticketRef = z.object({ runId: z.string(), ticketId: z.string() });

export const statusRpc = defineRpc({ name: "status.get", input: z.object({}), output: status });
export const pauseRpc = defineRpc({
  name: "pause.set",
  input: z.object({ runId: z.string(), paused: z.boolean() }),
  output: done,
});
export const checkRpc = defineRpc({
  name: "check.now",
  input: z.object({ runId: z.string() }),
  output: done,
});
export const startRpc = defineRpc({ name: "start.now", input: ticketRef, output: done });
export const replaceAgentRpc = defineRpc({ name: "agent.replace", input: ticketRef, output: done });
