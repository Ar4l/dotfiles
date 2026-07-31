---
name: plan-review
description: >-
  Pipe the current plan to the Codex CLI agent for an independent second opinion.
  Codex re-reads the original request plus the follow-up thread and independently
  explores the codebase (read-only), then critiques the plan for gaps, wrong
  assumptions, missed existing utilities/patterns, and sequencing/risk issues.
  Use after a plan has been written, when the user wants a review or second opinion
  on a plan before implementing it (triggers: "review the plan", "get codex's take",
  "second opinion on this plan", "/plan-review").
---

# plan-review

Get an independent review of the current plan from the **Codex** CLI agent. Codex runs
through the JetBrains AI proxy (already wired via `central add codex`) with a capable
thinking model at high reasoning effort. Codex does its **own** codebase exploration —
it must not take the plan's claims about the code on faith.

The flow: locate the plan → assemble review context from this conversation → run Codex
headless and read-only → surface its findings → revise the plan only with user approval.

## Preconditions

Confirm Codex is available and wired. If either check fails, stop and tell the user to
run the one-time setup, then resume:

```sh
codex --version          # must resolve to a real binary
central agents           # "Codex … installed · wired"
```

One-time setup if missing:
```sh
brew reinstall codex && central add codex
# ensure ~/.codex/config.toml has:  model_reasoning_effort = 'high'
```

`central` is the JetBrains Central CLI — it holds Codex's proxy credentials and model
routing. It was formerly named `wire`; the provider stanza it writes into
`~/.codex/config.toml` is still `[model_providers.wire]`, so seeing `model_provider =
'wire'` there is correct and not a stale config.

If Codex errors with "refresh token … already used" / "log out and sign in again", the
JetBrains auth needs a refresh — tell the user to run `central login` (suggest
`! central login` so the interactive flow runs in their session), then retry.

**Evidence freshness check.** The Codex instruction block in this skill is grounded in
`reviewer-prompt-evidence.md` (same directory). Read its `review_after:` date; if today's
date is past it, tell the user the prompt-design evidence is over a month old and offer to
refresh it (follow the "Re-review" prompt in that doc) before proceeding. This is advisory
— do not block the review on it.

## Step 1 — Locate the plan file

- Default to the newest `*.md` under `~/.claude/plans/`:
  ```sh
  ls -t ~/.claude/plans/*.md 2>/dev/null | head -1
  ```
- If the active session references a specific plan path, prefer that.
- If multiple recent plans make the target ambiguous, ask the user which one.

## Step 2 — Assemble the review context

Write a single prompt file to `/tmp/codex-plan-review-prompt.md`. YOU (Claude) compose
this from the live conversation — Codex has none of this context. Include, clearly
delimited with headings:

1. **`## Original request`** — the user's first/original prompt, verbatim.
2. **`## Follow-up thread`** — the key clarifications and decisions made since (e.g.
   answers to clarifying questions, scope changes, constraints the user added).
3. **`## The plan`** — the full text of the plan file, verbatim.
4. **`## Your task (Codex)`** — paste the instruction block below.

Instruction block to give Codex:

```
You are reviewing an engineering plan that another coding agent wrote to satisfy the
original request above. Your job is to surface problems that are REAL and GROUNDED — not
to find as many problems as possible.

Ground every claim in the actual repository. Do NOT trust what the plan says about the
code — open the relevant files from the current working directory and verify. Any issue
you cannot tie to a specific line of the plan or a specific file in the repo does not
belong in your output.

Assess whether the plan correctly and completely satisfies the original request, given
the follow-up thread. Check specifically for:
- Gaps: parts of the request the plan does not address.
- Wrong assumptions about how the code actually works (verify against the repo).
- Existing functions/utilities/patterns the plan reinvents or ignores (cite the file).
- Sequencing, risk, or correctness problems; missing verification steps.
- Scope the request never asked for (over-engineering).

Discipline — over-flagging is the most common failure of AI reviewers, so:
- Report only issues you can support with evidence. For each, quote the plan claim and
  cite the contradicting repo location (`path:line`) or the unmet part of the request.
- Separate "the plan is wrong" from "I would have done it differently." Only the former
  is an issue. Do not flag style or personal preference.
- Do not invent requirements the original request never stated.
- Do not raise speculative concerns that have no concrete trigger.
- If the plan is sound, say so plainly. "No significant issues" is a valid, expected
  outcome — do not manufacture findings to fill a section.
- A longer or more detailed plan is not a better plan; judge substance.

Output these sections in Markdown, IN THIS ORDER (reason before you conclude):
### Strengths
What the plan gets right (brief).
### Issues
Bulleted, each tagged [HIGH] / [MED] / [LOW]. Every issue states: the plan claim
(quoted), the evidence (`path:line`, or the specific request gap), and why it matters.
Omit this section if there are none.
### Missing considerations
What the request needs that the plan omits. Omit if none.
### Concrete suggested plan edits
Specific, actionable edits to the plan. Omit if none.
### Verdict
Exactly one of SHIP / REVISE / RETHINK, plus one sentence. State this LAST, after the
analysis above.
```

## Step 3 — Run Codex (headless, read-only, in the project root)

Run from the user's project directory so Codex explores the real codebase:

```sh
codex exec \
  --cd "$PWD" \
  --sandbox read-only \
  --skip-git-repo-check \
  -c model_reasoning_effort="high" \
  --output-last-message /tmp/codex-plan-review.out \
  "$(cat /tmp/codex-plan-review-prompt.md)"
```

Notes:
- Model comes from the default in `~/.codex/config.toml` (the wired capable model). Add
  `-m <model>` only to override.
- `--sandbox read-only` guarantees Codex cannot modify files while reviewing.
- `--output-last-message` writes Codex's final structured review to a clean file.
- This can take a few minutes at high reasoning; let it finish.

## Step 4 — Surface the review

Read `/tmp/codex-plan-review.out` and give the user a concise summary:
- Codex's verdict and its highest-severity issues.
- Where Codex **agrees** with the plan and where it **disagrees**.
- For each substantive point, add **your own** take: accept, reject (with reason), or
  needs-user-decision. Do not blindly defer to Codex — it can be wrong too.

## Step 5 — Revise on approval

Propose specific edits to the plan file. Apply them to the plan **only after the user
approves**. If in plan mode, the plan file is the one editable file — update it there.
Leave the two `/tmp/codex-plan-review*` files in place for the user to inspect.
