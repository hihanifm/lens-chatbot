import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { resolveWorkspaceFilePath } from "./workspacePaths.js";

async function makeWorkspace(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "lens-ws-paths-"));
  await fs.mkdir(path.join(dir, "agent_notes"), { recursive: true });
  await fs.writeFile(path.join(dir, "agent_notes", "report.md"), "# report\n");
  return dir;
}

test("resolveWorkspaceFilePath resolves relative agent_notes path", async () => {
  const workspace = await makeWorkspace();
  try {
    const resolved = resolveWorkspaceFilePath(workspace, "agent_notes/report.md");
    assert.ok(resolved);
    assert.equal(resolved, path.join(workspace, "agent_notes", "report.md"));
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test("resolveWorkspaceFilePath resolves absolute path inside workspace", async () => {
  const workspace = await makeWorkspace();
  try {
    const abs = path.join(workspace, "agent_notes", "report.md");
    const resolved = resolveWorkspaceFilePath(workspace, abs);
    assert.equal(resolved, path.resolve(abs));
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test("resolveWorkspaceFilePath normalizes backslashes", async () => {
  const workspace = await makeWorkspace();
  try {
    const resolved = resolveWorkspaceFilePath(workspace, "agent_notes\\report.md");
    assert.ok(resolved);
    assert.equal(resolved, path.join(workspace, "agent_notes", "report.md"));
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test("resolveWorkspaceFilePath rejects path outside workspace", async () => {
  const workspace = await makeWorkspace();
  try {
    assert.equal(resolveWorkspaceFilePath(workspace, "../../../etc/passwd"), null);
    assert.equal(resolveWorkspaceFilePath(workspace, "/etc/passwd"), null);
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});
