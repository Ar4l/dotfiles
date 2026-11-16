import { spawn } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Done, Health, Run, Status } from "../shared/status";

/** A run with no check for this long shows as stale: the timer is off or stuck. */
const STALE_AFTER_MS = 30 * 60_000;
/** A button waits this long for the script; a longer run finishes on its own. */
const WAIT_MS = 20_000;

/** The folder of the state files that run_tickets.py writes, one per run. */
function stateDir(): string {
  if (process.env.TICKET_RUNS_STATE) return process.env.TICKET_RUNS_STATE;
  return join(process.env.XDG_STATE_HOME || join(homedir(), ".local/state"), "ticket-runs");
}

/** The parts of a state file the screen draws. The script owns the rest. */
interface StateFile {
  id: string;
  title: string;
  script: string;
  settings: { label: string | null };
  health: (Omit<Health, "watching" | "state"> & { state: Exclude<Health["state"], "stale">; dryRun: boolean }) | null;
  what: Run["what"];
  tickets: Run["tickets"];
  recent: Run["recent"];
}

function readFiles(): StateFile[] {
  let names: string[];
  try {
    names = readdirSync(stateDir()).filter((name) => name.endsWith(".json"));
  } catch {
    return []; // no run was ever started on this machine
  }
  return names.sort().map((name) => JSON.parse(readFileSync(join(stateDir(), name), "utf8")) as StateFile);
}

function healthOf(file: StateFile, now: number): Health {
  const health = file.health;
  if (!health) {
    return { state: "stale", watching: false, checkedAt: null, nextCheckAt: null, lastResult: null, error: null };
  }
  const late = !health.checkedAt || now - Date.parse(health.checkedAt) > STALE_AFTER_MS;
  const stale = late && (health.state === "ok" || health.state === "failed");
  return {
    state: stale ? "stale" : health.state,
    watching: health.dryRun,
    checkedAt: health.checkedAt,
    nextCheckAt: stale ? null : health.nextCheckAt,
    lastResult: health.lastResult,
    error: health.error,
  };
}

export function readStatus(): Status {
  const now = Date.now();
  return {
    runs: readFiles().map((file) => ({
      id: file.id,
      title: file.title,
      health: healthOf(file, now),
      label: file.settings.label,
      what: file.what,
      tickets: file.tickets.map((t) => ({
        id: t.id,
        title: t.title,
        state: t.state,
        linearState: t.linearState,
        agentId: t.agentId,
        pr: t.pr,
        at: t.at,
        addedAt: t.addedAt,
        reason: t.reason,
        blockedBy: t.blockedBy,
        error: t.error,
      })),
      recent: file.recent,
    })),
  };
}

/** Run the script of a run, such as `check TEST-1`. Rejects with the script's own words when it fails. */
function script(runId: string, args: string[]): Promise<Done> {
  const file = readFiles().find((run) => run.id === runId);
  if (!file) throw new Error(`no run ${runId}`);
  return new Promise((resolve, reject) => {
    const child = spawn("python3", [file.script, "--state-dir", stateDir(), ...args], { stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    let errors = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (errors += chunk));
    const timer = setTimeout(() => resolve({ ok: true, pending: true }), WAIT_MS);
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) return resolve({ ok: true, pending: false });
      const lines = (errors.trim() || output.trim()).split("\n");
      // A log line starts with its time; the toast needs the words only.
      reject(new Error(lines[lines.length - 1].replace(/^\S+Z /, "").replace(/^ticket runs: /, "") || `the script ended with code ${code}`));
    });
  });
}

export function setPaused({ runId, paused }: { runId: string; paused: boolean }) {
  return script(runId, ["pause", runId, ...(paused ? [] : ["--resume"])]);
}

export function checkNow({ runId }: { runId: string }) {
  return script(runId, ["check", runId]);
}

export function startNow({ runId, ticketId }: { runId: string; ticketId: string }) {
  return script(runId, ["check", runId, "--start", ticketId]);
}

export function replaceAgent({ runId, ticketId }: { runId: string; ticketId: string }) {
  return script(runId, ["replace", runId, ticketId]);
}
