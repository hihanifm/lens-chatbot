import test from "node:test";
import assert from "node:assert/strict";
import { DispatchingAgentRunner } from "./dispatchingAgentRunner.js";
import type { AgentRunner, AgentEvent } from "./agentRunner.js";

/** Records which method was called with which session id. */
function stubRunner(tag: string, calls: string[]): AgentRunner {
  return {
    // eslint-disable-next-line require-yield
    async *analyze(input): AsyncIterable<AgentEvent> {
      calls.push(`${tag}:analyze:${input.clineSessionId ?? "new"}`);
    },
    async abort(id) {
      calls.push(`${tag}:abort:${id}`);
    },
    async stop(id) {
      calls.push(`${tag}:stop:${id}`);
    },
  };
}

async function drain(it: AsyncIterable<AgentEvent>): Promise<void> {
  for await (const _ of it) { /* consume */ }
}

test("follow-up routes by session-id prefix and strips it", async () => {
  const calls: string[] = [];
  const d = new DispatchingAgentRunner({
    "cline-core": stubRunner("core", calls),
    cli: stubRunner("cli", calls),
  });
  await drain(d.analyze({ workspacePath: "/w", files: [], question: "q", clineSessionId: "cli:task9" }));
  assert.deepEqual(calls, ["cli:analyze:task9"]);
});

test("cline-core follow-up unpacks prefixed id", async () => {
  const calls: string[] = [];
  const d = new DispatchingAgentRunner({
    "cline-core": stubRunner("core", calls),
    cli: stubRunner("cli", calls),
  });
  await drain(d.analyze({ workspacePath: "/w", files: [], question: "q", clineSessionId: "cline-core:uuid-1" }));
  assert.deepEqual(calls, ["core:analyze:uuid-1"]);
});

test("abort routes to the owning engine", async () => {
  const calls: string[] = [];
  const d = new DispatchingAgentRunner({
    "cline-core": stubRunner("core", calls),
    cli: stubRunner("cli", calls),
  });
  await d.abort("cli:task9");
  await d.stop("cline-core:uuid-1");
  assert.deepEqual(calls, ["cli:abort:task9", "core:stop:uuid-1"]);
});

test("unprefixed legacy id routes to cline-core", async () => {
  const calls: string[] = [];
  const d = new DispatchingAgentRunner({
    "cline-core": stubRunner("core", calls),
    cli: stubRunner("cli", calls),
  });
  await d.abort("legacy-uuid");
  assert.deepEqual(calls, ["core:abort:legacy-uuid"]);
});
