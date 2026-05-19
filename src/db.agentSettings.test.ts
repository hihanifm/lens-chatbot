import test from "node:test";
import assert from "node:assert/strict";
import { resolveAgentSettings } from "./db.js";

test("resolveAgentSettings defaults when stored empty", () => {
  delete process.env.AGENT_MAX_ITERATIONS;
  delete process.env.SYSTEM_PROMPT_SOURCE;
  const resolved = resolveAgentSettings(undefined);
  assert.equal(resolved.maxIterations, 24);
  assert.equal(resolved.systemPromptSource, "lens");
});

test("resolveAgentSettings respects env fallbacks", () => {
  process.env.AGENT_MAX_ITERATIONS = "30";
  process.env.SYSTEM_PROMPT_SOURCE = "cline";
  const resolved = resolveAgentSettings(undefined);
  assert.equal(resolved.maxIterations, 30);
  assert.equal(resolved.systemPromptSource, "cline");
  delete process.env.AGENT_MAX_ITERATIONS;
  delete process.env.SYSTEM_PROMPT_SOURCE;
});

test("resolveAgentSettings merges partial stored over env", () => {
  process.env.AGENT_MAX_ITERATIONS = "30";
  process.env.SYSTEM_PROMPT_SOURCE = "cline";
  const resolved = resolveAgentSettings({ maxIterations: 12, systemPromptSource: "lens" });
  assert.equal(resolved.maxIterations, 12);
  assert.equal(resolved.systemPromptSource, "lens");
  delete process.env.AGENT_MAX_ITERATIONS;
  delete process.env.SYSTEM_PROMPT_SOURCE;
});

test("resolveAgentSettings partial stored keeps other defaults", () => {
  const resolved = resolveAgentSettings({ maxIterations: 48 });
  assert.equal(resolved.maxIterations, 48);
  assert.equal(resolved.systemPromptSource, "lens");
});
