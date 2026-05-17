import { ClineCore, DefaultToolNames, SessionSource } from "@cline/sdk";
import type { CoreSessionEvent } from "@cline/sdk";
import type { AgentEvent, AgentRunner } from "./agentRunner.js";
import { buildPrompt, loadAgentSkills, getWikiRootIndexPath } from "./agentPrompt.js";
import { loadPrompt } from "../prompts/promptLoader.js";
import { settings } from "../db.js";
import { log } from "../logger.js";
import fs from "fs/promises";
import path from "path";

async function buildFileCommentMap(
  workspacePath: string,
  files: string[]
): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  let bug: any;
  try {
    const raw = await fs.readFile(path.join(workspacePath, "bug.json"), "utf8");
    bug = JSON.parse(raw);
  } catch (err: any) {
    log.debug("agent:bug-json-missing", { workspacePath, error: err.message, stack: err.stack });
    return map;
  }
  for (const comment of bug.comments ?? []) {
    for (const att of comment.attachments ?? []) {
      const flatSuffix = `/${att.name}`;
      const zipBase = `/${path.basename(att.name, ".zip")}/`;
      for (const f of files) {
        if (f.endsWith(flatSuffix) || f.includes(zipBase)) {
          map[f] = comment.body;
        }
      }
    }
  }
  return map;
}

function resultText(result: any): string {
  return result?.text ?? result?.outputText ?? result?.result?.text ?? result?.result?.outputText ?? "";
}

let clineInstance: ClineCore | null = null;

async function getCline(): Promise<ClineCore> {
  if (!clineInstance) {
    clineInstance = await ClineCore.create({ backendMode: "local", clientName: "lens-chatbot" });
  }
  return clineInstance;
}

function buildSessionConfig(input: Parameters<AgentRunner["analyze"]>[0], llmCfg: ReturnType<typeof settings.getLlmConfig>) {
  return {
    providerId: (llmCfg.provider === "openai" ? "openai-native" : llmCfg.provider === "openai-compatible" ? "openai-compatible" : llmCfg.provider) as any,
    modelId: llmCfg.model,
    apiKey: llmCfg.apiKey || "none",
    baseUrl: llmCfg.provider === "openai" ? "https://api.openai.com/v1" : (llmCfg.baseUrl ?? ""),
    cwd: input.workspacePath,
    workspaceRoot: input.workspacePath,
    mode: "plan" as const,
    systemPrompt: "", // empty → ClineCore uses its own DEFAULT_CLINE_SYSTEM_PROMPT
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
  };
}

export class ClineCoreAgentRunner implements AgentRunner {
  async abort(clineSessionId: string): Promise<void> {
    const cline = await getCline();
    await cline.abort(clineSessionId);
  }

  async stop(clineSessionId: string): Promise<void> {
    const cline = await getCline();
    await cline.stop(clineSessionId);
  }

  async *analyze(input: Parameters<AgentRunner["analyze"]>[0]): AsyncIterable<AgentEvent> {
    const [skills, wikiRootIndex, fileComments, taskContext] = await Promise.all([
      loadAgentSkills(),
      getWikiRootIndexPath(),
      buildFileCommentMap(input.workspacePath, input.files),
      loadPrompt("task"),
    ]);
    const agentNotesDir = path.join(input.workspacePath, "agent_notes");
    let priorReports: string[] = [];
    try {
      const entries = await fs.readdir(agentNotesDir);
      priorReports = entries
        .filter((e) => e.endsWith(".md"))
        .sort()
        .reverse()
        .map((e) => path.join(agentNotesDir, e));
    } catch { /* agent_notes/ missing — fine */ }
    const llmCfg = settings.getLlmConfig();
    const queue: AgentEvent[] = [];
    const wakeup = { fn: null as (() => void) | null };
    let done = false;
    let errored = false;
    let streamedText = "";
    const startedAt = Date.now();

    const push = (event: AgentEvent) => {
      queue.push(event);
      wakeup.fn?.();
    };

    const cline = await getCline();

    log.info("agent:start", { runtime: "cline-core", model: llmCfg.model, files: input.files.length, skills: skills.length, question: input.question.slice(0, 60), reuse: !!input.clineSessionId });
    push({ type: "status", content: `provider: ${llmCfg.provider} | model: ${llmCfg.model} | runtime: cline-core | files: ${input.files.length}` });
    if (skills.length > 0) {
      push({ type: "status", content: `skills: ${skills.map((s) => s.name).join(", ")}` });
    }

    const prompt = buildPrompt({ ...input, fileComments, skills, wikiRootIndex, priorReports, taskContext });
    let clineSessionId = input.clineSessionId;

    const runPromise = (async () => {
      const setupSubscription = (sessionId?: string): (() => void) => {
        return cline.subscribe((event: CoreSessionEvent) => {
          const evtSession = (event.payload as any)?.sessionId as string | undefined;
          if (sessionId && evtSession && evtSession !== sessionId) return;
          if (event.type === "agent_event") {
            const agentEvent: any = event.payload.event;
            if (agentEvent.type === "content_start" && agentEvent.contentType === "text" && agentEvent.text) {
              streamedText += agentEvent.text;
              push({ type: "text", content: agentEvent.text });
            } else if (agentEvent.type === "content_start" && agentEvent.contentType === "tool") {
              log.debug("agent:tool-start", { tool: agentEvent.toolName, sessionId: clineSessionId });
              push({ type: "status", content: `tool: ${agentEvent.toolName ?? "started"}` });
            } else if (agentEvent.type === "content_end" && agentEvent.contentType === "tool") {
              log.debug("agent:tool-done", { tool: agentEvent.toolName, sessionId: clineSessionId });
              push({ type: "status", content: `tool done: ${agentEvent.toolName ?? "unknown"}` });
            } else if (agentEvent.type === "notice" && agentEvent.message) {
              push({ type: "status", content: `notice [${agentEvent.noticeType}]: ${agentEvent.message}` });
            } else if (agentEvent.type === "usage") {
              const parts = [`tokens ↑${agentEvent.totalInputTokens} ↓${agentEvent.totalOutputTokens}`];
              if (agentEvent.totalCost != null) parts.push(`cost $${agentEvent.totalCost.toFixed(4)}`);
              if (agentEvent.cacheReadTokens) parts.push(`cache-hit ${agentEvent.cacheReadTokens}`);
              push({ type: "status", content: parts.join(" | ") });
            } else if (agentEvent.type === "done" && agentEvent.reason !== "completed") {
              push({ type: "status", content: `⚠ agent stopped: ${agentEvent.reason} (${agentEvent.iterations} iterations)` });
            }
          } else if (event.type === "hook" && event.payload.toolName) {
            push({ type: "status", content: `${event.payload.hookEventName}: ${event.payload.toolName}` });
          } else if (event.type === "status") {
            push({ type: "status", content: event.payload.status });
          } else if (event.type === "ended") {
            push({ type: "status", content: `done in ${((Date.now() - startedAt) / 1000).toFixed(1)}s` });
          }
        }, { sessionId });
      };

      let unsubscribe: (() => void) = () => {};

      try {
        if (clineSessionId) {
          // Follow-up turn — reuse existing ClineCore session
          unsubscribe = setupSubscription(clineSessionId);
          const result = await cline.send({ sessionId: clineSessionId, prompt });
          const text = resultText(result);
          if (text && !streamedText.includes(text)) push({ type: "text", content: text });
        } else {
          // First turn — subscribe before start() so streaming events are not missed
          unsubscribe = setupSubscription();
          const startResult = await cline.start({
            source: SessionSource.API,
            interactive: false,
            prompt,
            config: buildSessionConfig(input, llmCfg),
          });
          clineSessionId = startResult.sessionId;
          push({ type: "session_id", content: clineSessionId });
          const text = resultText(startResult.result);
          if (text && !streamedText.includes(text)) push({ type: "text", content: text });
        }
        log.info("agent:done", { runtime: "cline-core", ms: Date.now() - startedAt, sessionId: clineSessionId });
      } catch (err: any) {
        // Fallback: if session no longer exists (e.g. after Docker restart), start fresh
        if (clineSessionId && err.message?.includes("not found")) {
          log.warn("agent:session-not-found", { clineSessionId, fallback: "start" });
          unsubscribe();
          unsubscribe = setupSubscription();
          const startResult = await cline.start({
            source: SessionSource.API,
            interactive: false,
            prompt,
            config: buildSessionConfig(input, llmCfg),
          });
          clineSessionId = startResult.sessionId;
          push({ type: "session_id", content: clineSessionId });
          const text = resultText(startResult.result);
          if (text && !streamedText.includes(text)) push({ type: "text", content: text });
          log.info("agent:done", { runtime: "cline-core", ms: Date.now() - startedAt, sessionId: clineSessionId, fallback: true });
        } else {
          log.error("agent:run-error", { runtime: "cline-core", error: err.message, stack: err instanceof Error ? err.stack : undefined });
          push({ type: "error", content: err.message });
          errored = true;
        }
      } finally {
        unsubscribe();
        done = true;
        wakeup.fn?.();
      }
    })();

    while (!done || queue.length > 0) {
      if (queue.length > 0) {
        yield queue.shift()!;
      } else {
        await new Promise<void>((r) => { wakeup.fn = r; });
        wakeup.fn = null;
      }
    }

    await runPromise;
    if (!errored) yield { type: "done", content: "" };
  }
}
