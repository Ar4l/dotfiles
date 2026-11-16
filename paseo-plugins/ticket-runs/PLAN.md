# Plan: ticket runs without an agent per tick

Requirements, screen and design agreed on 2026-11-16. Steps 1, 2 and 4 are built; step 3
runs since 2026-11-16; steps 5 and 6 are open.

Goal: a personal tool that works through the sub-tickets of a Linear parent
ticket with one Paseo agent per ready ticket, without spending an agent session
to decide what starts. One screen in the Paseo app, phone included, shows which
tickets start soon, are working, wait for you or are blocked.

- It serves one person on their own machines. It is not a team tool.
- It starts agents and shows state. It does not judge an agent's work, detect
  errors or message agents.
- It reads only Linear and Paseo. What belongs to one workflow (a label, the
  prompt, the branch) is a setting.

It replaces § Tick of the skill `paseo-run-tickets`
(`files/.agents/skills/paseo-run-tickets/SKILL.md`), where a full agent session
runs every hour and 9 of 10 sessions start nothing.

The script needs the `paseo` CLI and the `linear` CLI (schpet/linear-cli, for
`linear api` only). With `gh` it also shows pull request states.

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
Needs you · 37     10 to merge · 1 failed · 26 idle
  EVAL-314  <title>                         PR #2592 passed · 3 h
  EVAL-325  <title>                         <Linear state> · idle 3 d
Blocked · 30
  EVAL-361  <title>                         by EVAL-353
```

- One list, one line per ticket; on the phone the detail drops to a second
  line. "Needs you" and "Blocked" start closed above 10 rows.
- A tap on a row opens that ticket's agent.
- The three buttons pause the run, run a check at once, and show the details.
- Details are optional: a right column on desktop, a sheet on the phone. They
  hold what the run does, the last and next check, the last five starts, and
  the dependency graph of the run's tickets.
- The graph draws blockers on the left and what they block to the right. A
  tap on a ticket, or the pointer over it, lights up its links, keeps its
  whole chain visible and shows its name; a tap on the name opens its agent.
  The legend's groups ("Needs you", "Blocked") each keep their tickets
  bright. A link that a longer chain implies is drawn only for the chosen
  ticket.
- "What the run does" words the run's settings: which tickets it starts, with
  what prompt, agent, folder and branch, and what follows the last ticket.
- A "Needs you" row shows the pull request of the branch in the ticket's
  workspace and whether its checks passed, else the ticket's Linear state.
- "Blocked" gives the reason: the blocking ticket, open sub-tickets, a missing
  label, or assigned without an agent.
- "Replace agent", behind "⋮" on idle and checks-failed rows, is for an agent
  that stopped or went off track. After a confirm step a new agent continues
  the ticket in the same workspace; the old session stays.
- Times show in the device's time zone. Closed tickets are left out, except
  one whose agent still runs.

`prototype/` holds the screen's source as agreed, on mock data: a plugin
named `ticket-runs-proto` that reads `~/scratch/paseo-run-tickets-trigger/proto-state.json`.
`prototype/shot.py` screenshots it in headless Chromium at phone and desktop
size.

## When a ticket is ready

The script works this out from Linear at every check. A ticket is ready when
all of these hold:

- It is a direct sub-ticket of the run's parent.
- It is open: its state type is not completed, canceled or duplicate.
- No open ticket blocks it. A blocking link from any ticket counts, in the run
  or outside it.
- It has no open sub-tickets of its own.
- It has no assignee.
- It carries the label named by the setting `label`, when one is set.

State names, ticket titles, teams and labels on the parent play no part.

## Rules

- When a run starts, every ready ticket starts.
- A ticket added later waits 1 hour before it starts, counted from the check
  that first sees it. A ticket that gets unblocked, or that an agent gives
  back by removing the assignee, starts at the next check.
- No limit on starts.
- One agent at a time per ticket. The script assigns the ticket to you in
  Linear before it starts the agent, and starts nothing while an agent of
  that ticket runs. The assignee is all it writes in Linear.
- A ticket that comes back gets a fresh agent in its existing workspace, at
  most twice. Given back a third time, it waits under "Needs you" until you
  replace its agent.
- Every check first compares the script's record with Linear and Paseo. A
  ticket it assigned that has no agent is unassigned again.
- A failed or unreadable answer from Linear or Paseo starts nothing and shows
  on the screen. Without `gh` a row shows no pull request.
- The script detects no agent errors and restarts nothing. An open ticket
  whose agent is idle shows under "Needs you", whatever the cause.
- The script sends no message to a ticket agent and never archives a session.
- When the last open ticket closes and `finish_prompt` is set, the script
  starts one agent with it, in a workspace of its own. That agent decides what
  comes next or writes the closing report.
- `start` gives a run its own detached worktree at `~/worktrees/<parent>` and
  its own Paseo project named after the parent. Each ticket's workspace sits
  in that project. `start` reuses both when they exist.
- A run with no open ticket shows as finished. A ticket added later makes it
  active again. A run ends when you remove it; it has no expiry date.

## Settings

`start <PARENT> [--settings FILE] [name=value ...]` takes the defaults below,
then the file, then the pairs, and stores the result with the run. Every check
uses the stored values; `start` on the same parent reads them again.

| Setting | Says | Default |
| --- | --- | --- |
| `label` | Start only tickets that carry this label | none: every ready ticket |
| `prompt` | First message to a ticket's agent; `{id}`, `{title}`, `{url}` and `{parent}` are filled in | the brief below |
| `finish_prompt` | Message to one agent when the last open ticket closes | none: nothing starts |
| `dir` | Git checkout, or a folder inside one, that the run's worktree is made from | the folder `start` runs in |
| `base` | Git ref each ticket's branch starts from | the checkout's default branch |
| `agent` | Name of the Paseo agent profile | Paseo's first profile |
| `mode` | Permission mode of the agents | `auto` |
| `wait_minutes` | Wait for a ticket added after the start | 60 |

- A settings file is TOML: Python reads it without a package, and a prompt is
  a multi-line string. An unknown name stops `start`.
- One file serves many runs: one file per kind of parent you run, in
  `settings/` beside the script, with a commented `example.toml`.
- `start --dry-run` prints what Details would say and the tickets that would
  start.
- `start --watch` stores a run that only reads: its checks draw the screen and
  change nothing in Linear or Paseo. A plain `start` makes it real.
- Fixed for every run: checks every 10 minutes (the timer unit), agent labels
  `run=<PARENT>` and `ticket=<ID>`, worktree name `<id>` in lower case.

The default `prompt` is § Ticket brief of the skill with two changes. Its
first line is `Work on Linear ticket {id} "{title}" ({url}), a sub-ticket of
{parent}. It is assigned to me, which marks it as yours.` It gains the line
`To give the ticket back, remove its assignee and say why.`

## Parts

| Part | Does | Lives in `~/dotfiles` |
| --- | --- | --- |
| Script (stdlib Python) | `start`, `check`, `pause`, `replace`, `list`, `remove`; writes one state file per run | `paseo-plugins/ticket-runs/run_tickets.py` |
| Timer (systemd user) | Runs `check` every 10 minutes for every run; always on | `files/.config/systemd/user/` |
| Plugin (TypeScript) | Draws the screen from the state files; its buttons call the script | `paseo-plugins/ticket-runs/` |
| Settings files | One per kind of parent you run, and a commented example | `paseo-plugins/ticket-runs/settings/` |
| Skill | `/paseo-run-tickets <PARENT> [settings file]` calls `start`; § Tick is deleted; § By hand added | `files/.agents/skills/paseo-run-tickets/SKILL.md` |

- The script works without the plugin, and the plugin holds no rules.
- The state file carries the run's settings; the plugin reads no other file.
- The plugin is installed on the daemon of every machine the app connects to,
  so the sidebar row stays when you look at another machine's workspace.
- `check` reloads the plugin when Paseo reports it `failed`.
- § By hand of the skill is the one place for manual work: where the state
  files, timer, plugin and logs are, and how to remove each. `list <PARENT>`
  prints every workspace, agent and worktree a run created.

## Steps

1. Script, tested against recorded output of `linear api`, `paseo` and `gh`.
   One test runs it with no settings file.
2. Two settings files for the EVAL workflow, in `settings/`: one for a parent
   whose tickets are decisions, one for a parent whose tickets are builds.
3. Timer with `check --dry-run` beside the schedule `EVAL-230 run tickets`
   for one day; compare what each would start.
4. Plugin screen on the state files, starting from the prototype's source;
   checked on the phone, and on the Mac beside `paseo-plugins/mru-switcher`.
5. Move EVAL-230 over: `start EVAL-230 --settings settings/<file>`, then
   delete the schedule. Its worktree `~/worktrees/eval-230`, Paseo project and
   agents stay; the script finds the agents by their labels `run=` and
   `ticket=`.
6. Rewrite the skill with no workflow names in it, then delete this plan and
   `prototype/`.

## Tested

On Paseo 0.15.4 with a throwaway plugin, 2026-11-14:

- A plugin adds the sidebar row and the screen, and reads a state file.
- A timer inside the plugin runs with no screen open.
- Paseo leaves a plugin process that dies in state `failed`, so systemd runs
  the timer.
- Paseo's public plugin docs describe calls that 0.15.4 lacks (row badges,
  subscriptions, sidebar views). The installed SDK types decide.

The ready rule against Linear, read-only, 2026-11-16:

- Team EVAL has 9 parents with open sub-tickets, 106 such tickets in all. The
  rule and the EVAL workflow's own tool agree on which are blocked for all 106.
- For 8 parents both name the same ready tickets: one in total, since the
  rest are assigned or blocked. 6 of the 8 carry no workflow label.
- The ninth parent waits for an approval label on the parent, which the rule
  does not read: `start` on it would start 5 tickets.
- One ticket has 74 blocking links, so the script pages them.
- `gh pr view` in an agent's folder finds the pull request of its branch.

## Not yet

- The screen on a real phone.
- Why the sidebar row disappears after a switch to a workspace on the Mac.
- What a Paseo restart or update does to the plugin.
- Linear state as a badge on each workspace row: documented for Paseo newer
  than 0.15.4.
