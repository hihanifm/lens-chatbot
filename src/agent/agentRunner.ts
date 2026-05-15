export interface AgentEvent {
  type: "text" | "done" | "error" | "status";
  content: string;
}

export interface AgentRunner {
  analyze(input: {
    workspacePath: string;
    files: string[];
    question: string;
    conversationSummary?: string;
  }): AsyncIterable<AgentEvent>;
}
