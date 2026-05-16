import type { AgentRunner, AgentEvent } from "./agentRunner.js";
import { ClineCoreAgentRunner } from "./clineCoreAgentRunner.js";
import { log } from "../logger.js";

export class ClineSdkAgentRunner implements AgentRunner {
  private readonly runner: AgentRunner;

  constructor() {
    this.runner = new ClineCoreAgentRunner();
    log.info("agent:runtime-selected", { runtime: "cline-core" });
  }

  analyze(input: Parameters<AgentRunner["analyze"]>[0]): AsyncIterable<AgentEvent> {
    return this.runner.analyze(input);
  }
}
