---
name: Three-Phase RCA
description: Disciplined autonomous root-cause analysis — collect evidence first, then hypothesize, then interrogate. Prevents premature conclusions.
triggers: [yolo, autonomous, thorough analysis, deep dive, full investigation, lucky, automated rca]
---

# Three-Phase RCA

Use this skill for autonomous / unattended bug analysis where you must reach a
confident conclusion without a human in the loop. Follow the phases in order
— do not skip ahead, do not interleave.

## Phase 1: Evidence Collection

Before forming any hypothesis, collect raw evidence from the logs and files:

- List every ERROR and EXCEPTION line with its exact timestamp.
- List every WARNING that appears more than once.
- List anomalous values (unexpected nulls, memory spikes, connection resets,
  timeouts).
- Note the last successful operation before the first error.
- Note patterns: repeated errors, escalating frequency, correlated events.

Do **not** interpret yet. Just collect.

## Phase 2: Root Cause Hypothesis

Based ONLY on the evidence you collected above:

- State the most likely root cause in one sentence.
- Cite the specific evidence that points to it (use the standard citation
  format).
- Note any evidence that contradicts your hypothesis.
- Rate confidence: HIGH / MEDIUM / LOW, and explain why.

## Phase 3: Targeted Interrogation

Generate 2–3 specific questions that would raise or lower your confidence,
then answer each one by looking at the actual evidence:

> Q: [specific question about the logs]
> A: [what the logs actually show]

End with a one-paragraph summary a developer can act on.

## Companions

- Combine with the `android-log-file-map` skill in Phase 1 to choose files.
- Final report should follow the `android-rca-report` structure when written
  to `agent_notes/`.
