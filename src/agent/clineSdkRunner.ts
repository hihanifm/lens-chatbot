import { Agent } from "@cline/sdk";
import type { AgentRunner, AgentEvent } from "./agentRunner.js";

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

    agent.subscribe((event: any) => {
      if (event.type === "assistant-text-delta" && event.text) {
        events.push({ type: "text", content: event.text });
      } else if (event.type === "completed" || event.type === "done") {
        done = true;
      }
    });

    const prompt = buildPrompt(input);
    const runPromise = agent.run(prompt).catch((err: Error) => {
      events.push({ type: "error", content: err.message });
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
    yield { type: "done", content: "" };
  }
}
