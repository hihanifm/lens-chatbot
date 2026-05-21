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
  modelOverride?: string,
  extras?: { count: number; attachmentsRoot: string }
): AsyncIterable<AgentEvent> {
  const luckyPrompt = await loadPrompt("lucky");

  // No clineSessionId → always a fresh Cline session. The route persists the
  // resulting session_id so the user can resume this thread via /analyze.
  for await (const event of runner.analyze({
    workspacePath: session.workspace_path,
    files: session.selected_files,
    question: luckyPrompt,
    mode: "act",
    modelOverride,
    extras,
    selectedSkillName: LUCKY_PRELOAD_SKILL_NAME,
    skipPriorReports: true, // First Lucky turn always starts a fresh RCA.
  })) {
    yield event;
    if (event.type === "done" || event.type === "error") break;
  }
}
