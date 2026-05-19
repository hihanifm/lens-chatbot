import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { buildVirtualTree, countInternalFiles } from "./workspaceExplorer.js";

async function makeWorkspace(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "lens-ws-"));
  await fs.writeFile(
    path.join(dir, "bug.json"),
    JSON.stringify({ id: "BUG-1", attachments: [], comments: [] }),
  );
  await fs.writeFile(path.join(dir, "bug_summary.md"), "# summary\n");
  await fs.mkdir(path.join(dir, "attachments"), { recursive: true });
  await fs.writeFile(path.join(dir, "attachments", "skip-me.txt"), "not in internals\n");
  await fs.mkdir(path.join(dir, "agent_notes", "sub"), { recursive: true });
  await fs.writeFile(path.join(dir, "agent_notes", "a.json"), "{}");
  await fs.writeFile(path.join(dir, "agent_notes", "sub", "b.json"), "{}");
  await fs.writeFile(path.join(dir, "agent_notes", "report.md"), "# report\n");
  return dir;
}

test("buildVirtualTree groups agent_notes in a folder tree", async () => {
  const workspace = await makeWorkspace();
  try {
    const tree = await buildVirtualTree(workspace);
    assert.equal(tree.internalFileCount, 5);
    assert.equal(tree.internalRoots.files.length, 2);
    assert.equal(tree.internalRoots.files[0].relativePath, "bug.json");
    assert.equal(tree.internalRoots.folders.length, 1);
    const agentNotes = tree.internalRoots.folders[0];
    assert.equal(agentNotes.name, "agent_notes");
    assert.equal(agentNotes.relativePath, "agent_notes");
    assert.equal(agentNotes.files.length, 2);
    assert.ok(agentNotes.files.some((f) => f.relativePath === "agent_notes/a.json"));
    assert.ok(agentNotes.files.some((f) => f.relativePath === "agent_notes/report.md"));
    assert.equal(agentNotes.folders.length, 1);
    assert.equal(agentNotes.folders[0].relativePath, "agent_notes/sub");
    assert.equal(agentNotes.folders[0].files[0].relativePath, "agent_notes/sub/b.json");
    assert.equal(countInternalFiles(tree.internalRoots), 5);
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test("buildVirtualTree does not list attachments/", async () => {
  const workspace = await makeWorkspace();
  try {
    const tree = await buildVirtualTree(workspace);
    const allPaths = [
      ...tree.internalRoots.files.map((f) => f.relativePath),
      ...flattenFolderPaths(tree.internalRoots.folders),
    ];
    assert.ok(!allPaths.some((p) => p.startsWith("attachments")));
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

function flattenFolderPaths(folders: { relativePath: string; files: { relativePath: string }[]; folders: any[] }[]): string[] {
  const out: string[] = [];
  for (const folder of folders) {
    out.push(folder.relativePath);
    for (const f of folder.files) out.push(f.relativePath);
    out.push(...flattenFolderPaths(folder.folders));
  }
  return out;
}
