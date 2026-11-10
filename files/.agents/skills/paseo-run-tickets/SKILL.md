---
name: paseo-run-tickets
description: Start one Paseo agent per ready ticket of a map or spec, in a Paseo project named after the map or spec.
disable-model-invocation: true
---

`/paseo-run-tickets EVAL-<n>` takes a charted map or a spec and starts one
agent per ready ticket, each in its own worktree, in a Paseo project named
after the map or spec. The user talks to each agent in its workspace. The
command runs once and nothing runs in the background: run it again to start
the tickets that became ready since.

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
Without `--provider` Paseo exits with `Provider is required`, and a bare
`--provider claude` takes the provider's first model.

`<n>` is the number of the map or spec, `<t>` of one of its tickets, and
`<run>` is `~/worktrees/eval-<n>/libs/mellum-eval-workspace`.

## Steps

1. Read EVAL-<n> with `linear issue view EVAL-<n> --json --no-comments` and
   pick the mode from the table. Stop and tell the user when:
   - it is neither a map nor a spec;
   - a map lacks the label `wayfinder:charted`: the user charts it first with
     `/wayfinder EVAL-<n>`;
   - a spec has no children: the user runs `/to-tickets` first.
2. Find the integration branch: the description of the Linear project names it
   as `integration branch <branch>`. `<base>` is `origin/<branch>`. Run
   `git fetch origin`. Unless `~/worktrees/eval-<n>` exists, create it with
   `git worktree add --detach ~/worktrees/eval-<n> <base>`. No commit ever
   lands there, because each ticket agent cuts its own branch through
   `tools/ticket-tracker branch`.
3. Find the run's Paseo project: the entry of `paseo project ls --json` whose
   path is `<run>`. Without one, create it with `paseo project create <run>
   --json` and name it with `paseo project rename <projectId> "EVAL-<n>
   <title>"`.
4. Read the ready tickets with `tools/ticket-tracker frontier --map EVAL-<n>`.
   Start an agent for each one that has none: `paseo ls -g --label
   ticket=EVAL-<t> --json` is empty. Keep at most 9 agents of the run
   running, counted from `paseo ls -g --label run=EVAL-<n> --json`.

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
5. Map mode, when the frontier warnings name the fog sweep: every decision
   ticket is closed and the map's Not yet specified section still has
   bullets. The user picks the outcome of each bullet, so one agent drafts
   them and asks. Unless `paseo ls -g --label ticket=EVAL-<n> --json` lists
   one, start it as in step 4, with slug `eval-<n>-fog`, title `EVAL-<n> Fog
   sweep`, label `ticket=EVAL-<n>`, and the brief's first line `Read
   <skills>/wayfinder/SKILL.md and follow it: map EVAL-<n>, sort the Not yet
   specified bullets (the fog sweep).`
6. When every child of EVAL-<n> is Done, Canceled or Duplicate:
   - Map mode, with no fog-sweep warning: the map is clear. Name the next
     steps: `/to-spec` and `/to-tickets` on the map's spec, then
     `/paseo-run-tickets` on that spec.
   - Spec mode: set the spec Done with `linear issue update EVAL-<n> -s Done`,
     unless an open map still names it. A map closes only after `/to-tickets`
     has cut the whole spec, so an open one means more build tickets will
     come. This prints the open maps that name the spec:

     ```bash
     linear api 'query { issues(filter:{ team:{key:{eq:"EVAL"}}, labels:{name:{eq:"wayfinder:map"}}, state:{type:{nin:["completed","canceled","duplicate"]}}, description:{contains:"EVAL-<n>"} }) { nodes { identifier } } }' \
       | jq -r '.data.issues.nodes[].identifier'
     ```
7. Reply with the project name, then three lists by ticket title: started
   now, waiting for a free slot, and open but not ready with what each waits
   for.

## Ticket brief

```text
<the mode's ticket prompt>

You were started by /paseo-run-tickets EVAL-<n>. The user reads only your
last message, in the Paseo app, so every message you end a turn on makes
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
