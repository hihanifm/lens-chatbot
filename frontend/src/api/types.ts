// Mirrors the relevant shapes exported by src/db.ts on the server. Kept thin
// on purpose — only the fields the UI actually renders.

export interface Session {
  id: string;
  bug_id: string;
  workspace_path: string;
  selected_files: string[];
  cline_session_id?: string;
  last_model?: string;
  status: string;
  created_at: string;
}

export interface Bug {
  id: string;
  title: string;
  description?: string;
  author?: string;
  status?: string;
  created_at?: string;
  comments?: Array<{ id: string; author: string; body: string; created_at: string }>;
}

export interface Message {
  id: number;
  session_id: string;
  role: "user" | "assistant" | "status";
  content: string;
  user_name: string;
  created_at: string;
}

export interface User {
  id: string;
  name: string;
  created_at: string;
  preferred_model?: string | null;
}

// ── Workspace file explorer (mirrors src/services/workspaceExplorer.ts) ──────

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

export interface ZipEntry {
  innerPath: string;
  size: number;
  extracted: boolean;
  filePath?: string;
}

export interface FeatureFlags {
  promptLogging?: boolean;
  llmRequestLogging?: boolean;
  httpEgressLogging?: boolean;
  wiki?: boolean;
  lucky?: boolean;
}
