import { test } from "node:test";
import assert from "node:assert/strict";
import { isValidBugId } from "./app.js";

test("isValidBugId accepts typical tracker ids", () => {
  assert.equal(isValidBugId("BUG-123"), true);
  assert.equal(isValidBugId("PROJ_42"), true);
  assert.equal(isValidBugId("ADHOC-1700000000000"), true);
  assert.equal(isValidBugId("v1.2.3-rc.1"), true);
});

test("isValidBugId rejects path-traversal payloads", () => {
  assert.equal(isValidBugId(".."), false);
  assert.equal(isValidBugId("../etc"), false);
  assert.equal(isValidBugId("foo/bar"), false);
  assert.equal(isValidBugId("foo\\bar"), false);
  assert.equal(isValidBugId("/abs"), false);
});

test("isValidBugId rejects empty, oversized, and non-string", () => {
  assert.equal(isValidBugId(""), false);
  assert.equal(isValidBugId("a".repeat(65)), false);
  assert.equal(isValidBugId(undefined), false);
  assert.equal(isValidBugId(null), false);
  assert.equal(isValidBugId(123), false);
});
