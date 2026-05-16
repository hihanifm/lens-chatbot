import fs from "fs/promises";
import path from "path";
import type { BugTracker, BugDetails } from "./bugTracker.js";
import { log } from "../logger.js";

const WORKSPACES_ROOT = process.env.DATA_DIR
  ? `${process.env.DATA_DIR}/workspaces`
  : "data/local/workspaces";

export async function getOrCreateWorkspace(bugId: string): Promise<string> {
  const workspacePath = path.join(WORKSPACES_ROOT, bugId);
  await fs.mkdir(path.join(workspacePath, "attachments"), { recursive: true });
  await fs.mkdir(path.join(workspacePath, "agent_notes"), { recursive: true });
  log.debug("workspace:ready", { workspacePath });
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
  log.info("attachment:written", { filePath, bytes: data.length });
  return filePath;
}

export async function saveBugSummary(
  workspacePath: string,
  bug: BugDetails
): Promise<void> {
  await fs.writeFile(
    path.join(workspacePath, "bug.json"),
    JSON.stringify(bug, null, 2)
  );
  await fs.writeFile(
    path.join(workspacePath, "bug_summary.md"),
    `# ${bug.title}\n\n**ID:** ${bug.id}\n\n${bug.description}\n`
  );
}
