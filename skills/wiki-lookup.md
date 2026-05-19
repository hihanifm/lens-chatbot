---
name: Wiki Lookup
description: Check the troubleshooting wiki for prior confirmed root causes before re-deriving from raw logs. Read this before starting any RCA — confirmed fixes from past bugs shortcut investigation.
triggers: [wiki, prior bug, knowledge base, similar issue, past bug, previous investigation, known issue, has this happened before, troubleshooting wiki, lookup]
---

# Wiki Lookup

Use this skill **at the start of every analysis**. The wiki is a curated
knowledge base of confirmed root causes from resolved bugs. A 30-second
read can save a 20-minute log dive.

## Where it lives

The task prompt will include a line like:

```
Wiki: <path>/wiki/index.md
```

If no such line is present, the wiki is disabled for this session — skip
this skill.

## How to navigate (in order)

1. **Read the root index** (`wiki/index.md`). It lists every module
   (`ims`, `anr`, `tombstone`, `connectivity`, …) with tags and an entry
   count. Pick the 1–2 modules that match the symptom from `bug_summary.md`.
2. **Read each picked module's index** (`wiki/<module>/index.md`). One
   line per past entry with a one-sentence summary. Pick the 1–2 entries
   that most resemble this bug.
3. **Read those entry files in full** (`wiki/<module>/YYYYMMDD-BUGID-slug.md`).
   Each has Problem / Root Cause / Evidence / Resolution / Key Log Patterns.
4. **Apply what you learn**: if an entry's log patterns appear in this
   bug's attachments, cite the wiki entry as supporting evidence and
   reuse its root cause rather than re-deriving from scratch.

## When to skip a wiki hit

Do **not** force-fit a wiki entry. If the patterns don't actually appear
in this bug's logs, note that and move on. Confirmed-but-irrelevant is
still irrelevant.

## When to write back

If your investigation produces a *new* confirmed root cause not yet in
the wiki, use the `wiki-contribute` skill to add it.

## Output

When citing the wiki, use:

```
wiki/<module>/<filename> — <one-line summary of why it applies>
```

Cite alongside log evidence, not as a replacement for it.
