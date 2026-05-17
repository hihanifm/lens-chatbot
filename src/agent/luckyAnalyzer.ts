import type { AgentRunner, AgentEvent } from "./agentRunner.js";

const LUCKY_PROMPT = `
You are performing an automated root cause analysis. Follow these phases exactly — do not skip ahead.

## Phase 1: Evidence Collection
Before forming any hypothesis, collect all raw evidence from the logs and files:
- List every ERROR and EXCEPTION line with its exact timestamp
- List every WARNING that appears more than once
- List any anomalous values (unexpected nulls, memory spikes, connection resets, timeouts)
- Note the last successful operation before the first error
- Note any patterns: repeated errors, escalating frequency, correlated events

Do not interpret yet. Just collect.

## Phase 2: Root Cause Hypothesis
Based ONLY on the evidence you collected above:
- State the most likely root cause in one sentence
- Cite the specific evidence that points to it
- Note any evidence that contradicts your hypothesis
- Rate your confidence: HIGH / MEDIUM / LOW and explain why

## Phase 3: Targeted Interrogation
Generate 2-3 specific questions that would raise or lower your confidence, then answer each one by looking at the evidence:
Q: [specific question about the logs]
A: [what the logs actually show]

End with a one-paragraph summary a developer can act on.
`.trim();

export async function* runLucky(
  runner: AgentRunner,
  session: { workspace_path: string; selected_files: string[] }
): AsyncIterable<AgentEvent> {
  yield { type: "status", content: "[Lucky] Starting evidence-first root cause analysis..." };

  for await (const event of runner.analyze({
    workspacePath: session.workspace_path,
    files: session.selected_files,
    question: LUCKY_PROMPT,
    // No clineSessionId → fresh ephemeral session
  })) {
    if (event.type === "session_id") continue; // don't persist lucky sessions to DB
    yield event;
    if (event.type === "done" || event.type === "error") break;
  }
}
