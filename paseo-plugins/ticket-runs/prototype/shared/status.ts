import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

/** ISO 8601 instant. The client formats every clock time in UTC+8. */
const instant = z.string();

export const NEEDS_YOU_STATES = [
  "ready_to_merge",
  "checks_failed",
  "your_decision",
  "idle_no_pr",
  "closed_agent_running",
  "could_not_start",
] as const;

const ticket = z.object({
  id: z.string(),
  title: z.string(),
  state: z.enum([...NEEDS_YOU_STATES, "working", "waiting", "not_started"]),
  /** Null when the ticket has no agent: `waiting`, `not_started` and `could_not_start`. */
  agentId: z.string().nullable(),
  /** Open pull request number: `ready_to_merge` and `checks_failed`. */
  pr: z.number().nullable(),
  /** Idle since (needs-you states), running since (`working`), or planned start (`waiting`). */
  at: instant.nullable(),
  /** When the ticket joined the run: `waiting`. */
  addedAt: instant.nullable(),
  /** Why an open ticket cannot start yet: `not_started`. */
  reason: z.enum(["blocked", "no_ready_label", "assigned_no_agent"]).nullable(),
  /** Ids of the blocking tickets: reason `blocked`. */
  blockedBy: z.array(z.string()),
  /** Start error: `could_not_start`. */
  error: z.string().nullable(),
});

const health = z.object({
  state: z.enum(["ok", "paused_by_user", "failed", "stale", "finished"]),
  /** Last completed check, successful or not. */
  checkedAt: instant.nullable(),
  /** Next scheduled check; null when none is scheduled. */
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
  rules: z.object({
    /** Minutes between checks. */
    checkEveryMin: z.number(),
    /** Minutes a ticket added after the run started waits before it starts. */
    newTicketWaitMin: z.number(),
  }),
  tickets: z.array(ticket),
  /** Latest starts, newest first. */
  recent: z.array(start),
});

export type Run = z.infer<typeof run>;
export type Ticket = z.infer<typeof ticket>;
export type Health = z.infer<typeof health>;
export type Start = z.infer<typeof start>;
export type Status = z.infer<typeof status>;

const status = z.object({ runs: z.array(run) });
const done = z.object({ ok: z.boolean() });
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
/** Prototype: accepts the request and starts nothing. */
export const replaceAgentRpc = defineRpc({ name: "agent.replace", input: ticketRef, output: done });
