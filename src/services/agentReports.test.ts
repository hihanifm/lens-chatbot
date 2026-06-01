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
  await fs.mkdir(path.join(dir, "reports", "sub"), { recursive: true });
  await fs.writeFile(path.join(dir, "reports", "old.md"), "# old\n");
  await fs.writeFile(path.join(dir, "reports", "notes.json"), "{}");
  await fs.writeFile(path.join(dir, "reports", "sub", "nested.md"), "# nested\n");
  return dir;
}

test("snapshotAgentReportPaths lists only reports md files", async () => {
  const workspace = await makeWorkspaceWithNotes();
  try {
    const snap = await snapshotAgentReportPaths(workspace);
    assert.equal(snap.size, 2);
    assert.ok(snap.has("reports/old.md"));
    assert.ok(snap.has("reports/sub/nested.md"));
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test("listNewAgentReports returns md files not in snapshot", async () => {
  const workspace = await makeWorkspaceWithNotes();
  try {
    const before = await snapshotAgentReportPaths(workspace);
    await fs.writeFile(path.join(workspace, "reports", "new-report.md"), "# new\n");
    const reports = await listNewAgentReports(workspace, before);
    assert.equal(reports.length, 1);
    assert.equal(reports[0].relativePath, "reports/new-report.md");
    assert.equal(reports[0].name, "new-report.md");
    assert.ok(reports[0].size > 0);
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test("toAgentReportFile normalizes path separators", () => {
  const r = toAgentReportFile("reports/foo.md", 42);
  assert.equal(r.relativePath, "reports/foo.md");
  assert.equal(r.name, "foo.md");
  assert.equal(r.size, 42);
});
