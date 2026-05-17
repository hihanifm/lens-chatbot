import fs from "fs/promises";
import { createReadStream } from "fs";
import path from "path";
import unzipper from "unzipper";
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

export async function walkFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const results: string[] = [];
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) results.push(...await walkFiles(full));
    else results.push(full);
  }
  return results;
}

export async function downloadAttachment(
  tracker: BugTracker,
  bugId: string,
  attId: string,
  attName: string,
  workspacePath: string
): Promise<{ filePath: string; extractedFiles: string[] }> {
  const data = await tracker.downloadAttachment(bugId, attId);
  const filePath = path.join(workspacePath, "attachments", attName);
  await fs.writeFile(filePath, data);
  log.info("attachment:written", { filePath, bytes: data.length });

  if (attName.endsWith(".zip")) {
    const extractDir = path.join(workspacePath, "attachments", path.basename(attName, ".zip"));
    await fs.mkdir(extractDir, { recursive: true });
    await new Promise<void>((resolve, reject) => {
      createReadStream(filePath)
        .pipe(unzipper.Extract({ path: extractDir }))
        .on("close", resolve)
        .on("error", reject);
    });
    const extractedFiles = await walkFiles(extractDir);
    log.info("attachment:extracted", { extractDir, files: extractedFiles.length });
    return { filePath, extractedFiles };
  }

  return { filePath, extractedFiles: [] };
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
