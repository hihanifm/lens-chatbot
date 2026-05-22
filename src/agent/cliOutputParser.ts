import type { AgentEvent } from "./agentRunner.js";

/**
 * Parse one line of `cline --json` newline-delimited JSON output into AgentEvents.
 * cline 3.0.10 emits the ClineCore agent event stream:
 *   {type:"hook_event", hookEventName:"agent_start"|"agent_end", taskId, ...}
 *   {type:"agent_event", event:{type:"iteration_start"|"content_start"|"content_end"|"usage"|"done"|..., ...}}
 *   {type:"run_result", finishReason, text, ...}
 *   {type:"error", message}
 * `session_id` events carry the raw taskId (no engine prefix); the runner prefixes it.
 */
export function parseCliLine(line: string): AgentEvent[] {
  const trimmed = line.trim();
  if (!trimmed) return [];

  let obj: any;
  try {
    obj = JSON.parse(trimmed);
  } catch {
    // Not JSON — surface verbatim so nothing is silently swallowed.
    return [{ type: "status", content: `cli: ${trimmed.slice(0, 200)}` }];
  }

  if (obj.type === "error") {
    return [{ type: "error", content: typeof obj.message === "string" ? obj.message : "cline CLI reported an error" }];
  }

  if (obj.type === "hook_event") {
    const events: AgentEvent[] = [];
    if (obj.hookEventName === "agent_start" && typeof obj.taskId === "string" && obj.taskId) {
      events.push({ type: "session_id", content: obj.taskId });
    }
    events.push({ type: "status", content: `${obj.hookEventName ?? "hook"}` });
    return events;
  }

  if (obj.type === "agent_event" && obj.event) {
    return mapAgentEvent(obj.event);
  }

  // run_result is the final summary; the runner emits `done` on process close.
  if (obj.type === "run_result") return [];

  return [{ type: "status", content: `${obj.type}` }];
}

function mapAgentEvent(e: any): AgentEvent[] {
  switch (e.type) {
    case "iteration_start":
      return [{ type: "status", content: `iteration ${e.iteration}` }];
    case "content_start":
      // Streamed assistant text deltas — accumulate into the chat bubble.
      if (e.contentType === "text" && e.text) return [{ type: "text", content: e.text }];
      if (e.contentType === "tool")
        return [{ type: "status", content: `tool: ${e.toolName ?? "started"}` }];
      // reasoning deltas (one word per event) and other types — drop, too noisy.
      return [];
    case "content_end":
      if (e.contentType === "tool") {
        if (e.error)
          return [{ type: "tool_error", content: `tool failed: ${e.toolName ?? "unknown"} — ${e.error}` }];
        return [{ type: "status", content: `tool done: ${e.toolName ?? "unknown"}` }];
      }
      // text/reasoning content_end carry the full block — already streamed.
      return [];
    case "usage": {
      const inTok = e.totalInputTokens ?? e.inputTokens;
      const outTok = e.totalOutputTokens ?? e.outputTokens;
      const parts = [`tokens ↑${inTok} ↓${outTok}`];
      if (typeof e.totalCost === "number") parts.push(`cost $${e.totalCost.toFixed(4)}`);
      return [{ type: "status", content: parts.join(" | ") }];
    }
    case "notice":
      return e.message ? [{ type: "status", content: `notice: ${e.message}` }] : [];
    case "done":
      // Process close drives the AgentRunner `done`; only surface abnormal stops.
      return e.reason && e.reason !== "completed"
        ? [{ type: "status", content: `⚠ agent stopped: ${e.reason}` }]
        : [];
    case "iteration_end":
      return [];
    default:
      return [{ type: "status", content: `${e.type}` }];
  }
}
