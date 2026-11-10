---
name: paseo-run-tickets
description: Work every ticket of a map or spec with one Paseo agent per ticket, in a Paseo project named after the map or spec.
disable-model-invocation: true
---

`/paseo-run-tickets EVAL-<n>` takes a charted map or a spec, sets up the run
and exits. From then on a Paseo schedule starts a fresh agent every 20 minutes
to run § Tick. Linear and Paseo hold all state, so no session has to see every
ticket. Each ticket gets its own agent and worktree in the run's Paseo
project. The user talks to any of them there. Running the command again on
the same map or spec reuses the worktree, project and schedule.

The ticket EVAL-<n> sets the mode:

| | map mode | spec mode |
| --- | --- | --- |
| EVAL-<n> carries | label `wayfinder:map` | title `<subject> Spec: ...` |
| Its tickets | decision tickets | build tickets |
| Ticket prompt | `Read <skills>/wayfinder/SKILL.md and follow it: map EVAL-<n>, ticket EVAL-<t>.` | `Read <skills>/implement/SKILL.md and follow it: ticket EVAL-<t>.` |

`<skills>` is the newest installed copy of the mattpocock-skills plugin:
`ls -d ~/.claude/plugins/cache/claude-plugins-official/mattpocock-skills/*/skills/engineering | sort -V | tail -1`.
The prompt names the file because Paseo wraps a prompt sent by an agent in a
`<paseo-system>` tag, so a leading `/implement` does not run as a command.

`<agent>` stands for the flags of the Paseo app's default agent profile, the
first entry of `daemon.agentProfiles`:
`jq -r '.daemon.agentProfiles[0] | "--provider \(.provider)/\(.model) --thinking \(.thinkingOptionId)"' ~/.paseo/config.json`.
Every `paseo run` and `paseo schedule create` passes them. Without
`--provider` Paseo exits with `Provider is required`, and a bare
`--provider claude` takes the provider's first model.

`<n>` is the number of the map or spec, `<t>` of one of its tickets, and
`<run>` is `~/worktrees/eval-<n>/libs/mellum-eval-workspace`. Run every
command from `<run>` once it exists.

## Start

Each step reuses what an earlier launch created, so a second launch adds
nothing.

1. Read EVAL-<n> with `linear issue view EVAL-<n> --json --no-comments` and
   pick the mode from the table. Stop and tell the user when:
   - it is neither a map nor a spec;
   - a map lacks the label `wayfinder:charted`: the user charts it first with
     `/wayfinder EVAL-<n>`;
   - a spec has no children: the user runs `/to-tickets` first.
2. Find the integration branch: the description of the Linear project names it
   as `integration branch <branch>`. `<base>` is `origin/<branch>`
   throughout. Run `git fetch origin`. Unless `~/worktrees/eval-<n>` exists,
   create it with `git worktree add --detach ~/worktrees/eval-<n> <base>`. No
   commit ever lands there, because each ticket agent cuts its own branch
   through `tools/ticket-tracker branch`.
3. Find the run's Paseo project: the entry of `paseo project ls --json` whose
   path is `<run>`. Without one, create it with `paseo project create <run>
   --json` and name it with `paseo project rename <projectId> "EVAL-<n>
   <title>"`. `<projectId>` is that id throughout.
4. Look in `paseo schedule ls --json` for a schedule named `EVAL-<n> run
   tickets`. Paseo accepts two schedules with one name, so a second one would
   double every tick. If it exists, run `paseo schedule run-once <id>` and
   tell the user the run was already set up. Otherwise create it:

   ```bash
   paseo schedule create --name "EVAL-<n> run tickets" --every 20m \
     <agent> --mode auto --expires-in 7d --run-now --cwd <run> \
     "Read ~/.agents/skills/paseo-run-tickets/SKILL.md and run its Tick for EVAL-<n> in <mode> mode with base <base> in project <projectId>."
   ```

   The schedule needs `--mode auto`. In the default mode, the scheduled agent
   stops at its first Bash call to wait for an approval no one sees. When
   auto mode refuses the command, print it for the user to run and stop.
5. Reply with the project name, the mode, the schedule id and the time the
   schedule expires.

## Tick

Each tick is a fresh agent. Paseo archives it when it ends, so the user never
reads its output. Its only effects are its commands.

1. Read the state:
   - `tools/ticket-tracker frontier --map EVAL-<n>` lists the tickets that
     are ready. Keep its warnings: step 3 reads them.
   - `paseo ls -g --label run=EVAL-<n> --json` lists the ticket agents.
     Without `-g` it lists only agents whose cwd is this directory.
   - `linear issue view EVAL-<n> --json --no-comments | jq -r
     '.children.nodes[] | "\(.identifier) \(.state.name)"'` gives each
     ticket's state.

   The tick sends no message to a running ticket agent: the user tells an
   agent when to merge, and the agent closes its own ticket. A ticket the
   user started by hand is claimed, so it is off the frontier: leave it
   alone.
2. Start agents for frontier tickets that have no agent yet. Check with
   `paseo ls -g --label ticket=EVAL-<t> --json`, because a ticket counts as
   unclaimed on the frontier until its agent runs `claim`. Keep at most 9
   agents running.

   ```bash
   ws=$(paseo workspace create --isolation worktree --project <projectId> \
     --path <run> --worktree-slug eval-<t> --base <base> \
     --title "EVAL-<t> <ticket title>" --json | jq -r .workspaceId)
   paseo run --workspace "$ws" <agent> --mode auto \
     --title "EVAL-<t> <ticket title>" \
     --label run=EVAL-<n> --label ticket=EVAL-<t> --no-wait \
     "$(cat ~/scratch/paseo-run-tickets-<n>/EVAL-<t>.md)"
   ```

   Write the brief from § Ticket brief to that file first. `paseo run` takes
   the prompt only as an argument. Two flags keep the run correct:
   - `--project <projectId>`: without it Paseo files the worktree under a
     second project that it creates at the git root.
   - `--base <base>`: Paseo fetches an `origin/` base before branching.
     Without the flag it branches from the local integration branch, which
     can be hundreds of commits behind.
3. Map mode, when the frontier warnings name the fog sweep: every decision
   ticket is closed and the map's Not yet specified section still has
   bullets. The user picks the outcome of each bullet, so one agent drafts
   them and asks. Unless `paseo ls -g --label ticket=EVAL-<n> --json` lists
   one, start it as in step 2, with slug `eval-<n>-fog`, title `EVAL-<n> Fog
   sweep`, label `ticket=EVAL-<n>`, and the brief's first line `Read
   <skills>/wayfinder/SKILL.md and follow it: map EVAL-<n>, sort the Not yet
   specified bullets (the fog sweep).`
4. Finish when every child of EVAL-<n> is Done, Canceled or Duplicate and the
   mode's condition holds. Until then the schedule keeps running.
   - Map mode: the frontier no longer warns of the fog sweep.
   - Spec mode: no open map names EVAL-<n>. A map closes only after
     `/to-tickets` has cut the whole spec, so an open one means more build
     tickets will come. This prints the open maps that name the spec:

     ```bash
     linear api 'query { issues(filter:{ team:{key:{eq:"EVAL"}}, labels:{name:{eq:"wayfinder:map"}}, state:{type:{nin:["completed","canceled","duplicate"]}}, description:{contains:"EVAL-<n>"} }) { nodes { identifier } } }' \
       | jq -r '.data.issues.nodes[].identifier'
     ```

   To finish:
   - Delete the schedule. Look up its id with `paseo schedule ls --json` by
     the name `EVAL-<n> run tickets`, then run `paseo schedule delete <id>`.
   - Spec mode: set the spec Done with `linear issue update EVAL-<n> -s Done`.
     A map stays open until the user approves after `/to-tickets`.
   - Start one report agent as in step 2, with slug `eval-<n>-done`, no
     `ticket` label, and a prompt that asks for one closing message:
     - spec mode, titled `EVAL-<n> Spec done`: each ticket with its PR, and
       any ticket that was Canceled.
     - map mode, titled `EVAL-<n> Map clear`: each decision's gist, then the
       next steps: `/to-spec` and `/to-tickets` on the map's spec, then
       `/paseo-run-tickets` on that spec.

     The report needs its own workspace: Paseo archives the tick's workspace
     when the tick ends, together with any agent started in it.
   - Leave the remaining ticket workspaces in place. A ticket agent archives
     its own workspace after its last check (§ Ticket brief), so a workspace
     still listed holds something for the user.

## Ticket brief

```text
<the mode's ticket prompt>

You run unattended under /paseo-run-tickets EVAL-<n>. The user reads only
your last message, in the Paseo app, so every message you end a turn on makes
sense on its own. Finish all the work you can do alone before you stop.

When you need the user (a decision, a round of questions, a permission, a
Linear write that was refused, a handoff step), run any handoff your recipe
names, then end your turn with:

BLOCKED EVAL-<t>: <the question, one line>
- the facts the answer depends on
- the options, your recommendation, and what each one costs
- the exact text of any Linear write you propose
- what you will do after each answer

Use at most 10 lines per question. Include only what changes the user's
answer.

No one watches your PR for you. Once it is open and its checks pass, use the
BLOCKED message to ask the user to merge it or to tell you to merge. When
they answer, read the PR's state with `gh pr view`, then finish the ticket.

Anything that leaves this repository needs the user first: before you push
to another repository or open a PR, issue or comment there, stop with the
BLOCKED message and give its exact title and text.

Last check, once your ticket is closed and its PR, if any, is merged:
- the worktree holds no uncommitted or unpushed work;
- re-read this session: every question, promise and follow-up is settled or
  recorded on a ticket.
If anything is open, end with the BLOCKED message that names it. If nothing
is open, write one closing line, then archive your own workspace:
paseo workspace archive "$(paseo workspace ls --json | jq -r --arg c "$PASEO_AGENT_CWD" '.[] | select(.cwd==$c) | .workspaceId')"
```
