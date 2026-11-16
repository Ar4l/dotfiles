# Plan: ticket runs without an agent per tick

Requirements and screen agreed on 2026-11-16; nothing is built. A script
starts the ticket agents and a screen in the Paseo app shows which tickets
start soon, are working, wait for you or are blocked. It replaces § Tick of
the skill `paseo-run-tickets`
(`files/.agents/skills/paseo-run-tickets/SKILL.md`), where a full agent session
runs every hour and 9 of 10 sessions start nothing.

## What you see

One row "Ticket runs" in the Paseo sidebar, on desktop and phone, carries the
count of tickets that need you and a warning mark when a check failed or none
ran for 30 minutes. It opens one screen, with a tab per run when there are
several:

```
[EVAL-230 · 37] [EVAL-154 · 2]
<run title>                                               ⏸  ↻  ▣
✓ checked 15:10 · next 15:20

Starting soon · 1
  EVAL-352  <title>                         starts 15:40  [Start now]
Working · 2
  EVAL-350  <title>                         since 14:02
Needs you · 37     10 to merge · 1 failed · 8 in review · 18 idle
  EVAL-314  <title>                         PR #2592 passed · 3 h
  EVAL-325  <title>                         idle 3 d
Blocked · 30
  EVAL-361  <title>                         by EVAL-353
```

- One list, one line per ticket; on the phone the detail drops to a second
  line. "Needs you" and "Blocked" start closed above 10 rows.
- A tap on a row opens that ticket's agent.
- The three buttons pause the run, run a check at once, and show the details.
- Details are optional: a right column on desktop, a sheet on the phone. They
  hold the dependency tree of the run's tickets, the start rules with the last
  and next check, and the last five starts.
- "Blocked" gives the reason: the blocking ticket, no `ready-for-agent` label,
  or assigned without an agent.
- "Replace agent", behind "⋮" on idle and checks-failed rows, is for an agent
  that stopped or went off track. After a confirm step a new agent continues
  the ticket in the same workspace; the old session stays.
- Times show in UTC+8. Closed tickets are left out, except one whose agent
  still runs.

`prototype/` holds the screen's source as agreed, on mock data: a plugin
named `ticket-runs-proto` that reads `~/scratch/paseo-run-tickets-trigger/proto-state.json`.
`prototype/shot.py` screenshots it in headless Chromium at phone and desktop
size.

## Rules

- When a run starts, every ready ticket starts.
- A ticket added later waits 1 hour before it starts. A ticket that gets
  unblocked, or that an agent gives back, starts at the next check.
- No limit on starts.
- One agent at a time per ticket. The script assigns the ticket to you in
  Linear before it starts the agent, and starts nothing while an agent of
  that ticket runs. An unassigned ticket is free again.
- A ticket that comes back gets a fresh agent in its existing workspace.
- Every check first compares the script's record with Linear and Paseo. A
  ticket it assigned that has no agent is unassigned again.
- A failed or unreadable answer from Linear, Paseo or `tools/ticket-tracker`
  starts nothing and shows on the screen.
- The script detects no agent errors and restarts nothing. An open ticket
  whose agent is idle shows under "Needs you", whatever the cause.
- The script sends no message to a ticket agent and never archives a session.
- The fog sweep and the finish report stay agents, started by the script.
- A run ends when its tickets are done or when you remove it. It has no
  expiry date.

## Parts

| Part | Does | Lives in `~/dotfiles` |
| --- | --- | --- |
| Script (stdlib Python) | `start`, `check`, `pause`, `replace`, `list`, `remove`; writes one state file per run | `paseo-plugins/ticket-runs/run_tickets.py` |
| Timer (systemd user) | Runs `check` every 10 minutes for every run; always on | `files/.config/systemd/user/` |
| Plugin (TypeScript) | Draws the screen from the state files; its buttons call the script | `paseo-plugins/ticket-runs/` |
| Skill | `/paseo-run-tickets EVAL-<n>` calls `start`; § Tick is deleted; § By hand added | `files/.agents/skills/paseo-run-tickets/SKILL.md` |

- The script works without the plugin, and the plugin holds no rules.
- The plugin is installed on the daemon of every machine the app connects to,
  so the sidebar row stays when you look at another machine's workspace.
- `check` reloads the plugin when Paseo reports it `failed`.
- `tools/ticket-tracker` stays unchanged: the ticket brief tells the agent to
  run `claim --force` on its already assigned ticket.
- § By hand of the skill is the one place for manual work: where the state
  files, timer, plugin and logs are, and how to remove each. `list EVAL-<n>`
  prints every workspace, agent and worktree a run created.

## Steps

1. Script, tested against recorded output of `tools/ticket-tracker`, `linear`
   and `paseo`.
2. Timer with `check --dry-run` beside the schedule `EVAL-230 run tickets`
   for one day; compare what each would start.
3. Plugin screen on the state files, starting from the prototype's source;
   checked on the phone, and on the Mac beside `paseo-plugins/mru-switcher`.
4. Move EVAL-230 over: `start EVAL-230`, then delete the schedule. Its
   worktree, Paseo project and agents stay; the script finds the agents by
   their labels `run=` and `ticket=`.
5. Rewrite the skill, then delete this plan and `prototype/`.

## Tested on Paseo 0.15.4 (throwaway plugin, 2026-11-14)

- A plugin adds the sidebar row and the screen, and reads a state file.
- A timer inside the plugin runs with no screen open.
- Paseo leaves a plugin process that dies in state `failed`, so systemd runs
  the timer.
- Paseo's public plugin docs describe calls that 0.15.4 lacks (row badges,
  subscriptions, sidebar views). The installed SDK types decide.

## Not yet

- The screen on a real phone.
- Why the sidebar row disappears after a switch to a workspace on the Mac.
- What a Paseo restart or update does to the plugin.
- Linear state as a badge on each workspace row: documented for Paseo newer
  than 0.15.4.
