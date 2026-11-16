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
`README.md` beside it holds the rules: when a ticket is ready and what a check
does.

## Start

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

## By hand

| Part | Where | Remove |
| --- | --- | --- |
| A run's state file | `~/.local/state/ticket-runs/<PARENT>.json` | `<script> remove <PARENT>` |
| What a run created | `<script> list <PARENT>`: its worktree `~/worktrees/<parent>`, Paseo project, workspaces and agents | `paseo workspace archive <id>`, `paseo project delete <id>`, `git worktree remove` |
| Log | `~/.local/state/ticket-runs/log`: one line per check; `journalctl --user -u ticket-runs` per timer run | delete the file |
| Timer | `~/.config/systemd/user/ticket-runs.{service,timer}`, links into `~/dotfiles/files/.config/systemd/user/` | `systemctl --user disable --now ticket-runs.timer` |
| Plugin | `~/dotfiles/paseo-plugins/ticket-runs`; `paseo plugin ls` gives its state, `paseo plugin logs ticket-runs` its log | `paseo plugin remove ticket-runs`; the folder stays |

- `remove` deletes the state file only and prints what the run created. A
  workspace holds an agent's session and maybe unpushed work: show the user
  that list and archive or delete what they name.
- `<script> --help` lists the other commands: pause a run, replace a ticket's
  agent, start a waiting ticket at once, watch a parent without starting
  anything.
- Inside a Paseo agent, prefix a `paseo` call with `env -u PASEO_AGENT_ID -u
  PASEO_AGENT_CWD -u PASEO_WORKSPACE_ID`. With those set, Paseo files what the
  call starts under the calling agent. The script does this itself.
- `~/dotfiles/paseo-plugins/README.md` covers installing and reloading the
  plugin.
