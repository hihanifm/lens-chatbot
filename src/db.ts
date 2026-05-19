import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "crypto";
import { join } from "path";
import { log } from "./logger.js";

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

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

try {
  db.exec(`ALTER TABLE messages ADD COLUMN user_name TEXT DEFAULT 'User'`);
} catch { /* column already exists */ }
try {
  db.exec(`ALTER TABLE sessions ADD COLUMN cline_session_id TEXT`);
} catch { /* column already exists */ }
try {
  db.exec(`ALTER TABLE sessions ADD COLUMN last_model TEXT`);
} catch { /* column already exists */ }
try {
  db.exec(`ALTER TABLE users ADD COLUMN preferred_model TEXT`);
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

  getPreferredModel(id: string): string | null {
    const row = db.prepare("SELECT preferred_model FROM users WHERE id = ?").get(id) as any;
    return row?.preferred_model ?? null;
  },

  setPreferredModel(id: string, model: string | null): void {
    db.prepare("UPDATE users SET preferred_model = ? WHERE id = ?").run(model, id);
  },
};

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

  listByIds(ids: string[]): Session[] {
    if (!ids.length) return [];
    const placeholders = ids.map(() => '?').join(',');
    return (db.prepare(`SELECT * FROM sessions WHERE id IN (${placeholders}) ORDER BY created_at DESC`).all(...ids) as any[]).map(
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

  setClineSessionId(id: string, clineSessionId: string): void {
    db.prepare("UPDATE sessions SET cline_session_id = ? WHERE id = ?").run(clineSessionId, id);
  },

  clearClineSessionId(id: string): void {
    db.prepare("UPDATE sessions SET cline_session_id = NULL WHERE id = ?").run(id);
  },

  setLastModel(id: string, model: string): void {
    db.prepare("UPDATE sessions SET last_model = ? WHERE id = ?").run(model, id);
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

export interface FeatureFlags {
  promptLogging: boolean;
  llmRequestLogging: boolean;
  httpEgressLogging: boolean;
  wiki: boolean;
  lucky: boolean;
}

const DEFAULT_FLAGS: FeatureFlags = {
  promptLogging: true,
  llmRequestLogging: true,
  httpEgressLogging: true,
  wiki: true,
  lucky: true,
};

export interface LlmConfig {
  provider: "ollama" | "openai" | "openai-compatible";
  model: string;
  baseUrl?: string;
  apiKey?: string;
}

export type SystemPromptSource = "lens" | "cline";

export interface AgentSettings {
  maxIterations?: number;
  systemPromptSource?: SystemPromptSource;
}

export function resolveAgentSettings(stored: Partial<AgentSettings> | undefined): {
  maxIterations: number;
  systemPromptSource: SystemPromptSource;
} {
  const defaultSource: SystemPromptSource = process.env.SYSTEM_PROMPT_SOURCE === "cline" ? "cline" : "lens";
  return {
    maxIterations: stored?.maxIterations ?? Number(process.env.AGENT_MAX_ITERATIONS ?? 24),
    systemPromptSource: stored?.systemPromptSource ?? defaultSource,
  };
}

function readAgentSettingsRow(): Partial<AgentSettings> {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'agent'").get() as { value: string } | undefined;
  return row ? (JSON.parse(row.value) as Partial<AgentSettings>) : {};
}

export const settings = {
  getLlmConfig(): LlmConfig {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'llm'").get() as any;
    if (row) return JSON.parse(row.value) as LlmConfig;
    return {
      provider: (process.env.LLM_PROVIDER ?? "ollama") as LlmConfig["provider"],
      model: process.env.LLM_MODEL ?? "llama3.1:8b",
      baseUrl: process.env.LLM_BASE_URL,
      apiKey: process.env.LLM_API_KEY,
    };
  },

  setLlmConfig(cfg: LlmConfig): void {
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('llm', ?)").run(JSON.stringify(cfg));
  },

  getAdminPinHash(): string | null {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'admin_pin_hash'").get() as any;
    return row?.value ?? null;
  },

  setAdminPinHash(hash: string): void {
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('admin_pin_hash', ?)").run(hash);
  },

  getEnvSkillsDirs(): string[] {
    return (process.env.SKILLS_DIR ?? join(process.cwd(), "skills")).split(":").filter(Boolean);
  },

  getExtraSkillsDirs(): string[] {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'skills_dirs'").get() as { value: string } | undefined;
    return row ? (JSON.parse(row.value) as string[]) : [];
  },

  getSkillsDirs(): string[] {
    return [...new Set([...settings.getEnvSkillsDirs(), ...settings.getExtraSkillsDirs()])];
  },

  setSkillsDirs(dirs: string[]): void {
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('skills_dirs', ?)").run(JSON.stringify(dirs));
    log.info("settings:skills-dirs-updated", { dirs });
  },

  getFeatureFlags(): FeatureFlags {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'feature_flags'").get() as any;
    return row ? { ...DEFAULT_FLAGS, ...JSON.parse(row.value) } : { ...DEFAULT_FLAGS };
  },

  setFeatureFlags(flags: FeatureFlags): void {
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('feature_flags', ?)").run(JSON.stringify(flags));
    log.info("settings:feature-flags-updated", { flags });
  },

  getAgentSettings() {
    return resolveAgentSettings(readAgentSettingsRow());
  },

  setAgentSettings(partial: AgentSettings): void {
    const merged = { ...readAgentSettingsRow(), ...partial };
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('agent', ?)").run(JSON.stringify(merged));
    log.info("settings:agent-updated", resolveAgentSettings(merged));
  },

  getAgentMaxIterations(): number {
    return settings.getAgentSettings().maxIterations;
  },

  setAgentMaxIterations(n: number): void {
    settings.setAgentSettings({ maxIterations: n });
  },
};
