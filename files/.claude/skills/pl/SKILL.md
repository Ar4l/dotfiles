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

- General design requirements are deep, narrow APIs, low-code and low-LOC, minimal
  prose and comments, long-term maintainability through simplicity and logical
  separation of concerns, datastructures, etc.
- Always work in a worktree, branch off the user's active development branch. If the
  change is nontrivial, always submit a **draft** PR into the user's active development
  branch, so they can follow along.
- When a plan is drafted, review adversarially with codex ultra (use the
  `plan-review` skill). Provide it minimal context, and state the above design
  requirements explicitly. Iterate on the plan, or prompt the user to re-scope the task,
  as appropriate.

You may use workflows, or fan out subagents, as appropriate - but try to be conservative.
