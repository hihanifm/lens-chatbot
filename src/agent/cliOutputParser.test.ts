import test from "node:test";
import assert from "node:assert/strict";
import { parseCliLine } from "./cliOutputParser.js";

test("blank line yields nothing", () => {
  assert.deepEqual(parseCliLine(""), []);
  assert.deepEqual(parseCliLine("   "), []);
});

test("hook_event agent_start yields session_id then status", () => {
  const events = parseCliLine(
    '{"type":"hook_event","hookEventName":"agent_start","agentId":"a1","taskId":"conv_99","parentAgentId":null}'
  );
  assert.equal(events.length, 2);
  assert.deepEqual(events[0], { type: "session_id", content: "conv_99" });
  assert.equal(events[1].type, "status");
});

test("hook_event agent_end yields status only (no session_id)", () => {
  const events = parseCliLine('{"type":"hook_event","hookEventName":"agent_end","taskId":"conv_99"}');
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "status");
});

test("agent_event content_start text yields text delta", () => {
  const events = parseCliLine('{"type":"agent_event","event":{"type":"content_start","contentType":"text","text":"ban"}}');
  assert.deepEqual(events, [{ type: "text", content: "ban" }]);
});

test("agent_event content_start reasoning is dropped (too noisy)", () => {
  assert.deepEqual(
    parseCliLine('{"type":"agent_event","event":{"type":"content_start","contentType":"reasoning","reasoning":"The"}}'),
    []
  );
});

test("agent_event content_end text is dropped (already streamed)", () => {
  assert.deepEqual(
    parseCliLine('{"type":"agent_event","event":{"type":"content_end","contentType":"text","text":"banana"}}'),
    []
  );
});

test("agent_event tool error yields tool_error", () => {
  const events = parseCliLine(
    '{"type":"agent_event","event":{"type":"content_end","contentType":"tool","toolName":"read_file","error":"nope"}}'
  );
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "tool_error");
});

test("agent_event iteration_start and usage yield status", () => {
  assert.equal(parseCliLine('{"type":"agent_event","event":{"type":"iteration_start","iteration":1}}')[0].type, "status");
  assert.equal(
    parseCliLine('{"type":"agent_event","event":{"type":"usage","totalInputTokens":5,"totalOutputTokens":2}}')[0].type,
    "status"
  );
});

test("agent_event done completed yields nothing", () => {
  assert.deepEqual(
    parseCliLine('{"type":"agent_event","event":{"type":"done","reason":"completed","text":"banana"}}'),
    []
  );
});

test("error type yields error event", () => {
  const events = parseCliLine('{"type":"error","message":"boom"}');
  assert.deepEqual(events, [{ type: "error", content: "boom" }]);
});

test("run_result yields nothing (done driven by process close)", () => {
  assert.deepEqual(parseCliLine('{"type":"run_result","finishReason":"completed","text":"banana"}'), []);
});

test("malformed JSON yields status, never throws", () => {
  const events = parseCliLine("not json at all");
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "status");
});
