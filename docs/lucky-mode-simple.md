# Lucky Mode v1: Evidence-First Auto-Analysis

## What it is

A one-tap "I'm Feeling Lucky" button that fires a structured, single-pass root cause analysis. No user prompt required. The agent is forced into a disciplined evidence-collection → hypothesis → verification sequence rather than jumping straight to narrative confabulation.

## Why single-pass (no generator-evaluator loop)

- Generator and evaluator share the same model and same data → evaluator adds little signal
- Two full agent runs per iteration × up to 3 iterations = potentially 10+ minutes on local Ollama
- A well-structured chain-of-thought prompt consistently outperforms multi-pass self-refinement with the same model
- Loop complexity is upfront cost that buys almost nothing until you have *different* models for generator and evaluator (see Lucky Mode v2)

---

## Architecture

```
GET /session/:id/lucky  (SSE, same pattern as /analyze)
  → luckyAnalyzer.ts: runLucky(runner, session)
      1. Evidence collection pass
         Prompt forces: list ALL errors, exceptions, timestamps, anomalies
         Agent writes evidence to workspace: lucky_evidence.md
      2. Hypothesis pass
         Prompt: "Given only the evidence above, state root cause"
         Agent writes: lucky_report.md
      3. Targeted interrogation (optional, same agent turn)
         Agent generates 2-3 specific follow-up questions and answers them
         ("What was the last successful operation before the failure?")
```

Single `runner.analyze()` call — no loop, no second agent session. Lucky session ID is **not** persisted to DB (ephemeral). After completion, regular chat is re-enabled for follow-ups.

---

## Files to Create/Modify

| File | Change |
|------|--------|
| `src/agent/luckyAnalyzer.ts` | **New** — single-pass orchestration + prompt |
| `src/app.ts` | Add `GET /session/:id/lucky` SSE endpoint |
| `static/index.html` | Add "🎲 I'm Feeling Lucky" button + JS handler |
| `.env.example` | No new vars needed |

---

## The Prompt

The key is a three-phase chain-of-thought prompt sent as a single `question` to `runner.analyze()`:

```
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
Example format:
Q: [specific question about the logs]
A: [what the logs actually show]

End with a one-paragraph summary a developer can act on.
```

---

## Implementation

### `src/agent/luckyAnalyzer.ts`

```typescript
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
  session: { workspacePath: string; selected_files: string[] }
): AsyncIterable<AgentEvent> {
  yield { type: "status", content: "[Lucky] Starting evidence-first root cause analysis..." };

  for await (const event of runner.analyze({
    workspacePath: session.workspacePath,
    files: session.selected_files,
    question: LUCKY_PROMPT,
    // No clineSessionId → fresh ephemeral session
  })) {
    if (event.type === "session_id") continue; // don't persist lucky sessions to DB
    yield event;
    if (event.type === "done" || event.type === "error") break;
  }
}
```

### `src/app.ts` — new endpoint (add after `/analyze` route)

```typescript
import { runLucky } from "./agent/luckyAnalyzer.js";

app.get("/session/:id/lucky", async (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) return res.status(404).json({ error: "Session not found" });
  if (!session.workspace_path) return res.status(400).json({ error: "No workspace loaded" });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  broadcast(req.params.id, { type: "analyzing", mode: "lucky" }, undefined);

  for await (const event of runLucky(runner, session)) {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
    broadcast(req.params.id, event, undefined);
    if (event.type === "done" || event.type === "error") break;
  }

  res.end();
});
```

### `static/index.html` — button

**HTML** (add after `#send-btn`):
```html
<button id="lucky-btn" disabled title="Automatically find root cause">🎲 I'm Feeling Lucky</button>
```

**CSS**:
```css
#lucky-btn { background: #6c47ff; color: white; border: none; border-radius: 6px; padding: 8px 14px; cursor: pointer; font-size: 13px; }
#lucky-btn:disabled { opacity: 0.4; cursor: not-allowed; }
```

**JS** — enable alongside `#send-btn` when `hasContext` is true:
```javascript
// In the updateInputState() / hasContext check, add:
document.getElementById('lucky-btn').disabled = !hasContext;

document.getElementById('lucky-btn').onclick = async function runLucky() {
  const luckyBtn = document.getElementById('lucky-btn');
  const sendBtn = document.getElementById('send-btn');
  const input = document.getElementById('question-input');

  luckyBtn.disabled = true;
  sendBtn.disabled = true;
  input.disabled = true;

  appendMessage('user', '🎲 I\'m Feeling Lucky — finding root cause automatically...');
  const assistantEl = appendMessage('assistant', '', true);

  const es = new EventSource(`/session/${currentSessionId}/lucky`);

  es.onmessage = (e) => {
    const data = JSON.parse(e.data);
    if (data.type === 'text') {
      assistantEl.textContent += data.content;
      assistantEl.scrollIntoView({ behavior: 'smooth' });
    } else if (data.type === 'status') {
      appendMessage('status', data.content);
    } else if (data.type === 'done') {
      assistantEl.classList.remove('streaming');
      es.close();
      luckyBtn.disabled = false;
      sendBtn.disabled = false;
      input.disabled = false;
      input.placeholder = 'Ask a follow-up question...';
    } else if (data.type === 'error') {
      appendMessage('error', data.content);
      es.close();
      luckyBtn.disabled = false;
      sendBtn.disabled = false;
      input.disabled = false;
    }
  };

  es.onerror = () => {
    appendMessage('error', 'Lucky analysis failed — check connection.');
    es.close();
    luckyBtn.disabled = false;
    sendBtn.disabled = false;
    input.disabled = false;
  };
};
```

---

## Session lifecycle

Lucky sessions are ephemeral. The `session_id` event from `runner.analyze()` is swallowed and never written to SQLite. The agent's response is also **not** written to `messages` (chat history) — intentional: lucky mode is a one-shot diagnostic tool, not a conversation turn. The result is visible in the UI for the current page load only; a reload will not show it. After the run, regular chat is re-enabled — follow-up questions start a fresh persistent session.

## What's NOT in scope

- No generator-evaluator loop (see Lucky Mode v2)
- No abort button for lucky mode (add alongside v2 if needed)
- No new env vars

---

## Verification

1. `npm run dev` — load a bug, download attachment, add a file to context
2. "🎲 I'm Feeling Lucky" button appears enabled alongside Send
3. Click it — chat shows user message + streaming assistant bubble
4. Status event `[Lucky] Starting evidence-first root cause analysis...` appears
5. Three phases visible in the streamed output: Evidence Collection → Hypothesis → Interrogation
6. On completion, regular question input re-enables with "Ask a follow-up question..." placeholder
7. `npm run test:e2e` passes unchanged
