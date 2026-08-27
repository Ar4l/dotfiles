---
name: pl
description: >-
  Read-only planning session: draft a concrete, unambiguous, minimal plan for a
  contextless implementation session. Use when the user invokes /pl or $pl, or
  asks to plan a change before implementing it.
disable-model-invocation: true
---

Read only. The goal of this session is to draft a concrete, unambiguous, and
**as-concise-as-possible** plan to be executed in a contextless session. To this end,
engage with the user extensively, and research to avoid any investigations during
implementation-time. Push back if the requests are unreasonable, or a cleaner solution
exists - even if it involves refactoring.
On non-Claude hosts, translate Claude-specific harness tools to the closest
equivalent while preserving each step's constraints.

Immediately after the first user message (before any research), **create and
enter a worktree** (EnterWorktree tool) branched off the user's active
development branch, named with a short kebab-case slug derived from that
message.
EXCEPTION: if the cwd is already inside an automatically-created session
worktree (anywhere under `~/.paseo/worktrees/`), do not call EnterWorktree
and do all research from here — but still give the plan commit **its own
branch**: `plan/<slug>` cut from the target base (usually `origin/main`),
created via a throwaway worktree under `~/worktrees/` (never checkout -b in
the session worktree — its HEAD belongs to the session, and may track a live
PR branch). NEVER commit a plan onto the session worktree's current branch
or any existing PR branch.
If a version can be inferred from the target development branch, 
include it in the slug: e.g. `v0.2.4-slug-suffix`; otherwise leave it
out.

0. Create the plan at `<workspace>/docs/plans/<github-handle>/<slug>.md` —
   `<workspace>` is the workspace the change targets (mellum-eval work:
   `libs/mellum-eval-workspace`); `<github-handle>` is the user's lowercase GitHub
   login (Aral: `ar4l`). Open the file with 3-line YAML frontmatter:
   `base-version:` (the package version at the plan's base commit), `branch:`,
   `pr:` — fill the latter two once they exist. Persist it in git — a plain
   tracked dir. In workspaces still on the legacy `.claude/plans/` layout
   (gitignore re-include), write there instead.
1. General design requirements are deep, narrow APIs, low-code and low-LOC, minimal
   prose and comments, long-term maintainability through simplicity and logical
   separation of concerns, datastructures, etc.
2. If the change is nontrivial, always submit a **draft** PR into the user's active
   development branch, so they can follow along. Seed its description in the house
   PR style: one-line plain-English preamble (+ supersedes/closes refs), then
   active-voice bullets — what the reader does or what changes for them — max 16
   words each; known gaps/follow-ups get one line each. As commits land, collect
   them after a `---` as a `- [x] type(scope): …` checklist, squashing same-theme
   commits into one item (exemplar: jetbrains-ai-ml#1624). Every plan's final
   step: once implementation is done, rewrite the PR description to match what
   actually shipped. Optimize hard for conciseness and human-readability — a
   couple of bullets is almost always enough. Reach for an information hierarchy
   (sections, nesting) only when the content genuinely cannot fit in a few
   bullets; no PR has needed one yet (not even the v0.2.5 refactor), and needing
   one usually means the change should be a stacked set of PRs instead.
3. When a plan is drafted, review it adversarially with the `plan-review` skill,
   using a different model family from the planning session: Codex Ultra for Claude
   sessions, and Claude for every other agent. Provide minimal context and state the
   above design requirements explicitly. Iterate on the plan, or prompt the user to
   re-scope the task, as appropriate - you are free to propose multi-step, large
   refactorings if they help w.r.t. point 1.
4. Make sure all ambiguities and investigations are addressed in
   the plan. Leave no open questions for execution-time.

You may use workflows, or fan out subagents, as appropriate - but try to be conservative.
When planning is completed, print the full plan file path AND the plan's
branch so the user can hand both off to the contextless agent.
