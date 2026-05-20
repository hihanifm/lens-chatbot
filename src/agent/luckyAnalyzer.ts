import type { AgentRunner, AgentEvent } from "./agentRunner.js";
import { loadPrompt } from "../prompts/promptLoader.js";

/**
 * Frontmatter `name` of the RCA skill we preload for every Lucky run. Kept in
 * sync with skills/three-phase-rca.md. If renamed there, update here too — the
 * runner will emit a `selected skill not found` status event and continue
 * without preload (soft-fail; Lucky still runs with bare lucky.md).
 */
const LUCKY_PRELOAD_SKILL_NAME = "Three-Phase RCA";

export async function* runLucky(
  runner: AgentRunner,
  session: { workspace_path: string; selected_files: string[] },
  mode: "act" | "yolo" = "act",
  modelOverride?: string,
  extras?: { count: number; attachmentsRoot: string }
): AsyncIterable<AgentEvent> {
  yield { type: "status", content: `[Lucky:${mode}] Starting evidence-first root cause analysis...` };

  const luckyPrompt = await loadPrompt("lucky");

  for await (const event of runner.analyze({
    workspacePath: session.workspace_path,
    files: session.selected_files,
    question: luckyPrompt,
    mode,
    modelOverride,
    extras,
    selectedSkillName: LUCKY_PRELOAD_SKILL_NAME,
    skipPriorReports: true, // Lucky is ephemeral — always start fresh.
    // No clineSessionId → fresh ephemeral session
  })) {
    if (event.type === "session_id") continue; // don't persist lucky sessions to DB
    yield event;
    if (event.type === "done" || event.type === "error") break;
  }
}
