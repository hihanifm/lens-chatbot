export interface AgentEvent {
  type: "text" | "done" | "error" | "status" | "session_id" | "tool_error";
  content: string;
}

export interface AgentRunner {
  analyze(input: {
    workspacePath: string;
    files: string[];
    question: string;
    clineSessionId?: string;
    mode?: "plan" | "act";
  }): AsyncIterable<AgentEvent>;
  abort(clineSessionId: string): Promise<void>;
  stop(clineSessionId: string): Promise<void>;
}
