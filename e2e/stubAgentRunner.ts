import type { AgentEvent, AgentRunner } from "../src/agent/agentRunner.js";

export class StubAgentRunner implements AgentRunner {
  async *analyze(): AsyncIterable<AgentEvent> {
    yield { type: "text", content: "E2E mock analysis" };
    yield { type: "done", content: "" };
  }
}
