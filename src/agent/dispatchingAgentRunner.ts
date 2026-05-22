import type { AgentRunner, AgentEvent } from "./agentRunner.js";
import { settings, unpackSessionId, type AgentEngine } from "../db.js";

/**
 * AgentRunner that delegates to a concrete runner chosen at call time.
 * - New session: uses the current global engine setting.
 * - Follow-up: the engine is unpacked from the stored cline_session_id so the
 *   turn always goes to the runner that owns the session.
 * The engine prefix is stripped before delegating; concrete runners receive a
 * raw session id.
 */
export class DispatchingAgentRunner implements AgentRunner {
  constructor(private readonly runners: Record<AgentEngine, AgentRunner>) {}

  analyze(input: Parameters<AgentRunner["analyze"]>[0]): AsyncIterable<AgentEvent> {
    let engine: AgentEngine;
    let clineSessionId = input.clineSessionId;
    if (clineSessionId) {
      const unpacked = unpackSessionId(clineSessionId);
      engine = unpacked.engine;
      clineSessionId = unpacked.id;
    } else {
      engine = settings.getAgentEngine();
    }
    return this.runners[engine].analyze({ ...input, clineSessionId });
  }

  async abort(clineSessionId: string): Promise<void> {
    const { engine, id } = unpackSessionId(clineSessionId);
    await this.runners[engine].abort(id);
  }

  async stop(clineSessionId: string): Promise<void> {
    const { engine, id } = unpackSessionId(clineSessionId);
    await this.runners[engine].stop(id);
  }
}
