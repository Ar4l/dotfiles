# Ticket runs

Works through the sub-tickets of a Linear parent ticket with one Paseo agent per ready
ticket. A script decides what starts, a timer runs it every 10 minutes, and one screen in the
Paseo app shows which tickets start soon, are working, wait for you or are blocked.

`PLAN.md` holds the goal and the rules until the skill `paseo-run-tickets` is rewritten.

| Part | File |
| --- | --- |
| Script: `start`, `check`, `pause`, `replace`, `list`, `remove` | `run_tickets.py` (`--help` lists them) |
| Settings, one file per kind of parent ticket | `settings/`, explained in `settings/example.toml` |
| Timer | `~/dotfiles/files/.config/systemd/user/ticket-runs.{service,timer}` |
| Screen | this folder as a Paseo plugin: `index.*.ts*`, `client/`, `server/`, `shared/` |
| State, one file per run, and the log | `~/.local/state/ticket-runs/` |

The script needs `paseo`, `linear` (schpet/linear-cli) and Python 3.11. With `gh` it also
shows pull request states. The plugin holds no rules: it draws the state files and its
buttons call the script.

## Use

```sh
./run_tickets.py start PARENT --settings NAME --dry-run   # print what the run would do
./run_tickets.py start PARENT --settings NAME             # store the run, start every ready ticket
./run_tickets.py start PARENT --settings NAME --watch     # store a run that only reads
./run_tickets.py list PARENT                              # every workspace, agent and worktree of the run
./run_tickets.py remove PARENT                            # end the run; its agents and worktrees stay
```

## Install

```sh
paseo plugin install ~/dotfiles/paseo-plugins/ticket-runs      # on every daemon the app connects to
systemctl --user enable --now ticket-runs.timer                # on the machine that holds the runs
```

After an edit to the plugin, run `paseo plugin reload ticket-runs`. `journalctl --user -u
ticket-runs` shows the timer's checks.

## Tests

```sh
python3 -m unittest test_run_tickets   # the script against stand-ins for linear, paseo and gh, 30 s
npm install && npm run typecheck       # the plugin
```

`testdata/recorded.json` is one parent ticket with 88 sub-tickets and 36 agents as the real
tools reported it on 2026-11-16, stripped of titles and names. The screen was checked in
headless Chromium with `prototype/shot.py` against a throwaway daemon.
