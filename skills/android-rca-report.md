---
name: Android RCA Report
description: Structured root-cause-analysis answer template for Android bug reports — Symptom, Suspected component, Trigger, Evidence, Hypothesis, Next steps
triggers: [rca, root cause, analyze, analysis, why did, what caused, diagnose, investigate, root-cause]
---

# Android RCA Report

Use this skill when the user asks for analysis, root cause, "why did this
happen", or any structured investigation of an Android bug. Don't use it for
simple lookups (priority, assignee, status) or conversational follow-ups —
answer those directly.

## Before you start

- If the `android-log-file-map` skill is loaded, consult it to pick the
  highest-signal files for the user's topic.
- Citation format applies to every evidence line — see the citation format
  section in the task header.

## Answer structure

Produce the response in this order. Keep each section tight.

1. **Symptom** — one line: what the user or device experienced.
2. **Suspected component** — one of: AMS / SystemServer / RIL / IMS / Binder /
   ART / kernel / app (or "unclear — see Evidence").
3. **Trigger event** — first key event with timestamp + PID/TID.
4. **Evidence** — 2–4 log-line citations using the format:
   `<file>:<line> — MM-DD HH:MM:SS.mmm PID TID L TAG: message`.
   For stack traces, cite the FATAL line plus the first 2–3 frames.
5. **Hypothesis** — one or two sentences; tag confidence `low` / `medium` / `high`.
6. **Next debug steps** — concrete `dumpsys` commands, follow-up files to read,
   or repro hints. Be specific, not generic.

## Quality bar

- Every claim must trace to a workspace file. If the answer isn't in the files,
  say so explicitly rather than guessing.
- Prefer 3 strong citations over 8 weak ones — respect the iteration budget.
- If a prior report in `agent_notes/` already nails the root cause, cite it and
  refine rather than re-derive.
