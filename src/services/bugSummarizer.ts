import fs from "fs/promises";
import path from "path";
import { SessionSource, getClineDefaultSystemPrompt } from "@cline/sdk";
import { getCline } from "../agent/clineCoreAgentRunner.js";
import { buildSystemRules } from "../agent/agentPrompt.js";
import { loadPrompt, renderPrompt } from "../prompts/promptLoader.js";
import { settings } from "../db.js";
import { log } from "../logger.js";

const MAX_COMMENTS = 10;
const MARKER = "generated: llm";

function toClineProviderId(provider: ReturnType<typeof settings.getLlmConfig>["provider"]): string {
  if (provider === "openai") return "openai-native";
  if (provider === "openai-compatible" || provider === "ollama") return "ollama";
  return provider;
}

function formatComments(bug: any): string {
  const all = [...(bug.comments ?? [])].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  const shown = all.length > MAX_COMMENTS ? all.slice(-MAX_COMMENTS) : all;
  if (shown.length === 0) return "(none)";
  return shown
    .map((c: any) => `> **${c.author ?? "?"}** (${c.created_at ?? "?"})\n> ${c.body ?? ""}`)
    .join("\n\n");
}

function resultText(result: any): string {
  return result?.text ?? result?.outputText ?? result?.result?.text ?? result?.result?.outputText ?? "";
}

export interface SynthesizeOpts {
  force?: boolean;
}

export async function synthesizeBugSummary(
  workspacePath: string,
  bug?: any,
  opts: SynthesizeOpts = {},
): Promise<void> {
  const summaryPath = path.join(workspacePath, "bug_summary.md");

  if (!opts.force) {
    try {
      const head = (await fs.readFile(summaryPath, "utf8")).slice(0, 200);
      if (head.includes(MARKER)) {
        log.debug("bugSummary:skip", { workspacePath, reason: "marker-present" });
        return;
      }
    } catch { /* missing — proceed */ }
  }

  let bugData = bug;
  if (!bugData) {
    try {
      bugData = JSON.parse(await fs.readFile(path.join(workspacePath, "bug.json"), "utf8"));
    } catch (err: any) {
      log.warn("bugSummary:no-bug-json", { workspacePath, error: err.message });
      return;
    }
  }

  const llmCfg = settings.getLlmConfig();
  log.info("bugSummary:start", { workspacePath, bugId: bugData.id, model: llmCfg.model });

  try {
    const template = await loadPrompt("bug-summary");
    const prompt = renderPrompt(template, {
      bugId: String(bugData.id ?? "?"),
      title: String(bugData.title ?? "?"),
      description: String(bugData.description ?? "(none)"),
      comments: formatComments(bugData),
    });

    const { systemPromptSource } = settings.getAgentSettings();
    const rules = await buildSystemRules();
    const baseTemplate = systemPromptSource === "lens" ? await loadPrompt("base") : undefined;
    const systemPrompt = getClineDefaultSystemPrompt({
      rootPath: workspacePath,
      workspaceRoot: workspacePath,
      cwd: workspacePath,
      mode: "act",
      rules,
      platform: process.platform,
      ide: "Terminal Shell",
      ...(baseTemplate !== undefined ? { overridePrompt: baseTemplate } : {}),
    });

    const cline = await getCline();
    const startResult = await cline.start({
      source: SessionSource.API,
      interactive: false,
      prompt,
      config: {
        providerId: toClineProviderId(llmCfg.provider) as any,
        modelId: llmCfg.model,
        apiKey: llmCfg.apiKey || "none",
        baseUrl: llmCfg.provider === "openai" ? "https://api.openai.com/v1" : (llmCfg.baseUrl ?? ""),
        cwd: workspacePath,
        workspaceRoot: workspacePath,
        mode: "act",
        systemPrompt,
        maxIterations: 1,
        enableTools: false,
        enableSpawnAgent: false,
        enableAgentTeams: false,
        disableMcpSettingsTools: true,
        checkpoint: { enabled: false },
      },
    });

    const text = resultText(startResult.result).trim();
    if (!text) {
      log.warn("bugSummary:empty-result", { workspacePath, bugId: bugData.id });
      return;
    }

    const frontmatter = [
      "---",
      "generated: llm",
      `model: ${llmCfg.model}`,
      `created_at: ${new Date().toISOString()}`,
      "---",
      "",
    ].join("\n");
    await fs.writeFile(summaryPath, frontmatter + text + "\n", "utf8");
    log.info("bugSummary:done", { workspacePath, bugId: bugData.id, sessionId: startResult.sessionId, bytes: text.length });

    if (startResult.sessionId) {
      cline.stop(startResult.sessionId).catch((err: any) =>
        log.debug("bugSummary:stop-error", { sessionId: startResult.sessionId, error: err.message })
      );
    }
  } catch (err: any) {
    log.warn("bugSummary:error", { workspacePath, bugId: bugData?.id, error: err.message });
  }
}
