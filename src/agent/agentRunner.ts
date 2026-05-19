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
    mode?: "plan" | "act" | "yolo";
    modelOverride?: string;
  }): AsyncIterable<AgentEvent>;
  abort(clineSessionId: string): Promise<void>;
  stop(clineSessionId: string): Promise<void>;
}
