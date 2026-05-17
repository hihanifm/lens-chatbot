import { ClineCore, DefaultToolNames, SessionSource } from "@cline/sdk";
import type { CoreSessionEvent } from "@cline/sdk";
import type { AgentEvent, AgentRunner } from "./agentRunner.js";
import { buildPrompt, loadAgentSkills, SYSTEM_PROMPT } from "./agentPrompt.js";
import { settings } from "../db.js";
import { log } from "../logger.js";

function resultText(result: any): string {
  return result?.text ?? result?.outputText ?? result?.result?.text ?? result?.result?.outputText ?? "";
}

export class ClineCoreAgentRunner implements AgentRunner {
  async *analyze(input: Parameters<AgentRunner["analyze"]>[0]): AsyncIterable<AgentEvent> {
    const skills = await loadAgentSkills();
    const llmCfg = settings.getLlmConfig();
    const queue: AgentEvent[] = [];
    let notify: (() => void) | null = null;
    let done = false;
    let errored = false;
    let streamedText = "";
    const startedAt = Date.now();

    const push = (event: AgentEvent) => {
      queue.push(event);
      notify?.();
    };

    const cline = await ClineCore.create({ backendMode: "local", clientName: "lens-chatbot" });
    const unsubscribe = cline.subscribe((event: CoreSessionEvent) => {
      if (event.type === "agent_event") {
        const agentEvent: any = event.payload.event;
        if (agentEvent.type === "assistant-text-delta" && agentEvent.text) {
          streamedText += agentEvent.text;
          push({ type: "text", content: agentEvent.text });
        } else if (agentEvent.type === "tool-started") {
          push({ type: "status", content: `tool: ${agentEvent.toolCall?.toolName ?? "started"}` });
        } else if (agentEvent.type === "tool-finished") {
          push({ type: "status", content: `tool done: ${agentEvent.toolCall?.toolName ?? "unknown"}` });
        } else if (agentEvent.type === "status-notice" && agentEvent.message) {
          push({ type: "status", content: agentEvent.message });
        }
      } else if (event.type === "hook" && event.payload.toolName) {
        push({ type: "status", content: `${event.payload.hookEventName}: ${event.payload.toolName}` });
      } else if (event.type === "status") {
        push({ type: "status", content: event.payload.status });
      } else if (event.type === "ended") {
        push({ type: "status", content: `done in ${((Date.now() - startedAt) / 1000).toFixed(1)}s` });
      }
    });

    log.info("agent:start", { runtime: "cline-core", model: llmCfg.model, files: input.files.length, skills: skills.length, question: input.question.slice(0, 60) });
    push({ type: "status", content: `provider: ${llmCfg.provider} | model: ${llmCfg.model} | runtime: cline-core | files: ${input.files.length}` });
    if (skills.length > 0) {
      push({ type: "status", content: `skills: ${skills.map((s) => s.name).join(", ")}` });
    }

    const prompt = buildPrompt({ ...input, skills });
    const runPromise = cline.start({
      source: SessionSource.API,
      interactive: false,
      prompt,
      config: {
        providerId: (llmCfg.provider === "openai-compatible" ? "openai" : llmCfg.provider) as any,
        modelId: llmCfg.model,
        apiKey: llmCfg.apiKey ?? "",
        baseUrl: llmCfg.provider === "openai" ? "https://api.openai.com/v1" : (llmCfg.baseUrl ?? ""),
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
    }).then((startResult: any) => {
      const text = resultText(startResult.result);
      if (text && !streamedText.includes(text)) {
        push({ type: "text", content: text });
      }
      log.info("agent:done", { runtime: "cline-core", ms: Date.now() - startedAt });
      done = true;
      notify?.();
    }).catch((err: Error) => {
      log.error("agent:run-error", { runtime: "cline-core", error: err.message });
      push({ type: "error", content: err.message });
      errored = true;
      done = true;
      notify?.();
    }).finally(async () => {
      unsubscribe();
      await cline.dispose().catch((err: Error) => log.error("agent:dispose-error", { runtime: "cline-core", error: err.message }));
    });

    while (!done || queue.length > 0) {
      if (queue.length > 0) {
        yield queue.shift()!;
      } else {
        await new Promise<void>((r) => { notify = r; });
        notify = null;
      }
    }

    await runPromise;
    if (!errored) yield { type: "done", content: "" };
  }
}
