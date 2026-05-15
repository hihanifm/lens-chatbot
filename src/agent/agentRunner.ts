export interface AgentEvent {
  type: "text" | "done" | "error";
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
