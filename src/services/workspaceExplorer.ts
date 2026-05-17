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

export interface VirtualTree {
  bugAttachments: AttachmentNode[];
  comments: CommentSection[];
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
    return { bugAttachments: [], comments: [] };
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

  return { bugAttachments, comments };
}
