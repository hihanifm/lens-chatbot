# Lucky Mode v2: Planner–Generator–Evaluator

## Inspiration

[Anthropic Engineering: Harness Design for Long-Running Apps](https://www.anthropic.com/engineering/harness-design-long-running-apps)

Three-agent system where each agent has a distinct role and a clear handoff contract. Agents communicate via files in the workspace. The evaluator has **ground truth** — it verifies that claimed evidence actually exists in the logs rather than just assessing coherence.

---

## Why this beats v1

v1 (single pass) is limited by one agent's ability to self-direct. v2 unlocks:

- **Different models per role**: planner can be a small/fast model; generator a powerful reasoning model; evaluator a fast verifier. Cost + quality optimized per phase.
- **Ground-truth evaluation**: evaluator doesn't ask "does this seem right?" — it opens the log files and checks whether cited lines actually exist. Real signal, not vibes.
- **Iterative synthesis, not replacement**: on retry, the generator reads its previous report + evaluator objections and synthesizes further. It doesn't start over.
- **Sprint contracts**: generator proposes its investigation plan first; evaluator approves before any deep work starts. Catches wrong direction cheaply.

---

## Architecture

```
GET /session/:id/lucky-v2  (SSE)

Phase 0 — Sprint Contract  (fast, cheap model)
  Generator:  read bug summary + file list
              → propose investigation plan: hypothesis + evidence checklist
              → write: lucky_contract_proposal.md
  Evaluator:  read proposal
              → approve OR redirect with specific objection
              → write: lucky_contract.md  (agreed plan)
  (iterate until agreed, max 2 rounds)

Phase 1 — Deep Analysis  (powerful model)
  Generator:  execute against contract
              → collect evidence per checklist
              → form root cause hypothesis
              → self-evaluate before handoff
              → write: lucky_report.md

Phase 2 — Verification  (fast model)
  Evaluator:  read lucky_report.md
              → for each cited evidence line: open the log file and verify it exists
              → grade against criteria (see below)
              → write: lucky_evaluation.md

Phase 3 — Pass or Retry  (max LUCKY_MAX_ITERATIONS, default 2)
  If PASS:    stream lucky_report.md to user → done
  If FAIL:    Generator reads lucky_report.md + lucky_evaluation.md
              → synthesizes further (does NOT start over)
              → updates lucky_report.md
              → back to Phase 2
```

---

## Evaluation criteria (Phase 2)

The evaluator grades each criterion as PASS / FAIL with a reason:

| Criterion | What to check |
|-----------|--------------|
| Evidence verified | Open each cited log line. Does it exist? Does it say what the report claims? |
| Root cause specificity | Is it a cause, not a symptom? ("connection pool exhausted" not "service was slow") |
| Timestamp consistency | Do cited events appear in the correct chronological order? |
| Contradictions addressed | Did the generator note any evidence that contradicts the hypothesis? |
| Actionable resolution | Does the report end with a concrete next step or fix? |

**Pass threshold**: all 5 criteria PASS, or 4/5 with explicit acknowledgment of the failing one.

If any criterion fails, the evaluator writes specific, actionable objections — not "not confident" — e.g.:
> "Evidence not verified: report cites 'OOMKilled at 14:23:01' but that string does not appear in the provided log files. Check if the relevant log was included in context."

---

## File-based communication

All inter-agent state lives in the workspace:

```
workspacePath/
  lucky_contract_proposal.md   ← generator's proposed investigation plan
  lucky_contract.md            ← agreed sprint contract
  lucky_report.md              ← generator's root cause analysis (updated each retry)
  lucky_evaluation.md          ← evaluator's graded feedback (updated each retry)
```

This makes the investigation auditable — users can inspect each file after the run.

---

## Model configuration

```
LUCKY_GENERATOR_MODEL=<powerful model, e.g. claude-opus-4-7>
LUCKY_EVALUATOR_MODEL=<fast model, e.g. claude-haiku-4-5>
LUCKY_MAX_ITERATIONS=2
```

If `LUCKY_GENERATOR_MODEL` / `LUCKY_EVALUATOR_MODEL` are unset, fall back to the default `LLM_MODEL`.

---

## Files to Create/Modify

| File | Change |
|------|--------|
| `src/agent/luckyAnalyzerV2.ts` | **New** — orchestration for all phases |
| `src/agent/agentRunner.ts` | Add optional `modelOverride` to `AgentRunner.analyze()` input (if supporting per-phase models) |
| `src/app.ts` | Add `GET /session/:id/lucky-v2` SSE endpoint |
| `static/index.html` | Button upgrade: replace or augment lucky-btn |
| `.env.example` | Add `LUCKY_GENERATOR_MODEL`, `LUCKY_EVALUATOR_MODEL`, `LUCKY_MAX_ITERATIONS` |

---

## Key design decisions to resolve before implementation

1. **Model switching**: `ClineCoreAgentRunner` currently builds `LlmConfig` from env at startup. To use different models per phase, either (a) accept `modelOverride` in `analyze()` input and pass it into `buildSessionConfig`, or (b) create separate runner instances per model. Option (a) is less invasive.

2. **Abort support**: a multi-phase loop with no abort is a bad UX. Add an `AbortController`-style mechanism: the `/lucky-v2` endpoint checks an in-memory abort flag that `/session/:id/abort` sets. This should be in scope from day 1 for v2.

3. **Contract negotiation depth**: cap at 2 rounds maximum. If the evaluator still objects after 2 contract rounds, proceed with the generator's latest proposal rather than looping forever.

4. **Streaming during verification**: the evaluator's Phase 2 work (opening log files, verifying lines) should stream as status events so the user sees progress. Hide the evaluator's raw text output; show only the graded summary from `lucky_evaluation.md`.

5. **Lucky v1 relationship**: v2 replaces v1 for the "🎲" button, or can be offered as a separate mode. Suggest keeping v1 as the default until v2 is validated in production, then promoting v2.

---

## Open questions

- Should the sprint contract phase be visible to the user, or run silently with only a status event?
- If the evaluator finds missing log files ("cited evidence not in context"), should it auto-add them to the session and retry, or report to the user and stop?
- What's the right `LUCKY_MAX_ITERATIONS` default? The Anthropic article used hard thresholds per criterion with no iteration cap on contracts — worth discussing.

---

## Verification (when implemented)

1. Load a bug with a log attachment that has known errors
2. Trigger lucky-v2 — verify `lucky_contract_proposal.md` and `lucky_contract.md` appear in workspace after Phase 0
3. Verify `lucky_report.md` appears after Phase 1 and contains cited log lines that actually exist in the attachment
4. Verify `lucky_evaluation.md` appears after Phase 2 with per-criterion grades
5. If all pass: final report streams to user
6. If a criterion fails: verify generator reads previous report + evaluation and updates (not replaces) `lucky_report.md`
7. Abort: mid-run abort stops cleanly and re-enables UI
