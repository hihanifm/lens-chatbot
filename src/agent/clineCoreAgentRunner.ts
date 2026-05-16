import { ClineCore, DefaultToolNames } from "@cline/sdk";
import type { CoreSessionEvent } from "@cline/sdk";
import type { AgentEvent, AgentRunner } from "./agentRunner.js";
import { buildPrompt, loadAgentSkills, SYSTEM_PROMPT } from "./agentPrompt.js";
import { log } from "../logger.js";

function resultText(result: any): string {
  return result?.text ?? result?.outputText ?? result?.result?.text ?? result?.result?.outputText ?? "";
}

export class ClineCoreAgentRunner implements AgentRunner {
  async *analyze(input: Parameters<AgentRunner["analyze"]>[0]): AsyncIterable<AgentEvent> {
    const skills = await loadAgentSkills();
    const events: AgentEvent[] = [];
    let done = false;
    let errored = false;
    let streamedText = "";
    const startedAt = Date.now();

    const cline = await ClineCore.create({ backendMode: "local", clientName: "lens-chatbot" });
    const unsubscribe = cline.subscribe((event: CoreSessionEvent) => {
      if (event.type === "agent_event") {
        const agentEvent: any = event.payload.event;
        if (agentEvent.type === "assistant-text-delta" && agentEvent.text) {
          streamedText += agentEvent.text;
          events.push({ type: "text", content: agentEvent.text });
        } else if (agentEvent.type === "tool-started") {
          events.push({ type: "status", content: `tool: ${agentEvent.toolCall?.toolName ?? "started"}` });
        } else if (agentEvent.type === "tool-finished") {
          events.push({ type: "status", content: `tool done: ${agentEvent.toolCall?.toolName ?? "unknown"}` });
        } else if (agentEvent.type === "status-notice" && agentEvent.message) {
          events.push({ type: "status", content: agentEvent.message });
        }
      } else if (event.type === "hook" && event.payload.toolName) {
        events.push({ type: "status", content: `${event.payload.hookEventName}: ${event.payload.toolName}` });
      } else if (event.type === "status") {
        events.push({ type: "status", content: event.payload.status });
      } else if (event.type === "ended") {
        events.push({ type: "status", content: `done in ${((Date.now() - startedAt) / 1000).toFixed(1)}s` });
      }
    });

    log.info("agent:start", { runtime: "cline-core", model: process.env.LLM_MODEL, files: input.files.length, skills: skills.length, question: input.question.slice(0, 60) });
    events.push({ type: "status", content: `provider: ${process.env.LLM_PROVIDER ?? "ollama"} | model: ${process.env.LLM_MODEL} | runtime: cline-core | files: ${input.files.length}` });
    if (skills.length > 0) {
      events.push({ type: "status", content: `skills: ${skills.map((s) => s.name).join(", ")}` });
    }

    const prompt = buildPrompt({ ...input, skills });
    const runPromise = cline.start({
      source: "api" as any,
      interactive: false,
      prompt,
      config: {
        providerId: (process.env.LLM_PROVIDER ?? "ollama") as any,
        modelId: process.env.LLM_MODEL!,
        apiKey: process.env.LLM_API_KEY!,
        baseUrl: process.env.LLM_BASE_URL!,
        cwd: input.workspacePath,
        workspaceRoot: input.workspacePath,
        mode: "plan",
        systemPrompt: SYSTEM_PROMPT,
        maxIterations: Number(process.env.AGENT_MAX_ITERATIONS ?? 12),
        enableTools: true,
        enableSpawnAgent: false,
        enableAgentTeams: false,
        disableMcpSettingsTools: true,
        checkpoint: { enabled: false },
        toolPolicies: {
          [DefaultToolNames.APPLY_PATCH]: { enabled: false },
          [DefaultToolNames.EDITOR]: { enabled: false },
          [DefaultToolNames.FETCH_WEB_CONTENT]: { enabled: false },
          [DefaultToolNames.SUBMIT_AND_EXIT]: { enabled: false },
        },
      },
      localRuntime: {
        configExtensions: ["skills"],
      },
    }).then((startResult: any) => {
      const text = resultText(startResult.result);
      if (text && !streamedText.includes(text)) {
        events.push({ type: "text", content: text });
      }
      log.info("agent:done", { runtime: "cline-core", ms: Date.now() - startedAt });
      done = true;
    }).catch((err: Error) => {
      log.error("agent:run-error", { runtime: "cline-core", error: err.message });
      events.push({ type: "error", content: err.message });
      errored = true;
      done = true;
    }).finally(async () => {
      unsubscribe();
      await cline.dispose().catch((err: Error) => log.error("agent:dispose-error", { runtime: "cline-core", error: err.message }));
    });

    while (!done || events.length > 0) {
      if (events.length > 0) yield events.shift()!;
      else await new Promise((r) => setTimeout(r, 10));
    }

    await runPromise;
    if (!errored) yield { type: "done", content: "" };
  }
}
