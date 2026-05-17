export interface AgentEvent {
  type: "text" | "done" | "error" | "status" | "session_id";
  content: string;
}

export interface AgentRunner {
  analyze(input: {
    workspacePath: string;
    files: string[];
    question: string;
    clineSessionId?: string;
  }): AsyncIterable<AgentEvent>;
}
