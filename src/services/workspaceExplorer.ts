import fs from "fs/promises";
import path from "path";

export interface FileNode {
  name: string;
  filePath: string;
}

export interface AttachmentNode {
  attId: string;
  name: string;
  isZip: boolean;
  downloaded: boolean;
  filePath?: string;
  children?: FileNode[];
}

export interface CommentSection {
  commentId: string;
  author: string;
  body: string;
  created_at: string;
  nodes: AttachmentNode[];
}

export interface InternalFileNode {
  name: string;
  relativePath: string;
  filePath: string;
  description: string;
}

export interface InternalFolderNode {
  name: string;
  relativePath: string;
  files: InternalFileNode[];
  folders: InternalFolderNode[];
}

export interface InternalRoots {
  files: InternalFileNode[];
  folders: InternalFolderNode[];
}

export interface VirtualTree {
  bugAttachments: AttachmentNode[];
  comments: CommentSection[];
  internalRoots: InternalRoots;
  internalFileCount: number;
}

const EMPTY_INTERNAL: InternalRoots = { files: [], folders: [] };

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

function isUnderWorkspace(workspacePath: string, resolved: string): boolean {
  const root = path.resolve(workspacePath) + path.sep;
  return resolved === path.resolve(workspacePath) || resolved.startsWith(root);
}

function agentNotesDescription(fileName: string): string {
  if (fileName.startsWith("http-egress-") && fileName.endsWith(".json")) {
    return "HTTP egress log (raw wire-level LLM call, redacted)";
  }
  if (fileName.endsWith(".md")) {
    return "Agent report saved for future reference";
  }
  if (fileName.startsWith("llm-request-") && fileName.endsWith(".json")) {
    return "LLM request payload logged for this turn";
  }
  if (fileName.startsWith("prompt-") && fileName.endsWith(".txt")) {
    return "Composed prompt logged for this turn";
  }
  return "Agent artifact saved for future reference";
}

export function countInternalFiles(roots: InternalRoots): number {
  let n = roots.files.length;
  for (const folder of roots.folders) {
    n += countInternalFolderFiles(folder);
  }
  return n;
}

function countInternalFolderFiles(folder: InternalFolderNode): number {
  let n = folder.files.length;
  for (const sub of folder.folders) {
    n += countInternalFolderFiles(sub);
  }
  return n;
}

async function buildInternalFolder(
  workspacePath: string,
  relativeDir: string,
): Promise<InternalFolderNode> {
  const absDir = path.resolve(workspacePath, relativeDir);
  if (!isUnderWorkspace(workspacePath, absDir)) {
    return { name: path.basename(relativeDir), relativePath: relativeDir, files: [], folders: [] };
  }

  const name = path.basename(relativeDir);
  const files: InternalFileNode[] = [];
  const folders: InternalFolderNode[] = [];

  const entries = await fs.readdir(absDir, { withFileTypes: true });
  for (const entry of entries) {
    const rel = path.join(relativeDir, entry.name);
    const abs = path.resolve(workspacePath, rel);
    if (!isUnderWorkspace(workspacePath, abs)) continue;

    if (entry.isFile()) {
      files.push({
        name: entry.name,
        relativePath: rel.split(path.sep).join("/"),
        filePath: abs,
        description: agentNotesDescription(entry.name),
      });
    } else if (entry.isDirectory()) {
      folders.push(await buildInternalFolder(workspacePath, rel));
    }
  }

  files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  folders.sort((a, b) => a.name.localeCompare(b.name));

  return {
    name,
    relativePath: relativeDir.split(path.sep).join("/"),
    files,
    folders,
  };
}

async function buildAttNode(workspacePath: string, att: { id: string; name: string }): Promise<AttachmentNode> {
  const filePath = path.resolve(workspacePath, "attachments", att.name);
  if (!filePath.startsWith(workspacePath + path.sep)) {
    return { attId: att.id, name: att.name, isZip: false, downloaded: false };
  }
  const isZip = att.name.endsWith(".zip");
  const downloaded = await fileExists(filePath);
  if (!downloaded) {
    return { attId: att.id, name: att.name, isZip, downloaded: false };
  }
  if (isZip) {
    return { attId: att.id, name: att.name, isZip: true, downloaded: true, filePath, children: [] };
  }
  return { attId: att.id, name: att.name, isZip: false, downloaded: true, filePath };
}

async function buildInternalRoots(workspacePath: string): Promise<InternalRoots> {
  const files: InternalFileNode[] = [];

  const fixedFiles: Array<{ name: string; description: string }> = [
    { name: "bug.json", description: "Raw data fetched from the bug tracker" },
    { name: "bug_summary.md", description: "Formatted summary injected into the agent's prompt" },
  ];
  for (const f of fixedFiles) {
    const filePath = path.join(workspacePath, f.name);
    if (await fileExists(filePath)) {
      files.push({
        name: f.name,
        relativePath: f.name,
        filePath,
        description: f.description,
      });
    }
  }

  const folders: InternalFolderNode[] = [];
  const agentNotesDir = path.join(workspacePath, "agent_notes");
  if (await fileExists(agentNotesDir)) {
    folders.push(await buildInternalFolder(workspacePath, "agent_notes"));
  }

  return { files, folders };
}

export async function buildVirtualTree(workspacePath: string): Promise<VirtualTree> {
  let bug: any;
  try {
    const raw = await fs.readFile(path.join(workspacePath, "bug.json"), "utf8");
    bug = JSON.parse(raw);
  } catch {
    return { bugAttachments: [], comments: [], internalRoots: EMPTY_INTERNAL, internalFileCount: 0 };
  }

  const bugAttachments: AttachmentNode[] = await Promise.all(
    (bug.attachments ?? []).map((att: any) => buildAttNode(workspacePath, att))
  );

  const comments: CommentSection[] = await Promise.all(
    (bug.comments ?? []).map(async (c: any) => ({
      commentId: c.id,
      author: c.author,
      body: c.body,
      created_at: c.created_at,
      nodes: await Promise.all((c.attachments ?? []).map((att: any) => buildAttNode(workspacePath, att))),
    }))
  );

  const internalRoots = await buildInternalRoots(workspacePath);
  const internalFileCount = countInternalFiles(internalRoots);

  return { bugAttachments, comments, internalRoots, internalFileCount };
}
