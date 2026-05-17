import fs from "fs/promises";
import { createWriteStream } from "fs";
import path from "path";
import { randomUUID } from "crypto";
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
  return { filePath, extractedFiles: [] };
}

export interface ZipEntry {
  innerPath: string;
  size: number;
  extracted: boolean;
  filePath?: string;
}

export async function listZipContents(zipPath: string, extractBaseDir: string): Promise<ZipEntry[]> {
  const directory = await unzipper.Open.file(zipPath);
  const entries: ZipEntry[] = [];
  for (const file of directory.files) {
    if (file.type === "Directory") continue;
    const destPath = path.join(extractBaseDir, file.path);
    const resolved = path.resolve(destPath);
    if (!resolved.startsWith(path.resolve(extractBaseDir) + path.sep)) continue;
    let extracted = false, filePath: string | undefined;
    try { await fs.access(resolved); extracted = true; filePath = resolved; } catch (err: any) {
      log.debug("zip:entry-not-extracted", { resolved, error: err.message });
    }
    entries.push({ innerPath: file.path, size: file.uncompressedSize, extracted, filePath });
  }
  return entries;
}

export async function extractZipEntry(zipPath: string, innerPath: string, extractBaseDir: string): Promise<string> {
  const destPath = path.resolve(path.join(extractBaseDir, innerPath));
  if (!destPath.startsWith(path.resolve(extractBaseDir) + path.sep))
    throw new Error("path traversal detected");
  await fs.mkdir(path.dirname(destPath), { recursive: true });
  const directory = await unzipper.Open.file(zipPath);
  const entry = directory.files.find((f: any) => f.path === innerPath);
  if (!entry) throw new Error(`Entry not found in zip: ${innerPath}`);
  await new Promise<void>((resolve, reject) =>
    entry.stream()
      .pipe(createWriteStream(destPath))
      .on("close", resolve)
      .on("error", reject)
  );
  log.info("attachment:extracted-entry", { destPath });
  return destPath;
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

export interface AdHocUploadResult {
  filePaths: string[];
  commentId?: string;
}

export async function saveAdHocFiles(
  workspacePath: string,
  files: Array<{ originalname: string; buffer: Buffer }>,
  comment?: { label: string; body: string }
): Promise<AdHocUploadResult> {
  const filePaths: string[] = [];

  for (const file of files) {
    const dest = path.join(workspacePath, "attachments", file.originalname);
    await fs.writeFile(dest, file.buffer);
    log.info("adhoc:file-saved", { dest, bytes: file.buffer.length });
    filePaths.push(dest);
  }

  const bugJsonPath = path.join(workspacePath, "bug.json");
  // no concurrency guard needed: single-user tool
  const bug = JSON.parse(await fs.readFile(bugJsonPath, "utf8"));

  const attEntries = files.map((f) => ({
    id: randomUUID(),
    name: f.originalname,
    size: f.buffer.length,
  }));

  let commentId: string | undefined;

  if (comment) {
    commentId = randomUUID();
    bug.comments.push({
      id: commentId,
      author: "user",
      body: comment.label + (comment.body ? `\n\n${comment.body}` : ""),
      created_at: new Date().toISOString(),
      attachments: attEntries,
    });
  } else {
    bug.attachments.push(...attEntries);
  }

  await fs.writeFile(bugJsonPath, JSON.stringify(bug, null, 2));
  return { filePaths, commentId };
}
