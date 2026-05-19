import { ClineCore, DefaultToolNames, SessionSource, getClineDefaultSystemPrompt } from "@cline/sdk";
import type { CoreSessionEvent } from "@cline/sdk";
import type { AgentEvent, AgentRunner, ToolCommandLine } from "./agentRunner.js";
import { buildPrompt, buildFollowUpPrompt, buildSystemRules, loadAgentSkills, getWikiRootIndexPath } from "./agentPrompt.js";
import { loadPrompt } from "../prompts/promptLoader.js";
import { settings } from "../db.js";
import { log } from "../logger.js";
import { isLlmSanitizeEnabled, sanitizeForLlm } from "../services/llmSanitize.js";
import { egressContext } from "../services/httpEgressLogger.js";
import fs from "fs/promises";
import path from "path";

function formatLogTimestamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}-${String(d.getMilliseconds()).padStart(3, "0")}`;
}

function formatBugContext(bug: any): string {
  const lines: string[] = [
    `## Bug Tracker Context`,
    `**ID:** ${bug.id}  **Title:** ${bug.title}`,
    `**State:** ${bug.state}  **Module:** ${bug.module}  **Owner:** ${bug.owner ?? "—"}  **Author:** ${bug.author ?? "—"}`,
    `**Created:** ${bug.created_at}  **Updated:** ${bug.updated_at}`,
    ``,
    `Log files are not in the workspace until you download them from the Files panel. Analysis without downloads is limited to the bug description and comments below.`,
    ``,
    `**Description:**`,
    bug.description || "(none)",
  ];

  const comments: any[] = [...(bug.comments ?? [])].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  if (comments.length > 0) {
    lines.push(``, `**Comments (chronological):**`);
    for (const c of comments) {
      lines.push(``, `> **${c.author}** (${c.created_at})`, `> ${c.body}`);
    }
  }

  return lines.join("\n");
}

async function filterExistingPaths(paths: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const p of paths) {
    try {
      await fs.access(p);
      out.push(p);
    } catch {
      /* path missing — excluded from prompt context */
    }
  }
  return out;
}

/** Parses run_commands tool output: array of { query, success, error? }. */
function parseRunCommandsOutput(output: unknown): ToolCommandLine[] | null {
  if (!Array.isArray(output) || output.length === 0) return null;
  const rows: ToolCommandLine[] = [];
  for (const item of output) {
    if (!item || typeof item !== "object") return null;
    const o = item as Record<string, unknown>;
    if (typeof o.query !== "string" || typeof o.success !== "boolean") return null;
    const row: ToolCommandLine = { query: o.query, success: o.success };
    if (typeof o.error === "string" && o.error.length > 0) row.error = o.error;
    rows.push(row);
  }
  return rows;
}

function summarizeToolInput(toolName: string | undefined, input: unknown): string {
  if (!input || typeof input !== "object") return "";
  const inp = input as Record<string, unknown>;
  if (toolName === "run_commands") {
    const cmds = inp.commands;
    if (Array.isArray(cmds) && cmds.length > 0) {
      const joined = cmds.join(" && ");
      return joined.length > 120 ? joined.slice(0, 120) + "…" : joined;
    }
  } else if (toolName === "read_files") {
    const files = inp.files;
    if (Array.isArray(files) && files.length > 0) {
      return files.map((f: any) => {
        const name = path.basename(String(f.path ?? ""));
        const range = f.start_line != null ? `:${f.start_line}-${f.end_line ?? ""}` : "";
        return `${name}${range}`;
      }).join(", ");
    }
  }
  return "";
}

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
  // Build suffix→comment index first, then do one O(n) pass over files
  const suffixIndex = new Map<string, string>();
  for (const comment of bug.comments ?? []) {
    for (const att of comment.attachments ?? []) {
      suffixIndex.set(`/${att.name}`, comment.body);
      suffixIndex.set(`/${path.basename(att.name, ".zip")}/`, comment.body);
    }
  }
  for (const f of files) {
    for (const [suffix, body] of suffixIndex) {
      if (f.endsWith(suffix) || f.includes(suffix)) {
        map[f] = body;
        break;
      }
    }
  }
  return map;
}

function messageContentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (content == null) return "";
  return JSON.stringify(content);
}

async function logSessionMessages(
  cline: ClineCore,
  clineSessionId: string,
  workspacePath: string,
  push: (event: AgentEvent) => void,
): Promise<void> {
  const messages = await cline.readMessages(clineSessionId);
  const summary = messages.map((m: any, i: number) => {
    const text = messageContentText(m.content);
    return {
      index: i,
      role: m.role,
      contentLength: text.length,
      contentPreview: text.slice(0, 200),
      hasBugTrackerContext: text.includes("## Bug Tracker Context"),
    };
  });
  const logPath = path.join(
    workspacePath,
    "agent_notes",
    `session-messages-${formatLogTimestamp()}.json`,
  );
  await fs.mkdir(path.dirname(logPath), { recursive: true });
  await fs.writeFile(
    logPath,
    JSON.stringify({ clineSessionId, messageCount: messages.length, messages: summary }, null, 2),
    "utf8",
  );
  const roles = summary.reduce((acc: Record<string, number>, m: { role: string }) => {
    acc[m.role] = (acc[m.role] ?? 0) + 1;
    return acc;
  }, {});
  const roleSummary = Object.entries(roles)
    .map(([r, n]) => `${n} ${r}`)
    .join(", ");
  push({
    type: "status",
    content: `session history: ${messages.length} messages (${roleSummary}) → ${path.basename(logPath)}`,
  });
}

function resultText(result: any): string {
  if (result && !result.text) {
    log.debug("agent:result-fields", { keys: Object.keys(result) });
  }
  return result?.text ?? result?.outputText ?? result?.result?.text ?? result?.result?.outputText ?? "";
}

let clineInstance: ClineCore | null = null;

async function getCline(): Promise<ClineCore> {
  if (!clineInstance) {
    clineInstance = await ClineCore.create({ backendMode: "local", clientName: "lens-chatbot" });
  }
  return clineInstance;
}

/** Lens UI provider ids → Cline built-in provider ids (@cline/llms BUILT_IN_PROVIDER). */
function toClineProviderId(provider: ReturnType<typeof settings.getLlmConfig>["provider"]): string {
  if (provider === "openai") return "openai-native";
  // "openai-compatible" is a protocol family in Cline, not a provider id; ollama uses that family + custom baseUrl.
  if (provider === "openai-compatible" || provider === "ollama") return "ollama";
  return provider;
}

function buildSessionConfig(input: Parameters<AgentRunner["analyze"]>[0], llmCfg: ReturnType<typeof settings.getLlmConfig>, enableLlmLog: boolean, systemPrompt: string) {
  return {
    providerId: toClineProviderId(llmCfg.provider) as any,
    modelId: llmCfg.model,
    apiKey: llmCfg.apiKey || "none",
    baseUrl: llmCfg.provider === "openai" ? "https://api.openai.com/v1" : (llmCfg.baseUrl ?? ""),
    cwd: input.workspacePath,
    workspaceRoot: input.workspacePath,
    mode: ((input.mode ?? "act") === "yolo" ? "act" : (input.mode ?? "act")) as "plan" | "act",
    systemPrompt,
    maxIterations: settings.getAgentMaxIterations(),
    enableTools: true,
    enableSpawnAgent: false,
    enableAgentTeams: false,
    disableMcpSettingsTools: true,
    checkpoint: { enabled: false },
    hooks: enableLlmLog ? {
      beforeModel: async (context: any) => {
        const iter = context.snapshot?.iteration ?? 0;
        const logPath = path.join(
          input.workspacePath,
          "agent_notes",
          `llm-request-${formatLogTimestamp()}-iter${iter}.json`
        );
        const payload = {
          systemPromptLength: context.request.systemPrompt?.length ?? 0,
          systemPrompt: context.request.systemPrompt,
          messageCount: context.request.messages.length,
          messages: context.request.messages,
          latestUserMessage: context.request.messages.at(-1),
          toolCount: context.request.tools.length,
          toolNames: context.request.tools.map((t: any) => t.name),
          options: context.request.options ?? {},
        };
        await fs.mkdir(path.dirname(logPath), { recursive: true });
        await fs.writeFile(logPath, JSON.stringify(payload, null, 2), "utf8")
          .catch((err: any) => log.warn("agent:llm-request-log-failed", { error: err.message }));
        return undefined;
      },
    } : undefined,
    toolPolicies: {
      [DefaultToolNames.APPLY_PATCH]: { enabled: false },
      [DefaultToolNames.EDITOR]: { enabled: false },
      [DefaultToolNames.FETCH_WEB_CONTENT]: { enabled: false },
      [DefaultToolNames.SUBMIT_AND_EXIT]: { enabled: input.mode === "yolo" },
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
    egressContext.enterWith({ workspacePath: input.workspacePath, sessionId: input.clineSessionId });
    const flags = settings.getFeatureFlags();
    const { systemPromptSource } = settings.getAgentSettings();
    const existingFiles = await filterExistingPaths(input.files);
    const [skills, wikiRootIndex, fileComments, rules, environmentContext, bugJson] = await Promise.all([
      loadAgentSkills(),
      flags.wiki ? getWikiRootIndexPath() : Promise.resolve(null),
      buildFileCommentMap(input.workspacePath, existingFiles),
      buildSystemRules(),
      loadPrompt("environment"),
      fs.readFile(path.join(input.workspacePath, "bug.json"), "utf8").then(JSON.parse).catch(() => null),
    ]);
    const baseTemplate =
      systemPromptSource === "lens"
        ? await loadPrompt(input.mode === "yolo" ? "base-yolo" : "base")
        : undefined;
    const systemPrompt = getClineDefaultSystemPrompt({
      rootPath: input.workspacePath,
      workspaceRoot: input.workspacePath,
      cwd: input.workspacePath,
      mode: (input.mode ?? "act"),
      rules,
      platform: process.platform,
      ide: "Terminal Shell",
      ...(baseTemplate !== undefined ? { overridePrompt: baseTemplate } : {}),
    });
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
    const baseLlmCfg = settings.getLlmConfig();
    const llmCfg = input.modelOverride
      ? { ...baseLlmCfg, model: input.modelOverride }
      : baseLlmCfg;
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

    let questionForLlm = input.question;
    let fileCommentsForLlm = fileComments;
    let bugContextForLlm: string | null = bugJson ? formatBugContext(bugJson) : null;
    let sanitizeReplacementTotal = 0;
    if (isLlmSanitizeEnabled()) {
      const qRes = sanitizeForLlm(input.question);
      questionForLlm = qRes.text;
      sanitizeReplacementTotal += qRes.replacementCount;
      fileCommentsForLlm = {};
      for (const [k, v] of Object.entries(fileComments)) {
        const r = sanitizeForLlm(v);
        fileCommentsForLlm[k] = r.text;
        sanitizeReplacementTotal += r.replacementCount;
      }
      if (bugContextForLlm) {
        const r = sanitizeForLlm(bugContextForLlm);
        bugContextForLlm = r.text;
        sanitizeReplacementTotal += r.replacementCount;
      }
    }

    const logQuestion = isLlmSanitizeEnabled() ? questionForLlm : input.question;
    log.info("agent:start", { runtime: "cline-core", model: llmCfg.model, files: existingFiles.length, skills: skills.length, question: logQuestion.slice(0, 60), reuse: !!input.clineSessionId });
    push({ type: "status", content: `provider: ${llmCfg.provider} | model: ${llmCfg.model} | runtime: cline-core | files: ${existingFiles.length}` });
    if (skills.length > 0) {
      push({ type: "status", content: `skills: ${skills.map((s) => s.name).join(", ")}` });
    }
    if (sanitizeReplacementTotal > 0) {
      push({ type: "status", content: `PII patterns redacted in prompt (${sanitizeReplacementTotal} substitutions)` });
    }

    const selectedSkill = input.selectedSkillName
      ? skills.find((s) => s.name === input.selectedSkillName)
      : undefined;
    if (input.selectedSkillName && !selectedSkill) {
      log.warn("agent:selected-skill-not-found", { name: input.selectedSkillName });
    } else if (selectedSkill) {
      push({ type: "status", content: `selected skill: ${selectedSkill.name}` });
    }
    const fullPrompt = await buildPrompt({
      ...input,
      files: existingFiles,
      question: questionForLlm,
      fileComments: fileCommentsForLlm,
      skills,
      wikiRootIndex,
      priorReports,
      environmentContext,
      selectedSkill,
    });
    const followUpPrompt = await buildFollowUpPrompt({
      workspacePath: input.workspacePath,
      files: existingFiles,
      question: questionForLlm,
      fileComments: fileCommentsForLlm,
      selectedSkill,
    });
    const startPrompt = bugContextForLlm ? `${bugContextForLlm}\n\n${fullPrompt}` : fullPrompt;
    const isFollowUp = !!input.clineSessionId;
    const sentPrompt = isFollowUp ? followUpPrompt : startPrompt;
    if (flags.promptLogging) {
      const promptLogPath = path.join(input.workspacePath, "agent_notes", `prompt-${formatLogTimestamp()}.txt`);
      await fs.mkdir(path.dirname(promptLogPath), { recursive: true });
      await fs.writeFile(promptLogPath, sentPrompt, "utf8").catch((err) => log.warn("agent:prompt-log-failed", { error: err.message }));
    }
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
            } else if (agentEvent.type === "iteration_start") {
              push({ type: "status", content: `iteration ${agentEvent.iteration}` });
            } else if (agentEvent.type === "content_start" && agentEvent.contentType === "tool") {
              log.debug("agent:tool-start", { tool: agentEvent.toolName, sessionId: clineSessionId });
              const detail = summarizeToolInput(agentEvent.toolName, agentEvent.input);
              push({ type: "status", content: `tool: ${agentEvent.toolName ?? "started"}${detail ? ` · ${detail}` : ""}` });
              if (agentEvent.toolName === DefaultToolNames.SUBMIT_AND_EXIT) {
                const summary = typeof agentEvent.input === "string"
                  ? agentEvent.input
                  : (agentEvent.input?.summary ?? agentEvent.input?.result ?? JSON.stringify(agentEvent.input));
                if (summary) {
                  streamedText += summary;
                  push({ type: "text", content: summary });
                }
              }
            } else if (agentEvent.type === "content_end" && agentEvent.contentType === "tool") {
              if (agentEvent.error) {
                log.warn("agent:tool-error", { tool: agentEvent.toolName, error: agentEvent.error, sessionId: clineSessionId });
                push({ type: "tool_error", content: `tool failed: ${agentEvent.toolName ?? "unknown"} — ${agentEvent.error}` });
              } else if (agentEvent.toolName === "run_commands") {
                const perCmd = parseRunCommandsOutput(agentEvent.output);
                if (perCmd) {
                  push({ type: "tool_command", content: "", toolCommands: perCmd });
                } else {
                  log.debug("agent:tool-done", { tool: agentEvent.toolName, sessionId: clineSessionId });
                  const dur = agentEvent.durationMs != null ? ` · ${(agentEvent.durationMs / 1000).toFixed(1)}s` : "";
                  push({ type: "status", content: `tool done: ${agentEvent.toolName ?? "unknown"}${dur}` });
                }
              } else {
                log.debug("agent:tool-done", { tool: agentEvent.toolName, sessionId: clineSessionId });
                const dur = agentEvent.durationMs != null ? ` · ${(agentEvent.durationMs / 1000).toFixed(1)}s` : "";
                push({ type: "status", content: `tool done: ${agentEvent.toolName ?? "unknown"}${dur}` });
              }
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
          const result = await cline.send({ sessionId: clineSessionId, prompt: followUpPrompt });
          const text = resultText(result);
          if (text && !streamedText.includes(text)) push({ type: "text", content: text });
        } else {
          // First turn — subscribe before start() so streaming events are not missed
          unsubscribe = setupSubscription();
          const startResult = await cline.start({
            source: SessionSource.API,
            interactive: false,
            prompt: startPrompt,
            config: buildSessionConfig(input, llmCfg, flags.llmRequestLogging, systemPrompt),
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
            prompt: startPrompt,
            config: buildSessionConfig(input, llmCfg, flags.llmRequestLogging, systemPrompt),
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
        if (flags.llmRequestLogging && clineSessionId) {
          try {
            await logSessionMessages(cline, clineSessionId, input.workspacePath, push);
          } catch (err: any) {
            log.warn("agent:session-messages-log-failed", { error: err.message });
          }
        }
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
