import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "crypto";
import { join } from "path";
import { log } from "./logger.js";

const DB_PATH = process.env.DATA_DIR
  ? `${process.env.DATA_DIR}/lens-chatbot.db`
  : "lens-chatbot.db";
const db = new DatabaseSync(DB_PATH);

// Canonical schema. Pre-alpha — no migration support. Wipe the dev DB
// (`make dev-clean` / `make dock-clean`) if you pull a schema change.
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL UNIQUE,
    pin_hash        TEXT NOT NULL,
    preferred_model TEXT,
    created_at      TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id                TEXT PRIMARY KEY,
    bug_id            TEXT NOT NULL,
    workspace_path    TEXT,
    selected_files    TEXT DEFAULT '[]',
    cline_session_id  TEXT,
    last_model        TEXT,
    last_activity_at  TEXT,
    status            TEXT DEFAULT 'active',
    created_at        TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS messages (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    role       TEXT NOT NULL,
    content    TEXT NOT NULL,
    user_name  TEXT DEFAULT 'User',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_bug_status ON sessions(bug_id, status);
`);

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

  updatePinHash(id: string, pinHash: string): void {
    db.prepare("UPDATE users SET pin_hash = ? WHERE id = ?").run(pinHash, id);
  },
};

export interface Session {
  id: string;
  bug_id: string;
  workspace_path: string;
  selected_files: string[];
  cline_session_id?: string;
  last_model?: string;
  last_activity_at?: string;
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
      "INSERT INTO sessions (id, bug_id, workspace_path, last_activity_at, created_at) VALUES (?, ?, ?, ?, ?)"
    ).run(id, bugId, workspacePath, now, now);
    return sessions.get(id)!;
  },

  /** Bump `last_activity_at` to now — called by every session mutator and on each user/assistant message. */
  touch(id: string): void {
    db.prepare("UPDATE sessions SET last_activity_at = ? WHERE id = ?").run(new Date().toISOString(), id);
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
    sessions.touch(id);
  },

  removeFile(id: string, filePath: string): void {
    const session = sessions.get(id);
    if (!session) return;
    const files = session.selected_files.filter((f) => f !== filePath);
    db.prepare("UPDATE sessions SET selected_files = ? WHERE id = ?").run(
      JSON.stringify(files),
      id
    );
    sessions.touch(id);
  },

  setClineSessionId(id: string, clineSessionId: string): void {
    db.prepare("UPDATE sessions SET cline_session_id = ? WHERE id = ?").run(clineSessionId, id);
    sessions.touch(id);
  },

  clearClineSessionId(id: string): void {
    db.prepare("UPDATE sessions SET cline_session_id = NULL WHERE id = ?").run(id);
    sessions.touch(id);
  },

  setLastModel(id: string, model: string): void {
    db.prepare("UPDATE sessions SET last_model = ? WHERE id = ?").run(model, id);
    sessions.touch(id);
  },

  findActiveByBugId(bugId: string): Session | undefined {
    const row = db
      .prepare("SELECT * FROM sessions WHERE bug_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1")
      .get(bugId) as any;
    if (!row) return undefined;
    return { ...row, selected_files: JSON.parse(row.selected_files as string) };
  },

  /**
   * Sessions whose last activity is older than the given ISO timestamp — used by the
   * retention sweeper. Falls back to `created_at` for sessions that predate the
   * `last_activity_at` column (cannot exist under the fresh schema, but defensive).
   */
  listExpiredBefore(cutoffIso: string): Session[] {
    return (db.prepare("SELECT * FROM sessions WHERE COALESCE(last_activity_at, created_at) < ?").all(cutoffIso) as any[]).map(
      (r) => ({ ...r, selected_files: JSON.parse(r.selected_files) })
    );
  },

  /** Delete a session and its messages. Workspace dir removal is the caller's job. */
  delete(id: string): void {
    db.prepare("DELETE FROM messages WHERE session_id = ?").run(id);
    db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
  },
};

export const messages = {
  add(sessionId: string, role: "user" | "assistant", content: string, userName = "User"): void {
    db.prepare(
      "INSERT INTO messages (session_id, role, content, user_name, created_at) VALUES (?, ?, ?, ?, ?)"
    ).run(sessionId, role, content, userName, new Date().toISOString());
    sessions.touch(sessionId);
  },

  list(sessionId: string): Message[] {
    return db
      .prepare("SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC")
      .all(sessionId) as unknown as Message[];
  },

  /** Transcript for LLM consumption — capped to bound prompt size on long sessions. */
  buildSummary(sessionId: string, maxTurns = 40, maxCharsPerMsg = 4000): string {
    return messages
      .list(sessionId)
      .slice(-maxTurns)
      .map((m) => `${m.role === "user" ? m.user_name : "Assistant"}: ${m.content.slice(0, maxCharsPerMsg)}`)
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

export type AgentEngine = "cline-core" | "cli";

export interface AgentSettings {
  maxIterations?: number;
  systemPromptSource?: SystemPromptSource;
  /** Which agent runner handles analysis: in-process SDK ("cline-core") or the `cline` CLI ("cli"). */
  engine?: AgentEngine;
  /** Path to (or name of) the `cline` CLI binary; used when engine is "cli". */
  cliCommand?: string;
  /** When engine is "cli", prepend prior turns to the prompt (cline CLI is one-shot, no native resume). */
  cliInjectHistory?: boolean;
}

export function resolveAgentSettings(stored: Partial<AgentSettings> | undefined): {
  maxIterations: number;
  systemPromptSource: SystemPromptSource;
  engine: AgentEngine;
  cliCommand: string;
  cliInjectHistory: boolean;
} {
  const defaultSource: SystemPromptSource = process.env.SYSTEM_PROMPT_SOURCE === "cline" ? "cline" : "lens";
  const defaultEngine: AgentEngine = process.env.AGENT_ENGINE === "cli" ? "cli" : "cline-core";
  return {
    maxIterations: stored?.maxIterations ?? Number(process.env.AGENT_MAX_ITERATIONS ?? 24),
    systemPromptSource: stored?.systemPromptSource ?? defaultSource,
    engine: stored?.engine ?? defaultEngine,
    cliCommand: stored?.cliCommand ?? process.env.CLINE_CLI_COMMAND ?? "cline",
    cliInjectHistory: stored?.cliInjectHistory ?? true,
  };
}

/** Pack the owning engine into the stored cline_session_id so follow-ups/abort route correctly. */
export function packSessionId(engine: AgentEngine, id: string): string {
  return `${engine}:${id}`;
}

/** Unpack a stored cline_session_id. Unprefixed legacy values are treated as cline-core. */
export function unpackSessionId(stored: string): { engine: AgentEngine; id: string } {
  if (stored.startsWith("cli:")) return { engine: "cli", id: stored.slice(4) };
  if (stored.startsWith("cline-core:")) return { engine: "cline-core", id: stored.slice(11) };
  return { engine: "cline-core", id: stored };
}

function readAgentSettingsRow(): Partial<AgentSettings> {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'agent'").get() as { value: string } | undefined;
  return row ? (JSON.parse(row.value) as Partial<AgentSettings>) : {};
}

export const settings = {
  getLlmConfig(): LlmConfig {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'llm'").get() as any;
    const cfg: LlmConfig = row
      ? (JSON.parse(row.value) as LlmConfig)
      : {
          provider: (process.env.LLM_PROVIDER ?? "ollama") as LlmConfig["provider"],
          model: process.env.LLM_MODEL ?? "llama3.1:8b",
          baseUrl: process.env.LLM_BASE_URL,
          apiKey: process.env.LLM_API_KEY,
        };
    // Env always wins for baseUrl — it's infra config (which host Ollama is on),
    // not a user preference. Lets docker-compose and make dev override without
    // requiring a settings UI save.
    if (process.env.LLM_BASE_URL) cfg.baseUrl = process.env.LLM_BASE_URL;
    return cfg;
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

  getAgentEngine(): AgentEngine {
    return settings.getAgentSettings().engine;
  },

  setAgentMaxIterations(n: number): void {
    settings.setAgentSettings({ maxIterations: n });
  },
};
