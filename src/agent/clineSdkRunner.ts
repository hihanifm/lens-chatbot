import { Agent } from "@cline/sdk";
import type { AgentRunner, AgentEvent } from "./agentRunner.js";
import { log } from "../logger.js";

const SYSTEM_PROMPT = `You are analyzing a bug report. Use only files in this workspace.
Do not modify files. Do not invent missing facts.
Cite exact log lines or snippets when possible.
Structure your answer as:
1. Observed facts
2. Likely root cause
3. Evidence
4. Next debugging steps
5. Confidence level`;

function buildPrompt(input: {
  workspacePath: string;
  files: string[];
  question: string;
  conversationSummary?: string;
}): string {
  const fileList = input.files.map((f) => `- ${f}`).join("\n");
  const history = input.conversationSummary
    ? `Conversation so far:\n${input.conversationSummary}\n\n`
    : "";
  return `Workspace: ${input.workspacePath}\nFiles to analyze:\n${fileList}\n\n${history}New question:\n${input.question}`;
}

export class ClineSdkAgentRunner implements AgentRunner {
  private makeAgent() {
    return new Agent({
      providerId: "openai-compatible",
      modelId: process.env.LLM_MODEL!,
      apiKey: process.env.LLM_API_KEY!,
      baseUrl: process.env.LLM_BASE_URL!,
      systemPrompt: SYSTEM_PROMPT,
    });
  }

  async *analyze(input: Parameters<AgentRunner["analyze"]>[0]): AsyncIterable<AgentEvent> {
    const agent = this.makeAgent();
    const events: AgentEvent[] = [];
    let done = false;
    let errored = false;
    let firstToken = false;
    const startedAt = Date.now();

    log.info("agent:start", { model: process.env.LLM_MODEL, files: input.files.length, question: input.question.slice(0, 60) });
    events.push({ type: "status", content: `⚙ model: ${process.env.LLM_MODEL} | files: ${input.files.length} | endpoint: ${process.env.LLM_BASE_URL}` });

    agent.subscribe((event: any) => {
      if (event.type === "assistant-text-delta" && event.text) {
        if (!firstToken) {
          log.debug("agent:first-token", { ms: Date.now() - startedAt });
          firstToken = true;
        }
        events.push({ type: "text", content: event.text });
      } else if (event.type === "completed" || event.type === "done") {
        log.info("agent:done", { ms: Date.now() - startedAt });
        events.push({ type: "status", content: `✓ done in ${((Date.now() - startedAt) / 1000).toFixed(1)}s` });
        done = true;
      } else if (event.type === "run-failed") {
        log.error("agent:run-failed", { full_event: JSON.stringify(event) });
        const errMsg = event.error ?? event.message ?? JSON.stringify(event);
        events.push({ type: "error", content: `run-failed: ${typeof errMsg === "string" ? errMsg : JSON.stringify(errMsg)}` });
        errored = true;
        done = true;
      } else if (event.type === "run-started") {
        events.push({ type: "status", content: "▶ run started" });
      } else if (event.type === "turn-started") {
        events.push({ type: "status", content: "↻ thinking..." });
      } else {
        log.debug("agent:event", { type: event.type });
        events.push({ type: "status", content: `· ${event.type}${event.message ? ": " + event.message : ""}` });
      }
    });

    const prompt = buildPrompt(input);
    const runPromise = agent.run(prompt).catch((err: Error) => {
      log.error("agent:run-error", { error: err.message });
      events.push({ type: "error", content: err.message });
      errored = true;
      done = true;
    });

    while (!done || events.length > 0) {
      if (events.length > 0) {
        yield events.shift()!;
      } else {
        await new Promise((r) => setTimeout(r, 10));
      }
    }

    await runPromise;
    if (!errored) yield { type: "done", content: "" };
  }
}
