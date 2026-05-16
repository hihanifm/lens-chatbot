import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "crypto";

const DB_PATH = process.env.DATA_DIR
  ? `${process.env.DATA_DIR}/lens-chatbot.db`
  : "lens-chatbot.db";
const db = new DatabaseSync(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL UNIQUE,
    pin_hash   TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id             TEXT PRIMARY KEY,
    bug_id         TEXT NOT NULL,
    workspace_path TEXT,
    selected_files TEXT DEFAULT '[]',
    status         TEXT DEFAULT 'active',
    created_at     TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS messages (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    role       TEXT NOT NULL,
    content    TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`);

try {
  db.exec(`ALTER TABLE messages ADD COLUMN user_name TEXT DEFAULT 'User'`);
} catch { /* column already exists */ }

export interface User {
  id: string;
  name: string;
  created_at: string;
}

export const users = {
  getById(id: string): User | undefined {
    const row = db.prepare("SELECT id, name, created_at FROM users WHERE id = ?").get(id) as any;
    return row ?? undefined;
  },

  getByName(name: string): { id: string; name: string; pin_hash: string; created_at: string } | undefined {
    const row = db.prepare("SELECT * FROM users WHERE name = ?").get(name) as any;
    return row ?? undefined;
  },

  create(name: string, pinHash: string): User {
    const id = randomUUID();
    const now = new Date().toISOString();
    db.prepare("INSERT INTO users (id, name, pin_hash, created_at) VALUES (?, ?, ?, ?)").run(id, name, pinHash, now);
    return { id, name, created_at: now };
  },
};

export interface Session {
  id: string;
  bug_id: string;
  workspace_path: string;
  selected_files: string[];
  status: string;
  created_at: string;
}

export interface Message {
  id: number;
  session_id: string;
  role: "user" | "assistant";
  content: string;
  user_name: string;
  created_at: string;
}

export const sessions = {
  create(bugId: string, workspacePath: string): Session {
    const id = randomUUID();
    const now = new Date().toISOString();
    db.prepare(
      "INSERT INTO sessions (id, bug_id, workspace_path, created_at) VALUES (?, ?, ?, ?)"
    ).run(id, bugId, workspacePath, now);
    return sessions.get(id)!;
  },

  get(id: string): Session | undefined {
    const row = db.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as any;
    if (!row) return undefined;
    return { ...row, selected_files: JSON.parse(row.selected_files as string) };
  },

  list(): Session[] {
    return (db.prepare("SELECT * FROM sessions ORDER BY created_at DESC").all() as any[]).map(
      (r) => ({ ...r, selected_files: JSON.parse(r.selected_files) })
    );
  },

  addFile(id: string, filePath: string): void {
    const session = sessions.get(id);
    if (!session) return;
    const files = [...new Set([...session.selected_files, filePath])];
    db.prepare("UPDATE sessions SET selected_files = ? WHERE id = ?").run(
      JSON.stringify(files),
      id
    );
  },

  removeFile(id: string, filePath: string): void {
    const session = sessions.get(id);
    if (!session) return;
    const files = session.selected_files.filter((f) => f !== filePath);
    db.prepare("UPDATE sessions SET selected_files = ? WHERE id = ?").run(
      JSON.stringify(files),
      id
    );
  },

  findActiveByBugId(bugId: string): Session | undefined {
    const row = db
      .prepare("SELECT * FROM sessions WHERE bug_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1")
      .get(bugId) as any;
    if (!row) return undefined;
    return { ...row, selected_files: JSON.parse(row.selected_files as string) };
  },
};

export const messages = {
  add(sessionId: string, role: "user" | "assistant", content: string, userName = "User"): void {
    db.prepare(
      "INSERT INTO messages (session_id, role, content, user_name, created_at) VALUES (?, ?, ?, ?, ?)"
    ).run(sessionId, role, content, userName, new Date().toISOString());
  },

  list(sessionId: string): Message[] {
    return db
      .prepare("SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC")
      .all(sessionId) as unknown as Message[];
  },

  buildSummary(sessionId: string): string {
    return messages
      .list(sessionId)
      .map((m) => `${m.role === "user" ? m.user_name : "Assistant"}: ${m.content}`)
      .join("\n");
  },
};

export default db;
