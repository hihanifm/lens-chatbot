/** One shell command from run_commands tool completion (see @cline/core output shape). */
export interface ToolCommandLine {
  query: string;
  success: boolean;
  error?: string;
}

export interface AgentEvent {
  type: "text" | "done" | "error" | "status" | "session_id" | "tool_error" | "tool_command";
  content: string;
  /** Populated when type is tool_command (run_commands per-command results). */
  toolCommands?: ToolCommandLine[];
}

export interface AgentRunner {
  analyze(input: {
    workspacePath: string;
    files: string[];
    question: string;
    clineSessionId?: string;
    mode?: "plan" | "act";
    modelOverride?: string;
    selectedSkillNames?: string[];
    /** Lucky-only: count of additional non-critical files left on disk + their root. */
    extras?: { count: number; attachmentsRoot: string };
    /** Lucky-only: skip reading agent_notes/ priors so the first run starts fresh. */
    skipPriorReports?: boolean;
    /** Prior conversation turns (oldest first), excluding the current question.
     *  Used by the CLI runner for transcript injection; cline-core ignores it. */
    priorMessages?: { role: "user" | "assistant"; content: string }[];
  }): AsyncIterable<AgentEvent>;
  abort(clineSessionId: string): Promise<void>;
  stop(clineSessionId: string): Promise<void>;
}
