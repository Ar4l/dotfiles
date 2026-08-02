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

Get an independent review of the current plan from the **Codex** CLI agent (JetBrains AI
proxy, high reasoning effort). Codex explores the codebase itself — never on the plan's
word. Flow: locate plan → assemble context → run Codex read-only → surface → revise on approval.

## Preconditions

Both checks must pass; if not, stop, have the user run the one-time setup, then resume:

```sh
codex --version          # must resolve to a real binary
central agents           # "Codex … installed · wired"
```
One-time setup if missing:
```sh
brew reinstall codex && central add codex
# ensure ~/.codex/config.toml has:  model_reasoning_effort = 'high'
```

`central` is the JetBrains Central CLI (formerly `wire`); the `[model_providers.wire]`
stanza it writes into `~/.codex/config.toml` is correct, not stale. On "refresh token …
already used" errors, have the user run `central login` (suggest `! central login` so the
interactive flow runs in their session), then retry.

Evidence freshness: check `review_after:` in `reviewer-prompt-evidence.md` (same dir, via
grep); if past due, offer a refresh per that doc's Re-review note. Advisory only.

## Step 1 — Locate the plan file

Default to the newest plan (`ls -t ~/.claude/plans/*.md 2>/dev/null | head -1`); prefer a
path the session references. If multiple recent plans make it ambiguous, ask the user.

## Step 2 — Assemble the review context

Create a per-invocation work dir (`d=$(mktemp -d /tmp/codex-plan-review.XXXXXX)`) so
concurrent sessions can't clobber each other. Compose `$d/prompt.md` yourself from the
live conversation — Codex has none of this context — with these headings:

1. `## Original request` — the user's original prompt, verbatim.
2. `## Follow-up thread` — key clarifications, decisions, and constraints added since.
3. `## The plan` — the plan file's full text, verbatim.
4. `## Your task (Codex)` — the instruction block below.

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
- Silent assumptions: the request is ambiguous on a point that materially changes the
  plan (or a follow-up contradicts it) and the plan picked an interpretation without
  flagging it. Route these to "Open questions", not "Issues".
- Over-engineering: scope never asked for, speculative abstractions or configurability,
  or a construction substantially more complex than the request needs — name the
  simpler approach concretely.
- Blast radius: steps touching files, code, or behavior orthogonal to the request
  (drive-by refactors, reformatting, deletions the task doesn't require).
- Sequencing, risk, or correctness problems; major steps with no concrete verification
  (a test, command, or observable behavior). A plan the implementing agent cannot
  loop against is a finding.

Discipline — over-flagging is the most common failure of AI reviewers, so:
- Report only issues you can support with evidence. For each, quote the plan claim and
  cite the contradicting repo location (`path:line`) or the unmet part of the request.
- Separate "the plan is wrong" from "I would have done it differently." Only the former
  is an issue. Do not flag style or personal preference. Excess complexity relative to
  the request is a real issue, not a preference — but only when the alternative is
  concrete and materially simpler.
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
### Open questions
Ambiguities the plan resolved silently — each as a question for the user, stating the
plan's implicit answer and the alternative. Omit if none.
### Concrete suggested plan edits
Specific, actionable edits to the plan. Omit if none.
### Verdict
Exactly one of SHIP / REVISE / RETHINK, plus one sentence. State this LAST, after the
analysis above.
```

## Step 3 — Run Codex (headless, read-only, from the project root)

```sh
codex exec \
  --cd "$PWD" \
  --sandbox read-only \
  --skip-git-repo-check \
  -c model_reasoning_effort="high" \
  --output-last-message "$d/review.out" \
  "$(cat "$d/prompt.md")"
```

`--sandbox read-only` guarantees Codex cannot modify files. Takes minutes; let it finish.

## Step 4 — Surface the review

Read `$d/review.out`; summarize Codex's verdict, its highest-severity issues, and where
it agrees and disagrees with the plan. For each substantive point add **your own** take —
accept, reject (with reason), or needs-user-decision. Do not blindly defer to Codex.

## Step 5 — Revise on approval

Propose specific edits to the plan file; apply them **only after the user approves** (in
plan mode, the plan file is the one editable file). Leave `$d` and its two files in place
for the user to inspect, and tell the user its path.
