import type { AgentEvent, AgentRunner } from "../src/agent/agentRunner.js";

export class StubAgentRunner implements AgentRunner {
  async abort(_clineSessionId: string): Promise<void> {}
  async stop(_clineSessionId: string): Promise<void> {}

  async *analyze(input: Parameters<AgentRunner["analyze"]>[0]): AsyncIterable<AgentEvent> {
    if (input.question.includes("__tool_command_test__")) {
      yield {
        type: "tool_command",
        content: "",
        toolCommands: [
          { query: "echo ok", success: true },
          { query: "exit 1", success: false, error: "Command failed: exit 1" },
        ],
      };
      yield { type: "text", content: "E2E mock analysis" };
    } else if (/\bls\b|list.{0,10}files/i.test(input.question)) {
      yield { type: "text", content: input.workspacePath };
    } else if (/analyze this/i.test(input.question)) {
      yield { type: "text", content: input.files.join("\n") };
    } else {
      yield { type: "text", content: "E2E mock analysis" };
    }
    yield { type: "done", content: "" };
  }
}
