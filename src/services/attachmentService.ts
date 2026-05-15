import fs from "fs/promises";
import path from "path";
import type { BugTracker } from "./bugTracker.js";

const WORKSPACES_ROOT = process.env.DATA_DIR
  ? `${process.env.DATA_DIR}/workspaces`
  : "/tmp/lens-workspaces";

export async function getOrCreateWorkspace(bugId: string): Promise<string> {
  const workspacePath = path.join(WORKSPACES_ROOT, bugId);
  await fs.mkdir(path.join(workspacePath, "attachments"), { recursive: true });
  await fs.mkdir(path.join(workspacePath, "agent_notes"), { recursive: true });
  return workspacePath;
}

export async function downloadAttachment(
  tracker: BugTracker,
  bugId: string,
  attId: string,
  attName: string,
  workspacePath: string
): Promise<string> {
  const data = await tracker.downloadAttachment(bugId, attId);
  const filePath = path.join(workspacePath, "attachments", attName);
  await fs.writeFile(filePath, data);
  return filePath;
}

export async function saveBugSummary(
  workspacePath: string,
  bugId: string,
  title: string,
  description: string
): Promise<void> {
  const raw = { id: bugId, title, description };
  await fs.writeFile(
    path.join(workspacePath, "bug.json"),
    JSON.stringify(raw, null, 2)
  );
  await fs.writeFile(
    path.join(workspacePath, "bug_summary.md"),
    `# ${title}\n\n**ID:** ${bugId}\n\n${description}\n`
  );
}
