import fs from "fs/promises";
import { createWriteStream } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import unzipper from "unzipper";
import type { BugTracker, BugDetails } from "./bugTracker.js";
import { log } from "../logger.js";

const WORKSPACES_ROOT = path.resolve(
  process.env.DATA_DIR ? `${process.env.DATA_DIR}/workspaces` : "data/local/workspaces"
);

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

/**
 * Sanitize each segment of a zip-internal path:
 *   - Replace runs of whitespace with a single `-`.
 *   - Trim leading/trailing `-` and `.` from each segment.
 * Folder nesting is preserved. Empty segments after trimming are dropped.
 */
function sanitizeZipPath(innerPath: string): string {
  return innerPath
    .split("/")
    .map((seg) => seg.replace(/\s+/g, "-").replace(/^[-.]+|[-.]+$/g, ""))
    .filter((seg) => seg.length > 0)
    .join("/");
}

export async function listZipContents(zipPath: string, extractBaseDir: string): Promise<ZipEntry[]> {
  const directory = await unzipper.Open.file(zipPath);
  const entries: ZipEntry[] = [];
  for (const file of directory.files) {
    if (file.type === "Directory") continue;
    const safeInner = sanitizeZipPath(file.path);
    if (!safeInner) continue;
    const destPath = path.join(extractBaseDir, safeInner);
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
  const safeInner = sanitizeZipPath(innerPath);
  if (!safeInner) throw new Error(`Zip entry path is empty after sanitization: ${innerPath}`);
  const destPath = path.resolve(path.join(extractBaseDir, safeInner));
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

async function moveUploadIntoAttachments(tempPath: string, dest: string): Promise<void> {
  try {
    await fs.rename(tempPath, dest);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "EXDEV") {
      await fs.copyFile(tempPath, dest);
      await fs.unlink(tempPath);
      return;
    }
    throw err;
  }
}

export async function saveAdHocFiles(
  workspacePath: string,
  files: Array<{ originalname: string; path: string }>,
  comment?: { label: string; body: string }
): Promise<AdHocUploadResult> {
  const filePaths: string[] = [];
  const attEntries: { id: string; name: string; size: number }[] = [];

  try {
    for (const file of files) {
      const safeName = path.basename(file.originalname);
      const dest = path.join(workspacePath, "attachments", safeName);
      const stat = await fs.stat(file.path);
      log.info("session:upload:saving", { dest, bytes: stat.size });
      await moveUploadIntoAttachments(file.path, dest);
      log.info("adhoc:file-saved", { dest, bytes: stat.size });
      filePaths.push(dest);
      attEntries.push({ id: randomUUID(), name: safeName, size: stat.size });
    }
  } catch (err) {
    for (const file of files) {
      await fs.unlink(file.path).catch(() => {});
    }
    throw err;
  }

  const bugJsonPath = path.join(workspacePath, "bug.json");
  // no concurrency guard needed: single-user tool
  const bug = JSON.parse(await fs.readFile(bugJsonPath, "utf8"));

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
