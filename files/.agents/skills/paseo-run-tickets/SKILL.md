---
name: paseo-run-tickets
description: Start a ticket run, which gives each ready sub-ticket of a Linear parent ticket its own Paseo agent.
disable-model-invocation: true
---

`/paseo-run-tickets <PARENT> [settings file] [name=value ...]` starts a ticket
run on the Linear ticket `<PARENT>`. The script stores the run and starts one
Paseo agent per ready sub-ticket. A timer then checks every stored run each 10
minutes, and the row "Ticket runs" in the Paseo sidebar shows them.

`<script>` is `~/dotfiles/paseo-plugins/ticket-runs/run_tickets.py`. The
`README.md` beside it holds everything after the start: when a ticket is
ready, what a check does, the other commands, where each part keeps its files
and how to remove a run.

1. Settle the settings. A settings file is a name in `settings/` beside the
   script, or a path; `settings/example.toml` explains every setting and its
   default. The head comment of the chosen file names the `name=value` pairs
   its runs need: ask the user for any the request lacks. `dir` defaults to
   the folder `start` runs in, so without a `dir` run the script from the
   checkout the tickets belong to.
2. Run `<script> start <PARENT> [--settings <file>] [name=value ...] --dry-run`.
   It changes nothing and prints what the run does and which tickets would
   start. When it fails, show the user its error and stop.
3. Run the same command without `--dry-run`. It assigns each ready ticket to
   the user in Linear and starts its agent. On a parent that already has a
   run it reads the settings again and keeps the run's worktree, Paseo
   project and agents.
4. Confirm `systemctl --user is-active ticket-runs.timer` prints `active`;
   otherwise run `systemctl --user enable --now ticket-runs.timer`. The first
   check is all that runs without the timer.
5. Reply with the lines under "What the run does" from step 2, the tickets
   step 3 started, and where to look: "Ticket runs" in the Paseo sidebar.
