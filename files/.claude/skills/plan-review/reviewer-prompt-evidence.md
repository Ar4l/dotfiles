---
name: reviewer-prompt-evidence
description: Empirical basis for the plan-review Codex prompt design. Re-review when stale.
last_reviewed: 2026-06-16
review_after: 2026-07-16
---

# Reviewer-prompt evidence

## Purpose

This is the evidence behind each choice in the Codex instruction block in `SKILL.md`
(the block under "## Step 2 … ## Your task (Codex)"). Read this before changing that
block — every line of the prompt maps to a finding below. Distilled from a four-survey
review of empirical LLM-as-judge / self-critique / AI-code-review literature plus
vendor docs and community feeds (2026-06-16). Empirical findings are weighted over
anecdote.

## High-leverage findings → prompt-design implication

| # | Finding | Implication for the prompt | Confidence |
|---|---|---|---|
| 1 | **Critique is only reliable when grounded in an external oracle.** Intrinsic self-correction degrades accuracy (GSM8K 75.9→74.7; CommonSenseQA 75.8→38.1); correction works only with reliable external feedback or tools. | Force Codex to open and verify against the real repo; reject any issue not tied to a plan line or repo file. This is the single highest-leverage choice. | **High** |
| 2 | **Reason before the verdict.** Autoregressive models don't "support" a conclusion emitted before its reasoning; evidence-first / critique-then-score improves human alignment. | Output order is Strengths → Issues → Missing → Edits → **Verdict last**. (Previously Verdict was first — the main fix.) | **High** |
| 3 | **Over-flagging is the dominant failure mode of AI reviewers**, not missing bugs. CriticGPT: models that hallucinate more bugs also catch more; out-of-the-box code reviewers systematically reject correct code; baseline precision ~0.28; community's #1 complaint is noise (~90% FPs, "cry wolf" dismissal at ~20% FP rate). | Add explicit precision discipline: evidence per issue, separate "wrong" from "I'd do it differently", forbid inventing requirements, forbid speculative concerns, permit "no significant issues". | **High** |
| 4 | **Cited evidence is the strongest single bias mitigation** and makes verdicts auditable. | Each issue must quote the plan claim + cite `path:line` (or the specific request gap). Required, not "where relevant". | **High** |
| 5 | **Specific named criteria beat vague "quality"; heavy procedural rubrics can underperform plain CoT.** | Keep the five specific checks; do NOT expand into a weighty scoring rubric. | **Med-High** |
| 6 | **Self-enhancement / self-attribution bias**: judges favour their own family and rate self-authored work as lower-risk; cross-family judging mitigates it. | Codex (GPT) reviewing a Claude-authored plan is already cross-family — a built-in strength. Keep the planner and reviewer on different model families. | **High** |
| 7 | **Verbosity bias** (>90% prefer longer answers) and **sycophancy/leniency** (agree with authoritative/consensus framing). | Tell the reviewer length ≠ quality; keep framing neutral ("another coding agent wrote the plan"), don't signal that approval is wanted. | **Med-High** |
| 8 | **Human-in-the-loop beats critic-alone or human-alone** (CriticGPT). | Skill already surfaces findings for the user to accept/reject and revises only on approval — keep that flow; frame Codex output as candidates, not a gate. | **High** |
| 9 | **Verbalised self-confidence is poorly calibrated** ("confidently wrong"); self-consistency across resamples is the better signal but costs N×. | Do NOT add a self-reported confidence score. Multi-sampling was considered and declined for cost; precision is enforced by framing (#3) instead. | **Med** |

## Caveats

- **Over-flagging is the failure to design against** — bias the prompt toward precision,
  not recall.
- **Grounding reduces but never eliminates hallucination** — even repo-grounded review
  can fabricate; the `path:line` requirement makes unsupported claims visible.
- **Verbalised confidence is unreliable** — don't gate on it.
- **High-level architectural judgement is where models are weakest** — anchor every claim
  in concrete repo evidence rather than abstract design opinion.
- Some 2026-dated preprints surfaced in search could not be fully verified and are
  treated as low-confidence; the canonical anchors below are well-attested.

## Sources

**Academic — empirical (canonical anchors):**
- Huang et al., "LLMs Cannot Self-Correct Reasoning Yet," ICLR 2024 — https://arxiv.org/abs/2310.01798
- Kamoi et al., "When Can LLMs Actually Correct Their Own Mistakes?" TACL 2024 — https://arxiv.org/abs/2406.01297
- Gou et al., "CRITIC: LLMs Self-Correct with Tool-Interactive Critiquing," ICLR 2024 — https://arxiv.org/abs/2305.11738
- Madaan et al., "Self-Refine," NeurIPS 2023 — https://arxiv.org/abs/2303.17651
- Shinn et al., "Reflexion," NeurIPS 2023 — https://arxiv.org/abs/2303.11366
- Wang et al., "Large Language Models are not Fair Evaluators," ACL 2024 — https://arxiv.org/abs/2305.17926
- Zheng et al., "Judging LLM-as-a-Judge with MT-Bench / Chatbot Arena," NeurIPS 2023 — https://arxiv.org/abs/2306.05685
- Liu et al., "G-Eval," EMNLP 2023 — https://arxiv.org/abs/2303.16634
- Kim et al., "Prometheus," 2023 — https://arxiv.org/abs/2310.08491
- McAleese et al. (OpenAI), "LLM Critics Help Catch LLM Bugs" (CriticGPT), 2024 — https://arxiv.org/abs/2407.00215
- "Finding Blind Spots in Evaluator LLMs" — https://arxiv.org/abs/2406.13439 ; "Replacing Judges with Juries" (PoLL) — https://arxiv.org/abs/2404.18796

**Academic — empirical (lower-confidence / 2026-dated, verify before citing):** requirement-conformance overcorrection (arXiv:2603.00539, 2508.12358); FP reduction in static analysis (arXiv:2601.18844); self-attribution bias (arXiv:2603.04582); scaling agent systems (arXiv:2512.08296).

**Vendor docs — asserted (not eval-quantified unless noted):**
- Anthropic prompt-engineering: XML tags, role/system prompts, CoT, success criteria, quote-grounding — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices
- OpenAI GPT-5 / Codex prompting guides: reasoning_effort, self-reflection rubric, native "review" mode (findings-first by severity with file/line; "if nothing found, say so"), `path:line` citation format — https://developers.openai.com/cookbook/examples/gpt-5/codex_prompting_guide

**Practitioner — mostly asserted, some data-backed:**
- Eugene Yan, "LLM-evaluators / LLM patterns" (synthesises CoT, specific-criteria, bias data) — https://eugeneyan.com/writing/llm-evaluators/
- Hamel Husain, "Creating an LLM-as-a-Judge" (binary + critique-before-verdict; avoid 1–5 scales) — https://hamel.dev/blog/posts/llm-judge/

**Community — anecdotal unless noted:**
- HN "Mysti" cross-model review thread (skeptical of unverified claims, demands evals) — https://news.ycombinator.com/item?id=46365105
- Cross-model benchmark / adversarial-review writeups; Cloudflare "AI code review at scale" (highest-value prompt work = telling the LLM what NOT to flag) — https://blog.cloudflare.com/ai-code-review
- Consensus: cross-model review catches *complementary* blind spots, but much "agreement" is both models saying "looks fine"; diminishing returns as base capability rises.

## Re-review

> **Re-review due 2026-07-16.** To refresh: re-run a survey of LLM-as-judge,
> self-critique, and AI-code-review literature plus community feeds for material published
> since 2026-06-16, prioritising empirical studies. Diff new findings against the table
> above. Update the Codex instruction block in `SKILL.md` **only where the evidence has
> changed** — do not churn the prompt for its own sake. Then bump `last_reviewed` and
> `review_after` (by one month) in this file's frontmatter.
