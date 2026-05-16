import type { AgentEvent, AgentRunner } from "../src/agent/agentRunner.js";

export class StubAgentRunner implements AgentRunner {
  async *analyze(input: Parameters<AgentRunner["analyze"]>[0]): AsyncIterable<AgentEvent> {
    if (/\bls\b|list.{0,10}files/i.test(input.question)) {
      yield { type: "text", content: input.workspacePath };
    } else if (/analyze this/i.test(input.question)) {
      yield { type: "text", content: input.files.join("\n") };
    } else {
      yield { type: "text", content: "E2E mock analysis" };
    }
    yield { type: "done", content: "" };
  }
}
