# Ticket runs

Works through the sub-tickets of a Linear parent ticket with one Paseo agent per ready
ticket. A script decides what starts, a timer runs it every 10 minutes, and one screen in the
Paseo app shows which tickets start soon, are working, wait for you or are blocked.

- It serves one person on their own machines. It is not a team tool.
- It starts agents and shows state. It does not judge an agent's work or message an agent.
- It reads only Linear and Paseo. What belongs to one workflow (a label, the prompt, the
  branch) is a setting.

| Part | Where | Remove |
| --- | --- | --- |
| Script: `start`, `check`, `pause`, `replace`, `list`, `remove` | `run_tickets.py` (`--help` lists them) | |
| Settings, one file per kind of parent ticket | `settings/`, explained in `settings/example.toml` | |
| Timer | `~/.config/systemd/user/ticket-runs.{service,timer}`, links into `~/dotfiles/files/.config/systemd/user/` | `systemctl --user disable --now ticket-runs.timer` |
| Screen | this folder as a Paseo plugin: `index.*.ts*`, `client/`, `server/`, `shared/` | `paseo plugin remove ticket-runs`; the folder stays |
| A run's state file | `~/.local/state/ticket-runs/<PARENT>.json` | `./run_tickets.py remove PARENT` |
| What a run created | `./run_tickets.py list PARENT`: its worktree `~/worktrees/<parent>`, Paseo project, workspaces and agents | `paseo workspace archive ID`, `paseo project delete ID`, `git worktree remove` |
| Log | `~/.local/state/ticket-runs/log`: one line per check; `journalctl --user -u ticket-runs` per timer run | delete the file |

The script needs `paseo`, `linear` (schpet/linear-cli) and Python 3.11. With `gh` it also
shows pull request states. Its Linear reads gave the same answers on linear-cli 2.6.0 and 3.1.0
(2026-11-17). The plugin holds no rules: it draws the state files and its
buttons call the script.

## Use

```sh
./run_tickets.py start PARENT --settings NAME --dry-run   # print what the run would do
./run_tickets.py start PARENT --settings NAME             # store the run, start every ready ticket
./run_tickets.py start PARENT --settings NAME --watch     # store a run that only reads
./run_tickets.py list PARENT                              # every workspace, agent and worktree of the run
./run_tickets.py remove PARENT                            # end the run; its agents and worktrees stay
```

`remove` deletes the state file only and prints what the run created. A workspace holds an
agent's session and maybe unpushed work, so read that list before you archive anything.

Inside a Paseo agent, prefix a `paseo` call of your own with `env -u PASEO_AGENT_ID -u
PASEO_AGENT_CWD -u PASEO_WORKSPACE_ID`. With those set, Paseo files what the call starts
under the calling agent. The script does this itself.

## When a ticket is ready

The script works this out from Linear at every check. A ticket is ready when all of these
hold:

- It is a direct sub-ticket of the run's parent.
- It is open: its state type is not completed, canceled or duplicate.
- No open ticket blocks it. A blocking link from any ticket counts, in the run or outside it.
- It has no open sub-tickets of its own.
- It has no assignee.
- It carries the label named by the setting `label`, when one is set.

State names, ticket titles, teams and labels on the parent play no part.

## Rules

- When a run starts, every ready ticket starts. There is no limit on starts.
- A ticket added later waits 1 hour (the setting `wait_minutes`), counted from the check that
  first sees it. A ticket that gets unblocked, or that an agent gives back by removing the
  assignee, starts at the next check.
- One agent at a time per ticket. The script assigns the ticket to you in Linear before it
  starts the agent, and starts nothing while an agent of that ticket runs. The assignee is
  all it writes in Linear.
- A ticket that comes back gets a fresh agent in its existing workspace, at most twice. Given
  back a third time, it waits under "Needs you" until you replace its agent.
- Every check first compares the script's record with Linear and Paseo. A ticket it assigned
  that has no agent is unassigned again.
- A failed or unreadable answer from Linear or Paseo starts nothing and shows on the screen.
- The script detects no agent errors and restarts nothing. An open ticket whose agent is idle
  shows under "Needs you", whatever the cause.
- The script sends no message to a ticket agent and never archives a session.
- When the last open ticket closes and `finish_prompt` is set, the script starts one agent
  with it, in a workspace of its own.
- `start` gives a run its own detached worktree at `~/worktrees/<parent>` and its own Paseo
  project named after the parent. Each ticket's workspace sits in that project. `start`
  reuses both when they exist, and finds a ticket's agents by their labels `run=<PARENT>`
  and `ticket=<ID>`.
- `start` stores the settings with the run, and every check uses the stored values. `start`
  on the same parent reads them again.
- A run with no open ticket shows as finished. A ticket added later makes it active again. A
  run ends when you remove it.
- `check` reloads the plugin when Paseo reports it as `failed`.

## The screen

The row "Ticket runs" in the Paseo sidebar carries the count of tickets that need you, and a
warning mark when a check failed or none ran for 30 minutes. It opens one screen, with a tab
per run when there are several:

```
[TEST-230 · 37] [TEST-154 · 2]
<run title>                                               ⏸  ↻  ▣
✓ checked 15:10 · next 15:20

Starting soon · 1
  TEST-352  <title>                         starts 15:40  [Start now]
Working · 2
  TEST-350  <title>                         since 14:02
Needs you · 37     10 to merge · 1 failed · 26 idle
  TEST-314  <title>                         PR #2592 passed · 3 h
  TEST-325  <title>                         <Linear state> · idle 3 d
Blocked · 30
  TEST-361  <title>                         by TEST-353
```

- A tap on a row opens that ticket's agent. Times show in the device's time zone.
- The three buttons pause the run, run a check at once, and show the details: what the run
  does, the last five starts, and the dependency graph.
- A "Needs you" row shows the pull request of the branch in the ticket's workspace and
  whether its checks passed, else the ticket's Linear state.
- "Blocked" gives the reason: the blocking ticket, open sub-tickets, a missing label, or
  assigned without an agent.
- "Replace agent", behind "⋮" on idle and checks-failed rows, starts a new agent in the same
  workspace after a confirm step. The old session stays.
- Closed tickets are left out, except one whose agent still runs.

## Install

[`../README.md`](../README.md) has the steps for any plugin. This one needs two things, both
on the machine that holds the runs:

```sh
paseo plugin install ~/dotfiles/paseo-plugins/ticket-runs
systemctl --user enable --now ticket-runs.timer
```

The app then shows that machine's runs in the sidebar row on every workspace. A second
machine with the plugin shows its own runs while you look at its workspaces, and a picker at
the top right of the screen switches machine.

## Tests

```sh
npm install && npm run typecheck   # the plugin
npm test                           # the script against stand-ins for linear, paseo and gh (30 s), and the graph layout
```

`testdata/recorded.json` is one parent ticket with 88 sub-tickets and 36 agents as the real
tools reported it on 2026-11-16, stripped of titles and names.

The screen was checked in headless Chromium against a throwaway daemon: a second
`paseo daemon run --home DIR` with its own port, the web UI and plugins enabled. The sidebar
row across machines was checked with two of them, the second added in the app as a direct
connection. Its `daemon.cors.allowedOrigins` in `config.json` must list the first one's URL.

```sh
uv run -q --with playwright python shot.py URL OUT.png desktop|phone STEP...   # the file's head lists the steps
```

## The dependency graph

Paseo 0.15.4 gives a plugin no drawing surface. `client/graph.ts` lays the graph out and
writes it as one SVG document, which Paseo's `Icon` draws; invisible buttons over the nodes
take the taps and the pointer. Each tap, hover or legend choice writes the SVG again, so the
graph has no animation, drag or zoom. Paseo refuses an SVG above 64 KiB, and a run that large gets a list instead.
The run of 2026-11-16 had 62 linked tickets and 189 links, and its SVG was 27 KiB.

The graph draws blockers on the left and what they block to the right. A tap on a ticket, or
the pointer over it, lights up its links, keeps its whole chain visible and shows its name.
A link that a longer chain implies is drawn only for the chosen ticket.

## Not yet

- The screen on a real phone.
- What a Paseo restart or update does to the plugin.
- `start` on Python 3.12.3: it rejects `name=value` pairs that follow `--settings`, and two
  tests fail there. Python 3.14.6 accepts them.
- The Linear state as a badge on each workspace row: Paseo newer than 0.15.4 documents it.
