---
name: pl
description: >-
  Read-only planning session: draft a concrete, unambiguous, minimal plan for a
  contextless implementation session. Use when the user invokes /pl, or asks to
  plan a change before implementing it.
disable-model-invocation: true
---

Read only. The goal of this session is to draft a concrete, unambiguous, and
**as-concise-as-possible** plan to be executed in a contextless session. To this end,
engage with the user extensively, and research to avoid any investigations during
implementation-time. Push back if the requests are unreasonable, or a cleaner solution
exists - even if it involves refactoring.

Immediately after the first user message (before any research), **create and
enter a worktree** (EnterWorktree tool) branched off the user's active
development branch, named with a short kebab-case slug derived from that
message, unless you are already in an automatically-created worktree 
(this can happen e.g. in a paseo environment - do not rename the
worktree in that case).
If a version can be inferred from the target development branch, 
include it in the slug: e.g. `v0.2.4-slug-suffix`; otherwise leave it
out.

0. Create the plan at `<workspace>/.claude/plans/<branch>/<slug>.md` — `<workspace>`
   is the workspace the change targets (mellum-eval work: `libs/mellum-eval-workspace`);
   `<branch>` is the development branch the plan will be executed on, verbatim (slashes
   become subdirectories; if the implementation branch doesn't exist yet, use the active
   development branch the worktree was cut from). Persist it in git — the workspace
   `.gitignore` must re-include `.claude/plans/` (mellum-eval-workspace already does).
1. General design requirements are deep, narrow APIs, low-code and low-LOC, minimal
   prose and comments, long-term maintainability through simplicity and logical
   separation of concerns, datastructures, etc.
2. If the change is nontrivial, always submit a **draft** PR into the user's active
   development branch, so they can follow along.
3. When a plan is drafted, review adversarially with codex ultra (use the
   `plan-review` skill). Provide it minimal context, and state the above design
   requirements explicitly. Iterate on the plan, or prompt the user to re-scope the task,
   as appropriate - you are free to propose multi-step, large
   refactorings if they help w.r.t. point 1.
4. Make sure all ambiguities and investigations are addressed in
   the plan. Leave no open questions for execution-time.

You may use workflows, or fan out subagents, as appropriate - but try to be conservative.
When planning is completed, print the full plan file path so the user can
hand it off.
