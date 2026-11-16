import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Health, Run, Start, Status, Ticket } from "../shared/status";

const dir = join(homedir(), "scratch/paseo-run-tickets-trigger");
const stateFile = join(dir, "proto-state.json");
const beatFile = join(dir, "proto-heartbeat.log");

/**
 * The mock file states a time as an absolute instant or as an offset from now in minutes
 * (`agoMin`, `inMin`, `addedAgoMin`, `checkedAgoMin`, `startedAgoMin`), so durations on screen
 * stay the same whenever the file is read.
 */
type MockTicket = Omit<Ticket, "at" | "addedAt" | "reason" | "blockedBy"> & {
  reason?: Ticket["reason"];
  blockedBy?: string[];
  at?: string | null;
  agoMin?: number;
  inMin?: number;
  addedAgoMin?: number;
};
type MockHealth = Omit<Health, "checkedAt" | "nextCheckAt"> & { checkedAt?: string; checkedAgoMin?: number };
type MockStart = Omit<Start, "startedAt"> & { startedAt?: string; startedAgoMin?: number };
type MockRun = Omit<Run, "health" | "tickets" | "recent"> & {
  health: MockHealth;
  tickets: MockTicket[];
  recent: MockStart[];
};
type MockState = { mockAgentId: string; runs: MockRun[] };

let ticks = 0;
/** Time of each run's last "Check now", in milliseconds since the epoch. */
const checkedByButton = new Map<string, number>();

export function tick(reason: string) {
  ticks += 1;
  appendFileSync(beatFile, `${new Date().toISOString()} tick ${ticks} (${reason}) pid ${process.pid}\n`);
}

function read(): MockState {
  return JSON.parse(readFileSync(stateFile, "utf8"));
}

function write(state: MockState) {
  writeFileSync(stateFile, JSON.stringify(state, null, 1));
}

function offset(minutes: number): string {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

function ticketInstant(t: MockTicket): string | null {
  if (t.at) return t.at;
  if (t.agoMin != null) return offset(-t.agoMin);
  if (t.inMin != null) return offset(t.inMin);
  return null;
}

/** A run that still checks does so on the clock: every 10 minutes means :00, :10, :20. */
function checkTimes(run: MockRun): Pick<Health, "checkedAt" | "nextCheckAt"> {
  const state = run.health.state;
  if (state === "ok" || state === "failed") {
    const every = run.rules.checkEveryMin * 60_000;
    const slot = Math.floor(Date.now() / every) * every;
    const last = Math.max(slot, checkedByButton.get(run.id) ?? 0);
    return { checkedAt: new Date(last).toISOString(), nextCheckAt: new Date(slot + every).toISOString() };
  }
  const ago = run.health.checkedAgoMin;
  return { checkedAt: run.health.checkedAt ?? (ago != null ? offset(-ago) : null), nextCheckAt: null };
}

export function readStatus(): Status {
  return {
    runs: read().runs.map((run) => ({
      id: run.id,
      title: run.title,
      rules: run.rules,
      health: {
        state: run.health.state,
        ...checkTimes(run),
        lastResult: run.health.lastResult,
        error: run.health.error,
      },
      tickets: run.tickets.map((t) => ({
        id: t.id,
        title: t.title,
        state: t.state,
        agentId: t.agentId,
        pr: t.pr,
        at: ticketInstant(t),
        addedAt: t.addedAgoMin != null ? offset(-t.addedAgoMin) : null,
        reason: t.reason ?? null,
        blockedBy: t.blockedBy ?? [],
        error: t.error,
      })),
      recent: run.recent.map((s) => ({
        id: s.id,
        title: s.title,
        agentId: s.agentId,
        startedAt: s.startedAt ?? offset(-(s.startedAgoMin ?? 0)),
      })),
    })),
  };
}

function update(runId: string, change: (run: MockRun, state: MockState) => void) {
  const state = read();
  const run = state.runs.find((r) => r.id === runId);
  if (!run) throw new Error(`no run ${runId}`);
  change(run, state);
  write(state);
  return { ok: true };
}

export function setPaused({ runId, paused }: { runId: string; paused: boolean }) {
  return update(runId, (run) => {
    if (run.health.state === "finished") return;
    run.health.state = paused ? "paused_by_user" : "ok";
    run.health.checkedAt = new Date().toISOString();
    run.health.error = null;
  });
}

export function checkNow({ runId }: { runId: string }) {
  tick("button");
  checkedByButton.set(runId, Date.now());
  return update(runId, (run) => {
    if (run.health.state !== "failed" && run.health.state !== "stale") return;
    run.health = { state: "ok", lastResult: "nothing to start", error: null };
  });
}

export function startNow({ runId, ticketId }: { runId: string; ticketId: string }) {
  return update(runId, (run, state) => {
    const ticket = run.tickets.find((t) => t.id === ticketId && t.state === "waiting");
    if (!ticket) throw new Error(`${ticketId} is not waiting`);
    const now = new Date().toISOString();
    Object.assign(ticket, { state: "working", agentId: state.mockAgentId, at: now });
    delete ticket.inMin;
    delete ticket.addedAgoMin;
    run.recent.unshift({ id: ticket.id, title: ticket.title, startedAt: now, agentId: ticket.agentId });
    run.recent.length = Math.min(run.recent.length, 5);
    run.health.lastResult = `started ${ticket.id}`;
  });
}

export function replaceAgent({ runId, ticketId }: { runId: string; ticketId: string }) {
  appendFileSync(beatFile, `${new Date().toISOString()} replace agent requested for ${ticketId} of ${runId} (no-op)\n`);
  return { ok: true };
}
