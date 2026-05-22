import test from "node:test";
import assert from "node:assert/strict";
import { resolveAgentSettings, packSessionId, unpackSessionId } from "./db.js";

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

test("resolveAgentSettings defaults engine to cline-core", () => {
  delete process.env.AGENT_ENGINE;
  const resolved = resolveAgentSettings(undefined);
  assert.equal(resolved.engine, "cline-core");
  assert.equal(resolved.cliCommand, "cline");
});

test("resolveAgentSettings respects AGENT_ENGINE env", () => {
  process.env.AGENT_ENGINE = "cli";
  assert.equal(resolveAgentSettings(undefined).engine, "cli");
  delete process.env.AGENT_ENGINE;
});

test("resolveAgentSettings defaults cliInjectHistory to true", () => {
  assert.equal(resolveAgentSettings(undefined).cliInjectHistory, true);
  assert.equal(resolveAgentSettings({ cliInjectHistory: false }).cliInjectHistory, false);
});

test("packSessionId / unpackSessionId round-trip", () => {
  assert.equal(packSessionId("cli", "task9"), "cli:task9");
  assert.deepEqual(unpackSessionId("cli:task9"), { engine: "cli", id: "task9" });
  assert.deepEqual(unpackSessionId("cline-core:uuid-1"), { engine: "cline-core", id: "uuid-1" });
});

test("unpackSessionId treats unprefixed legacy ids as cline-core", () => {
  assert.deepEqual(unpackSessionId("legacy-uuid"), { engine: "cline-core", id: "legacy-uuid" });
});
