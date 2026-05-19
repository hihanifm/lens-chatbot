import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import path from "path";
import os from "os";
import {
  snapshotAgentReportPaths,
  listNewAgentReports,
  toAgentReportFile,
} from "./agentReports.js";

async function makeWorkspaceWithNotes(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "lens-reports-"));
  await fs.mkdir(path.join(dir, "agent_notes", "sub"), { recursive: true });
  await fs.writeFile(path.join(dir, "agent_notes", "old.md"), "# old\n");
  await fs.writeFile(path.join(dir, "agent_notes", "notes.json"), "{}");
  await fs.writeFile(path.join(dir, "agent_notes", "sub", "nested.md"), "# nested\n");
  return dir;
}

test("snapshotAgentReportPaths lists only agent_notes md files", async () => {
  const workspace = await makeWorkspaceWithNotes();
  try {
    const snap = await snapshotAgentReportPaths(workspace);
    assert.equal(snap.size, 2);
    assert.ok(snap.has("agent_notes/old.md"));
    assert.ok(snap.has("agent_notes/sub/nested.md"));
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test("listNewAgentReports returns md files not in snapshot", async () => {
  const workspace = await makeWorkspaceWithNotes();
  try {
    const before = await snapshotAgentReportPaths(workspace);
    await fs.writeFile(path.join(workspace, "agent_notes", "new-report.md"), "# new\n");
    const reports = await listNewAgentReports(workspace, before);
    assert.equal(reports.length, 1);
    assert.equal(reports[0].relativePath, "agent_notes/new-report.md");
    assert.equal(reports[0].name, "new-report.md");
    assert.ok(reports[0].size > 0);
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test("toAgentReportFile normalizes path separators", () => {
  const r = toAgentReportFile("agent_notes/foo.md", 42);
  assert.equal(r.relativePath, "agent_notes/foo.md");
  assert.equal(r.name, "foo.md");
  assert.equal(r.size, 42);
});
