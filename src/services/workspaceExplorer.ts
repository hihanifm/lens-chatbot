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
  filePath: string;
  description: string;
}

export interface VirtualTree {
  bugAttachments: AttachmentNode[];
  comments: CommentSection[];
  internalFiles: InternalFileNode[];
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
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

export async function buildVirtualTree(workspacePath: string): Promise<VirtualTree> {
  let bug: any;
  try {
    const raw = await fs.readFile(path.join(workspacePath, "bug.json"), "utf8");
    bug = JSON.parse(raw);
  } catch {
    return { bugAttachments: [], comments: [], internalFiles: [] };
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

  const internalFiles: InternalFileNode[] = [];

  const fixedFiles: Array<{ name: string; description: string }> = [
    { name: "bug.json", description: "Raw data fetched from the bug tracker" },
    { name: "bug_summary.md", description: "Formatted summary injected into the agent's prompt" },
  ];
  for (const f of fixedFiles) {
    const filePath = path.join(workspacePath, f.name);
    if (await fileExists(filePath)) {
      internalFiles.push({ name: f.name, filePath, description: f.description });
    }
  }

  const agentNotesDir = path.join(workspacePath, "agent_notes");
  try {
    const entries = await fs.readdir(agentNotesDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile()) {
        internalFiles.push({
          name: entry.name,
          filePath: path.join(agentNotesDir, entry.name),
          description: "Agent response saved for future reference",
        });
      }
    }
  } catch {
    // agent_notes/ doesn't exist yet — fine
  }

  return { bugAttachments, comments, internalFiles };
}
