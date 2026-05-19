import type { AgentRunner, AgentEvent } from "./agentRunner.js";
import { loadPrompt } from "../prompts/promptLoader.js";

export async function* runLucky(
  runner: AgentRunner,
  session: { workspace_path: string; selected_files: string[] },
  mode: "act" | "yolo" = "act",
  modelOverride?: string
): AsyncIterable<AgentEvent> {
  yield { type: "status", content: `[Lucky:${mode}] Starting evidence-first root cause analysis...` };

  const luckyPrompt = await loadPrompt("lucky");

  for await (const event of runner.analyze({
    workspacePath: session.workspace_path,
    files: session.selected_files,
    question: luckyPrompt,
    mode,
    modelOverride,
    // No clineSessionId → fresh ephemeral session
  })) {
    if (event.type === "session_id") continue; // don't persist lucky sessions to DB
    yield event;
    if (event.type === "done" || event.type === "error") break;
  }
}
