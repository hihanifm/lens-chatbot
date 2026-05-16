import { Agent } from "@cline/sdk";
import path from "node:path";
import type { AgentRunner, AgentEvent } from "./agentRunner.js";
import { log } from "../logger.js";

const AGENTS_MD = path.resolve(import.meta.dirname, "../../agents.md");

const SYSTEM_PROMPT = `You are a bug analysis assistant for engineers.
You have access to a workspace containing bug details, logs, and attachments.
Use only files in this workspace. Do not modify files. Do not invent facts.

Respond directly to what the user is asking:
- Simple questions (priority, assignee, status) → answer concisely in 1-2 sentences.
- Requests for analysis or root cause → read the relevant files, cite exact log lines
  or snippets, and structure your answer as: observed facts, likely root cause,
  evidence, next debugging steps, and confidence level.
- Conversational follow-ups → answer naturally without repeating the full structure.

Always ground your answer in the workspace files. If the answer is not in the files,
say so clearly.`;

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
  const skillsDirs = (process.env.SKILLS_DIR ?? "").split(":").filter(Boolean);
  const skillsHint = skillsDirs.length > 0
    ? `Agent skills are defined as markdown files in these directories:\n${skillsDirs.map((d) => `  - ${d}`).join("\n")}\nRead relevant skill files before starting.\n\n`
    : "";
  return [
    `Read ${AGENTS_MD} for environment context and available tools.`,
    ``,
    `Workspace: ${input.workspacePath}`,
    `Files to analyze:\n${fileList}`,
    ``,
    history,
    skillsHint,
    `New question:\n${input.question}`,
  ].join("\n");
}

export class ClineSdkAgentRunner implements AgentRunner {
  private makeAgent() {
    return new Agent({
      providerId: (process.env.LLM_PROVIDER ?? "ollama") as any,
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
    events.push({ type: "status", content: `⚙ provider: ${process.env.LLM_PROVIDER ?? "ollama"} | model: ${process.env.LLM_MODEL} | files: ${input.files.length} | endpoint: ${process.env.LLM_BASE_URL}` });

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
    const runPromise = agent.run(prompt).then(() => {
      if (!done) {
        log.info("agent:done-via-promise", { ms: Date.now() - startedAt });
        events.push({ type: "status", content: `✓ done in ${((Date.now() - startedAt) / 1000).toFixed(1)}s` });
        done = true;
      }
    }).catch((err: Error) => {
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
