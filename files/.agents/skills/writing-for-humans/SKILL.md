---
name: writing-for-humans
description: >-
  Style rules for any text a human will read: docs, reports, presentations,
  tickets, PR descriptions, chat responses. Use when writing or editing such
  text, or when asked to make text concise, human-friendly, or free of
  LLM-isms.
---

Rules for text a human reads. Apply every rule; when two conflict, precision wins over brevity.

- Shorter by leaving things out, not by packing them in: fix the budget first (bullets, sentences, slides), then keep only what changes what the reader does.
- Refer by name: wrap ids and URLs inside a descriptive title; a bare `#42` or slug is illegible.
- Fixed skeleton: decide the few sections a document may have. Push back on anything that does not fit one.
- List only what is settled. Open or unknown items get one coarse line in a "not yet" section, not a bullet each.
- Leading words: name each concept once with a common word, then reuse the word; never re-explain the concept.
- State the target, not the ban. "Do X" beats "don't do Y"; a prohibition makes Y more likely.
- No-op test per sentence: if the reader would assume it anyway, delete the whole sentence, not a few words.
- Single source of truth: never repeat what a linked file, config, or tool output already says; write only the reason or the gotcha.
- Lead with the answer; one idea per sentence; plain words you would say aloud, without losing the number, path, or condition that changes what the reader does.
- Try to ground every claim: a file, id, URL, or measurement, otherwise indicate that it is not well-grounded.
- Bullets only for parallel items, ≤160 chars, no bullet that is a paragraph. Arguments stay as prose.
- Sentences carry their meaning alone: no em-dashes, no "not X but Y", no label-colon-bullet unless it is an index entry, no preamble, no "note that", no closing offer.
