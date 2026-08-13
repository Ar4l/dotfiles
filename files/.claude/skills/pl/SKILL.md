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

0. Create the plan at `<workspace>/.claude/plans/<github-handle>/<slug>.md` —
   `<workspace>` is the workspace the change targets (mellum-eval work:
   `libs/mellum-eval-workspace`); `<github-handle>` is the user's lowercase GitHub
   login (Aral: `ar4l`). Open the file with 3-line YAML frontmatter:
   `base-version:` (the package version at the plan's base commit), `branch:`,
   `pr:` — fill the latter two once they exist. Persist it in git — the workspace
   `.gitignore` must re-include `.claude/plans/` (mellum-eval-workspace already does).
1. General design requirements are deep, narrow APIs, low-code and low-LOC, minimal
   prose and comments, long-term maintainability through simplicity and logical
   separation of concerns, datastructures, etc.
2. If the change is nontrivial, always submit a **draft** PR into the user's active
   development branch, so they can follow along. Seed its description in the house
   PR style: one-line plain-English preamble (+ supersedes/closes refs), then
   active-voice bullets — what the reader does or what changes for them — max 16
   words each; known gaps/follow-ups get one line each. As commits land, collect
   them after a `---` as a `- [x] type(scope): …` checklist, squashing same-theme
   commits into one item (exemplar: jetbrains-ai-ml#1624).
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
