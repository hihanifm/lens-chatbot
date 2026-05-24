import express from "express";
import path from "path";
import fs from "node:fs/promises";
import { mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "url";
import { createHash, randomUUID, scrypt, randomBytes, timingSafeEqual } from "crypto";
import type { BugTracker } from "./services/bugTracker.js";
import { getOrCreateWorkspace, downloadAttachment, saveBugSummary, listZipContents, extractZipEntry, saveAdHocFiles } from "./services/attachmentService.js";
import { synthesizeBugSummary } from "./services/bugSummarizer.js";
import multer from "multer";
import { buildVirtualTree } from "./services/workspaceExplorer.js";
import type { AgentRunner } from "./agent/agentRunner.js";
import { sessions, messages, users, settings, unpackSessionId } from "./db.js";
import type { LlmConfig } from "./db.js";
import { addClient, removeClient, broadcast } from "./broadcast.js";
import { createWikiEntry, listWikiEntries, readWikiEntry, buildWikiSynthesisPrompt } from "./services/wikiService.js";
import type { WikiEntry } from "./services/wikiService.js";
import { loadAgentSkills } from "./agent/agentPrompt.js";
import { runLucky } from "./agent/luckyAnalyzer.js";
import { log } from "./logger.js";
import { isLlmSanitizeEnabled, sanitizeForLlm } from "./services/llmSanitize.js";
import { classifyBatch, shouldAutoSelect, summarizeBatch, isCritical } from "./services/attachmentFilter.js";
import { snapshotAgentReportPaths, listNewAgentReports } from "./services/agentReports.js";
import { resolveWorkspaceFilePath } from "./services/workspacePaths.js";
import { marked } from "marked";
import DOMPurify from "isomorphic-dompurify";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_JSON_PATH = path.resolve(MODULE_DIR, "../package.json");
const OPENAPI_SPEC_PATH = path.resolve(MODULE_DIR, "../docs/openapi.yaml");

function readGitSha(): string {
  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim() || "dev";
  } catch {
    return "dev";
  }
}

function readPackageJson(): { version?: string; repository?: string | { url?: string } } {
  try {
    return JSON.parse(readFileSync(PACKAGE_JSON_PATH, "utf8"));
  } catch {
    return {};
  }
}

function normalizeRepoUrl(repository: string | { url?: string } | undefined): string {
  const raw = typeof repository === "string" ? repository : repository?.url;
  if (!raw) return "";
  if (raw.startsWith("git@github.com:")) {
    const path = raw.slice("git@github.com:".length).replace(/\.git$/i, "");
    return `https://github.com/${path}`;
  }
  return raw.replace(/^git\+/, "").replace(/\.git$/i, "");
}

const PACKAGE_JSON = readPackageJson();
const GIT_SHA = readGitSha();
const SERVER_STARTED_AT = new Date().toISOString();

const APP_VERSION = PACKAGE_JSON.version ?? "unknown";

const SERVER_BUILD_INFO = {
  api: APP_VERSION,
  build: GIT_SHA,
  gitSha: GIT_SHA,
  appVersion: APP_VERSION,
  repoUrl: normalizeRepoUrl(PACKAGE_JSON.repository),
  env: process.env.NODE_ENV ?? "development",
  startedAt: SERVER_STARTED_AT,
  nodeVersion: process.version,
};

/** Wrap sanitized report HTML in a minimal styled standalone document. */
function renderReportPage(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title.replace(/[<>&]/g, "")}</title>
<style>
  :root { color-scheme: light dark; }
  body {
    max-width: 900px; margin: 2.5rem auto; padding: 0 2rem;
    font: 15px/1.7 -apple-system, Segoe UI, Roboto, sans-serif;
    color: #1f2937; background: #fff;
  }
  /* Heading hierarchy — dark navy title → medium blue sections */
  h1 {
    font-size: 1.65em; font-weight: 700; color: #0f2d5e;
    border-bottom: 3px solid #1a4ea6; padding-bottom: .45em; margin-bottom: 1em;
  }
  h2 { font-size: 1.2em; font-weight: 700; color: #1a4ea6; margin-top: 2em; }
  h3 { font-size: 1.05em; font-weight: 700; color: #1a5ea6; margin-top: 1.4em; }
  h4 { font-size: 1em; font-weight: 600; color: #2563eb; margin-top: 1.2em; }
  /* Bold metadata labels (e.g. "Ticket ID:", "Priority:") */
  strong, b { color: #0f2d5e; }
  p { margin: .6em 0; }
  ul, ol { padding-left: 1.6em; margin: .6em 0; }
  li { margin: .25em 0; }
  a { color: #1a4ea6; }
  code {
    background: #eef2f9; padding: .12em .38em;
    border-radius: 4px; font-size: .88em;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  pre {
    background: #eef2f9; padding: 1rem; border-radius: 8px;
    overflow-x: auto; margin: .8em 0;
  }
  pre code { background: none; padding: 0; }
  /* Tables — blue header, bold first column, alternating rows */
  table { border-collapse: collapse; width: 100%; margin: .8em 0; }
  thead tr { background: #e8eef9; }
  th {
    padding: .45em .7em; text-align: left; font-weight: 600;
    color: #0f2d5e; border: 1px solid #c5d3e8;
  }
  td { padding: .4em .7em; border: 1px solid #d1daea; }
  tbody tr:nth-child(even) { background: #f7f9fd; }
  td:first-child { font-weight: 600; color: #0f2d5e; }
  blockquote {
    border-left: 4px solid #1a4ea6; margin: 1em 0;
    padding-left: 1em; color: #4b5e7a;
  }
  hr { border: none; border-top: 1px solid #d1daea; margin: 1.4em 0; }
  @media (prefers-color-scheme: dark) {
    body { background: #0f172a; color: #e2e8f0; }
    h1 { color: #93c5fd; border-color: #3b82f6; }
    h2 { color: #60a5fa; }
    h3 { color: #7ab8fc; }
    h4 { color: #93c5fd; }
    strong, b { color: #bfdbfe; }
    code, pre { background: #1e293b; }
    thead tr { background: #1e3a5f; }
    th { color: #bfdbfe; border-color: #2d4a70; }
    td { border-color: #334155; }
    tbody tr:nth-child(even) { background: #172033; }
    td:first-child { color: #93c5fd; }
    blockquote { border-color: #3b82f6; color: #94a3b8; }
    a { color: #60a5fa; }
    hr { border-color: #334155; }
  }
</style></head><body>${bodyHtml}</body></html>`;
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/**
 * Restrict bugId to characters safe to use as a single workspace directory name.
 * Internal users only — this is fat-finger / paste-mistake protection, not a hard
 * security boundary. Rejects path-traversal payloads (`..`, `/`, `\`) and limits length.
 */
const BUG_ID_RE = /^[A-Za-z0-9._-]{1,64}$/;
export function isValidBugId(s: unknown): s is string {
  if (typeof s !== "string") return false;
  if (!BUG_ID_RE.test(s)) return false;
  // Require at least one alphanumeric so that pure-dot segments (".", "..", "...")
  // — the path-traversal payloads the regex character class would otherwise allow —
  // are rejected.
  return /[A-Za-z0-9]/.test(s);
}

async function listDownloadedAttachmentPaths(workspacePath: string): Promise<string[]> {
  try {
    const attDir = path.join(workspacePath, "attachments");
    const entries = await fs.readdir(attDir, { recursive: true, withFileTypes: true });
    return entries
      .filter((e) => e.isFile())
      .map((e) => path.join(e.parentPath ?? (e as any).path ?? attDir, e.name));
  } catch {
    return [];
  }
}

let skillsCache: { name: string; description: string; triggers: string[] }[] | null = null;
let skillsCacheAt = 0;
/** Short TTL so live edits to a mounted SKILLS_DIR surface without a restart. */
const SKILLS_CACHE_TTL_MS = 30_000;

export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const hash = await new Promise<string>((resolve, reject) => {
    scrypt(pin, salt, 32, (err, key) => (err ? reject(err) : resolve(key.toString("hex"))));
  });
  return `${salt}:${hash}`;
}

async function verifyPin(pin: string, stored: string): Promise<boolean> {
  const [salt, expected] = stored.split(":");
  if (!salt || !expected) return false;
  const actual = await new Promise<Buffer>((resolve, reject) => {
    scrypt(pin, salt, 32, (err, key) => (err ? reject(err) : resolve(key)));
  });
  const expectedBuf = Buffer.from(expected, "hex");
  if (actual.length !== expectedBuf.length) return false;
  return timingSafeEqual(actual, expectedBuf);
}

const __dirname = MODULE_DIR;

export function createApp(tracker: BugTracker, runner: AgentRunner): express.Application {
  const app = express();
  app.use(express.json());

  const MAX_UPLOAD_BYTES = parseInt(process.env.UPLOAD_SIZE_LIMIT_MB ?? "500") * 1024 * 1024;

  // Session IDs with an analysis (/analyze or /lucky) currently in flight.
  // A second concurrent run on the same session would race on cline_session_id.
  const activeAnalyses = new Set<string>();

  function sessionUploadMiddleware(
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) {
    const session = sessions.get(req.params.id);
    if (!session) return res.status(404).json({ error: "session not found" });
    if (!session.workspace_path) return res.status(400).json({ error: "no workspace" });

    const tmpDir = path.join(session.workspace_path, ".upload-tmp");
    const storage = multer.diskStorage({
      destination: (_req, _file, cb) => {
        try {
          mkdirSync(tmpDir, { recursive: true });
          cb(null, tmpDir);
        } catch (err) {
          cb(err as Error, tmpDir);
        }
      },
      filename: (_req, file, cb) => {
        cb(null, `${randomUUID()}${path.extname(file.originalname)}`);
      },
    });
    multer({ storage, limits: { fileSize: MAX_UPLOAD_BYTES } }).array("files", 20)(req, res, next);
  }

  app.use((req, _res, next) => {
    log.info(`${req.method} ${req.path}`, Object.keys(req.query).length ? { query: req.query } : undefined);
    next();
  });

  // Serve the built React UI (frontend/dist) when present; fall back to the
  // legacy static/ bundle otherwise. dist holds hashed assets, so the React
  // index.html is served via the SPA fallback registered after the API routes.
  const reactDist = path.join(__dirname, "../frontend/dist");
  const hasReactBuild = existsSync(path.join(reactDist, "index.html"));
  const webRoot = hasReactBuild ? reactDist : path.join(__dirname, "../static");
  log.info("web:static-root", { root: webRoot, react: hasReactBuild });
  app.use(express.static(webRoot));

  // ── External integration: spec, docs, version ────────────────────────────────
  // Registered before /auth so they take precedence over the SPA fallback.

  app.get("/version", (_req, res) => res.json(SERVER_BUILD_INFO));

  app.get("/openapi.yaml", (_req, res) => {
    res.setHeader("Content-Type", "application/yaml; charset=utf-8");
    res.sendFile(OPENAPI_SPEC_PATH, (err) => {
      if (err) {
        log.error("openapi:serve-error", { error: err.message });
        if (!res.headersSent) res.status(404).json({ error: "openapi.yaml not found" });
      }
    });
  });

  app.get("/docs", (_req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(`<!doctype html><html><head><meta charset="utf-8"><title>Lens Chatbot API — ${SERVER_BUILD_INFO.api}</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}</style></head><body><redoc spec-url="/openapi.yaml"></redoc><script src="https://cdn.redoc.ly/redoc/latest/bundles/redoc.standalone.js"></script></body></html>`);
  });

  app.post("/auth", async (req, res) => {
    const { name, pin } = req.body;
    if (!name || !pin) return res.status(400).json({ error: "name and pin required" });

    const pinStr = String(pin);
    const trimmed = String(name).trim().slice(0, 50);
    const existing = users.getByName(trimmed);

    if (!existing) {
      const user = users.create(trimmed, await hashPin(pinStr));
      return res.json(user);
    }

    let ok = false;
    if (existing.pin_hash.includes(":")) {
      // scrypt format (salt:hash)
      ok = await verifyPin(pinStr, existing.pin_hash);
    } else {
      // Legacy unsalted SHA-256 — verify in constant time, then transparently
      // upgrade the stored hash to scrypt on a successful login.
      const a = Buffer.from(sha256(pinStr), "hex");
      const b = Buffer.from(existing.pin_hash, "hex");
      ok = a.length === b.length && timingSafeEqual(a, b);
      if (ok) users.updatePinHash(existing.id, await hashPin(pinStr));
    }
    if (!ok) return res.status(401).json({ error: "Wrong PIN for that name" });
    return res.json({ id: existing.id, name: existing.name, created_at: existing.created_at });
  });

  app.get("/users/:id", (req, res) => {
    const user = users.getById(req.params.id);
    if (!user) return res.status(404).json({ error: "not found" });
    res.json(user);
  });

  app.post("/session/adhoc", async (req, res) => {
    const { bugId: rawId, title, description } = req.body;
    if (!title) return res.status(400).json({ error: "title required" });

    const bugId = (rawId?.trim()) || `ADHOC-${Date.now()}`;
    if (!isValidBugId(bugId))
      return res.status(400).json({ error: "bugId must be alphanumeric + ._- (max 64 chars)" });
    const now = new Date().toISOString();

    const bug = {
      id: bugId,
      title,
      description: description ?? "",
      author: "user",
      owner: "",
      state: "adhoc",
      module: "adhoc",
      created_at: now,
      updated_at: now,
      attachments: [],
      comments: [],
    };

    // No dedup: each ad hoc creation is intentionally a fresh session.
    log.info("session:adhoc:create", { bugId });
    const workspacePath = await getOrCreateWorkspace(bugId);
    await saveBugSummary(workspacePath, bug);
    synthesizeBugSummary(workspacePath, bug).catch((err) =>
      log.warn("bugSummary:bg-failed", { workspacePath, error: err.message }),
    );
    const session = sessions.create(bugId, workspacePath);
    log.info("session:adhoc:created", { sessionId: session.id, workspace: workspacePath });
    res.json({ session, bug });
  });

  app.post("/session/:id/upload", sessionUploadMiddleware, async (req, res) => {
    const session = sessions.get(req.params.id);
    if (!session?.workspace_path) return res.status(404).json({ error: "session not found" });

    const multerFiles = req.files as Express.Multer.File[];
    if (!multerFiles || multerFiles.length === 0) return res.status(400).json({ error: "no files uploaded" });

    const files = multerFiles.map((f) => ({ originalname: f.originalname, path: f.path }));

    const commentLabel = (req.body.commentLabel as string | undefined)?.trim();
    const commentBody = (req.body.commentBody as string | undefined)?.trim();
    const comment = commentLabel ? { label: commentLabel, body: commentBody ?? "" } : undefined;

    try {
      const result = await saveAdHocFiles(session.workspace_path, files, comment);
      // Auto-select via attachment-filter skill (priority/useful only).
      const classified = await classifyBatch(result.filePaths, session.workspace_path);
      const autoAdded: string[] = [];
      for (const c of classified) {
        if (shouldAutoSelect(c.classification)) {
          sessions.addFile(session.id, c.absPath);
          autoAdded.push(c.relPath);
        }
      }
      log.info("session:upload:done", { sessionId: session.id, count: files.length, autoSelected: autoAdded.length });
      res.json({ ...result, autoSelected: autoAdded });
    } catch (err: any) {
      log.error("session:upload:error", { err: err.message });
      for (const f of files) await fs.unlink(f.path).catch(() => {});
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/session", async (req, res) => {
    const { bugId } = req.body;
    if (!bugId) return res.status(400).json({ error: "bugId required" });
    if (!isValidBugId(bugId))
      return res.status(400).json({ error: "bugId must be alphanumeric + ._- (max 64 chars)" });

    log.info("session:create", { bugId });
    const bug = await tracker.getBug(bugId);
    log.debug("bug:fetched", { bugId, title: bug.title, attachments: bug.attachments.length });

    const existing = sessions.findActiveByBugId(bugId);
    if (existing) {
      await saveBugSummary(existing.workspace_path, bug);
      synthesizeBugSummary(existing.workspace_path, bug).catch((err) =>
        log.warn("bugSummary:bg-failed", { workspacePath: existing.workspace_path, error: err.message }),
      );
      log.info("session:reused", { sessionId: existing.id });
      const downloaded_files = await listDownloadedAttachmentPaths(existing.workspace_path);
      return res.json({ session: existing, bug, downloaded_files });
    }

    const workspacePath = await getOrCreateWorkspace(bugId);
    await saveBugSummary(workspacePath, bug);
    synthesizeBugSummary(workspacePath, bug).catch((err) =>
      log.warn("bugSummary:bg-failed", { workspacePath, error: err.message }),
    );
    const session = sessions.create(bugId, workspacePath);
    log.info("session:created", { sessionId: session.id, workspace: workspacePath });
    const downloaded_files = await listDownloadedAttachmentPaths(workspacePath);
    res.json({ session, bug, downloaded_files });
  });

  app.get("/sessions", (req, res) => {
    const ids = (req.query.ids as string | undefined)?.split(",").filter(Boolean) ?? [];
    res.json(sessions.listByIds(ids));
  });

  app.get("/session/:id", async (req, res, next) => {
    // This path doubles as a client-side React route. A browser navigating
    // (or hard-refreshing) to /session/:id sends `Accept: text/html` — defer
    // to the SPA fallback so it gets the app shell, not this JSON payload.
    // The frontend's fetch client always sends `Accept: application/json`.
    if (req.accepts(["json", "html"]) === "html") return next();

    const session = sessions.get(req.params.id);
    if (!session) return res.status(404).json({ error: "session not found" });
    let bug = null;
    const fs = await import("fs/promises");
    try {
      const raw = await fs.readFile(path.join(session.workspace_path, "bug.json"), "utf8");
      bug = JSON.parse(raw);
    } catch (err: any) {
      log.debug("session:bug-json-missing", { sessionId: req.params.id, error: err.message, stack: err.stack });
    }
    let downloaded_files: string[] = await listDownloadedAttachmentPaths(session.workspace_path);
    res.json({ session, messages: messages.list(req.params.id), bug, downloaded_files });
  });

  app.post("/session/:id/refresh-bug", async (req, res) => {
    const session = sessions.get(req.params.id);
    if (!session) return res.status(404).json({ error: "session not found" });

    log.info("bug:refresh", { sessionId: req.params.id, bugId: session.bug_id });
    try {
      const bug = await tracker.getBug(session.bug_id);
      await saveBugSummary(session.workspace_path, bug);
      synthesizeBugSummary(session.workspace_path, bug, { force: true }).catch((err) =>
        log.warn("bugSummary:bg-failed", { workspacePath: session.workspace_path, error: err.message }),
      );
      log.debug("bug:refreshed", { bugId: session.bug_id, state: bug.state, comments: bug.comments.length });
      res.json({ bug });
    } catch (err: any) {
      log.error("bug:refresh-error", { sessionId: req.params.id, error: err.message, stack: err instanceof Error ? err.stack : undefined });
      res.status(502).json({ error: `Failed to refresh bug: ${err.message}` });
    }
  });

  app.get("/session/:id/workspace/files", async (req, res) => {
    const session = sessions.get(req.params.id);
    if (!session) return res.status(404).json({ error: "session not found" });
    const tree = await buildVirtualTree(session.workspace_path);
    res.json(tree);
  });

  app.get("/session/:id/zip-contents", async (req, res) => {
    const session = sessions.get(req.params.id);
    if (!session) return res.status(404).json({ error: "session not found" });
    const zipPath = resolveWorkspaceFilePath(session.workspace_path, String(req.query.zipPath ?? ""));
    if (!zipPath) return res.status(403).json({ error: "path outside workspace" });
    const zipBaseName = path.basename(zipPath, ".zip");
    const extractBaseDir = path.join(session.workspace_path, "attachments", zipBaseName);
    const entries = await listZipContents(zipPath, extractBaseDir);
    res.json({ entries });
  });

  app.post("/session/:id/extract-file", async (req, res) => {
    const session = sessions.get(req.params.id);
    if (!session) return res.status(404).json({ error: "session not found" });
    const { zipPath, innerPath } = req.body;
    if (!zipPath || !innerPath)
      return res.status(400).json({ error: "zipPath and innerPath required" });
    const resolvedZip = resolveWorkspaceFilePath(session.workspace_path, String(zipPath));
    if (!resolvedZip) return res.status(403).json({ error: "path outside workspace" });
    const zipBaseName = path.basename(resolvedZip, ".zip");
    const extractBaseDir = path.join(session.workspace_path, "attachments", zipBaseName);
    try {
      const extractedPath = await extractZipEntry(resolvedZip, String(innerPath), extractBaseDir);
      res.json({ filePath: extractedPath });
    } catch (err: any) {
      log.error("extract-file:error", { sessionId: req.params.id, error: err.message, stack: err instanceof Error ? err.stack : undefined });
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/session/:id/attachment/download", (req, res) => {
    const session = sessions.get(req.params.id);
    if (!session) return res.status(404).json({ error: "session not found" });

    const name = path.basename(req.query.name as string ?? "");
    if (!name) return res.status(400).json({ error: "name required" });

    const filePath = path.join(session.workspace_path, "attachments", name);
    log.info("attachment:serve", { sessionId: req.params.id, filePath });
    res.download(filePath, name, (err) => {
      if (err) log.error("attachment:serve-error", { filePath, error: err.message });
    });
  });

  app.get("/session/:id/workspace/download", (req, res) => {
    const session = sessions.get(req.params.id);
    if (!session) return res.status(404).json({ error: "session not found" });
    const filePath = resolveWorkspaceFilePath(session.workspace_path, String(req.query.filePath ?? ""));
    if (!filePath) return res.status(403).json({ error: "path outside workspace" });
    res.download(filePath, path.basename(filePath), (err) => {
      if (err) log.error("workspace:download-error", { filePath, error: err.message });
    });
  });

  app.get("/session/:id/workspace/file", (req, res) => {
    const session = sessions.get(req.params.id);
    if (!session) return res.status(404).json({ error: "session not found" });
    const filePath = resolveWorkspaceFilePath(session.workspace_path, String(req.query.filePath ?? ""));
    if (!filePath) return res.status(403).json({ error: "path outside workspace" });
    const name = path.basename(filePath);
    const inline = req.query.disposition !== "attachment";
    const ext = path.extname(name).toLowerCase();
    const contentType =
      ext === ".md" ? "text/markdown; charset=utf-8" : "text/plain; charset=utf-8";
    res.setHeader("Content-Type", contentType);
    res.setHeader(
      "Content-Disposition",
      `${inline ? "inline" : "attachment"}; filename="${name.replace(/"/g, "%22")}"`,
    );
    res.sendFile(filePath, (err) => {
      if (err) log.error("workspace:file-error", { filePath, error: err.message });
    });
  });

  // Render a Markdown report as a standalone, styled HTML page (shareable in a browser tab).
  app.get("/session/:id/report", async (req, res) => {
    const session = sessions.get(req.params.id);
    if (!session) return res.status(404).json({ error: "session not found" });
    const filePath = resolveWorkspaceFilePath(session.workspace_path, String(req.query.filePath ?? ""));
    if (!filePath) return res.status(403).json({ error: "path outside workspace" });
    if (path.extname(filePath).toLowerCase() !== ".md") {
      return res.status(400).json({ error: "only .md reports can be rendered" });
    }
    try {
      const md = await fs.readFile(filePath, "utf8");
      const html = DOMPurify.sanitize(await marked.parse(md));
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(renderReportPage(path.basename(filePath), html));
    } catch (err) {
      log.error("report:render-error", { filePath, error: (err as Error).message });
      res.status(404).json({ error: "report not found" });
    }
  });

  app.get("/session/:id/attachment/:attId/stream", async (req, res) => {
    const session = sessions.get(req.params.id);
    if (!session) return res.status(404).json({ error: "session not found" });

    const attName = req.query.attName as string;
    if (!attName) return res.status(400).json({ error: "attName required" });

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    const send = (data: object) => res.write(`data: ${JSON.stringify(data)}\n\n`);

    log.info("attachment:download", { sessionId: req.params.id, attId: req.params.attId, attName });
    try {
      const { filePath, extractedFiles } = await downloadAttachment(
        tracker,
        session.bug_id,
        req.params.attId,
        attName,
        session.workspace_path,
        (loaded, total) => send({ type: "progress", loaded, total })
      );
      // Downloading does not add files to agent context — the user selects
      // files explicitly via the file explorer checkboxes.
      log.info("attachment:saved", { filePath, extractedFiles: extractedFiles.length });
      send({ type: "done", filePath, extractedFiles });
    } catch (err: any) {
      log.error("attachment:download-error", { attId: req.params.attId, error: err.message });
      send({ type: "error", content: err.message });
    }
    res.end();
  });

  app.patch("/session/:id/files", (req, res) => {
    const session = sessions.get(req.params.id);
    if (!session) return res.status(404).json({ error: "session not found" });
    const { filePath, selected } = req.body;
    if (!filePath) return res.status(400).json({ error: "filePath required" });
    const resolved = path.resolve(String(filePath));
    if (!resolved.startsWith(path.resolve(session.workspace_path) + path.sep))
      return res.status(403).json({ error: "path outside workspace" });
    if (selected) sessions.addFile(req.params.id, resolved);
    else sessions.removeFile(req.params.id, resolved);
    res.json({ ok: true });
  });

  app.get("/session/:id/listen", (req, res) => {
    const session = sessions.get(req.params.id);
    if (!session) return res.status(404).json({ error: "session not found" });

    const user = users.getById(req.query.userId as string);
    if (!user) return res.status(400).json({ error: "invalid userId" });
    const clientId = (req.query.clientId as string) || randomUUID();

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    log.info("sse:connect", { sessionId: req.params.id, clientId, userName: user.name });
    addClient(req.params.id, { clientId, userName: user.name, sessionId: req.params.id, res });
    req.on("close", () => {
      log.info("sse:disconnect", { sessionId: req.params.id, clientId });
      removeClient(req.params.id, clientId);
    });
  });

  app.post("/session/:id/abort", async (req, res) => {
    const session = sessions.get(req.params.id);
    if (!session) return res.status(404).json({ error: "session not found" });
    const clineId = session.cline_session_id;
    if (!clineId) return res.status(400).json({ error: "no active agent session" });
    try {
      await runner.abort(clineId);
      log.info("agent:aborted", { sessionId: req.params.id, clineSessionId: clineId });
      res.json({ ok: true });
    } catch (err: any) {
      log.error("session:abort-error", { sessionId: req.params.id, error: err.message, stack: err instanceof Error ? err.stack : undefined });
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/session/:id/stop", async (req, res) => {
    const session = sessions.get(req.params.id);
    if (!session) return res.status(404).json({ error: "session not found" });
    if (!session.cline_session_id) return res.status(400).json({ error: "no active agent session" });
    try {
      await runner.stop(session.cline_session_id);
      sessions.clearClineSessionId(req.params.id);
      log.info("agent:stopped", { sessionId: req.params.id });
      res.json({ ok: true });
    } catch (err: any) {
      log.error("session:stop-error", { sessionId: req.params.id, error: err.message, stack: err instanceof Error ? err.stack : undefined });
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/session/:id/analyze", async (req, res) => {
    const session = sessions.get(req.params.id);
    if (!session) return res.status(404).json({ error: "session not found" });

    const question = req.query.question as string;
    if (!question) return res.status(400).json({ error: "question required" });
    const agentMode = req.query.mode === "plan" ? "plan" : "act";
    const rawSkills = (Array.isArray(req.query.skill) ? req.query.skill : [req.query.skill])
      .map((s) => (typeof s === "string" ? s.trim() : ""))
      .filter(Boolean);
    let selectedSkillNames: string[] = [];
    if (rawSkills.length > 0) {
      const known = await loadAgentSkills();
      const knownNames = new Set(known.map((s) => s.name));
      selectedSkillNames = [...new Set(rawSkills)].filter((s) => knownNames.has(s));
    }

    const user = users.getById(req.query.userId as string);
    if (!user) return res.status(400).json({ error: "userId required" });
    const clientId = (req.query.clientId as string) || randomUUID();

    if (activeAnalyses.has(req.params.id))
      return res.status(409).json({ error: "an analysis is already in progress for this session" });
    activeAnalyses.add(req.params.id);

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    // Snapshot prior turns BEFORE storing the current question — used by the
    // CLI runner for transcript injection (cline CLI has no native resume).
    const priorMessages = messages
      .list(req.params.id)
      .map((m) => ({ role: m.role, content: m.content }));

    const storedQuestion = selectedSkillNames.length
      ? `[skill:${selectedSkillNames.join(",")}]\n${question}`
      : question;
    messages.add(req.params.id, "user", storedQuestion, user.name);

    broadcast(req.params.id, { type: "user_message", content: question, skills: selectedSkillNames, user: user.name, clientId }, clientId);
    broadcast(req.params.id, { type: "analyzing", user: user.name, clientId }, clientId);

    let updatedSession = sessions.get(req.params.id)!;

    // Engine-switch reset: a session owned by a different engine than the
    // current global setting cannot be resumed — start fresh (lazy, per-session).
    const currentEngine = settings.getAgentEngine();
    if (updatedSession.cline_session_id) {
      const sessionEngine = unpackSessionId(updatedSession.cline_session_id).engine;
      if (sessionEngine !== currentEngine) {
        log.info("analyze:engine-switch-resets-session", {
          sessionId: req.params.id,
          from: sessionEngine,
          to: currentEngine,
        });
        sessions.clearClineSessionId(req.params.id);
        updatedSession = sessions.get(req.params.id)!;
      }
    }

    const effectiveModel = users.getPreferredModel(user.id) ?? settings.getLlmConfig().model;
    if (currentEngine === "cline-core" && updatedSession.last_model && updatedSession.last_model !== effectiveModel && updatedSession.cline_session_id) {
      log.info("analyze:model-switch-resets-session", {
        sessionId: req.params.id,
        from: updatedSession.last_model,
        to: effectiveModel,
      });
      sessions.clearClineSessionId(req.params.id);
      updatedSession = sessions.get(req.params.id)!;
    }
    sessions.setLastModel(req.params.id, effectiveModel);

    const questionLog = isLlmSanitizeEnabled() ? sanitizeForLlm(question).text : question;
    log.info("analyze:start", { sessionId: req.params.id, files: updatedSession.selected_files, question: questionLog.slice(0, 80), user: user.name, model: effectiveModel });
    const reportSnapshot = await snapshotAgentReportPaths(updatedSession.workspace_path);
    let fullResponse = "";

    try {
      for await (const event of runner.analyze({
        workspacePath: updatedSession.workspace_path,
        files: updatedSession.selected_files,
        question,
        clineSessionId: updatedSession.cline_session_id,
        mode: agentMode,
        modelOverride: effectiveModel,
        selectedSkillNames,
        priorMessages,
      })) {
        if (event.type === "session_id") {
          sessions.setClineSessionId(req.params.id, event.content);
        } else if (event.type === "text") {
          fullResponse += event.content;
          const payload = { type: "text", content: event.content, user: user.name, clientId };
          res.write(`data: ${JSON.stringify(payload)}\n\n`);
          broadcast(req.params.id, payload, clientId);
        } else if (event.type === "done") {
          log.info("analyze:done", { sessionId: req.params.id, responseLen: fullResponse.length });
          messages.add(req.params.id, "assistant", fullResponse, "Assistant");
          const reports = await listNewAgentReports(updatedSession.workspace_path, reportSnapshot);
          const payload = { type: "done", user: user.name, clientId, reports };
          res.write(`data: ${JSON.stringify(payload)}\n\n`);
          broadcast(req.params.id, payload, clientId);
          res.end();
          break;
        } else if (event.type === "error") {
          log.error("analyze:agent-error", { sessionId: req.params.id, error: event.content });
          messages.add(req.params.id, "assistant", `[Analysis error: ${event.content}]`, "Assistant");
          const payload = { type: "error", content: event.content, user: user.name, clientId };
          res.write(`data: ${JSON.stringify(payload)}\n\n`);
          broadcast(req.params.id, payload, clientId);
          res.end();
          break;
        } else if (event.type === "status") {
          const payload = { type: "status", content: event.content, user: user.name, clientId };
          res.write(`data: ${JSON.stringify(payload)}\n\n`);
          broadcast(req.params.id, payload, clientId);
        } else if (event.type === "tool_error") {
          const payload = { type: "tool_error", content: event.content, user: user.name, clientId };
          res.write(`data: ${JSON.stringify(payload)}\n\n`);
          broadcast(req.params.id, payload, clientId);
        } else if (event.type === "tool_command") {
          const payload = {
            type: "tool_command",
            commands: event.toolCommands ?? [],
            user: user.name,
            clientId,
          };
          res.write(`data: ${JSON.stringify(payload)}\n\n`);
          broadcast(req.params.id, payload, clientId);
        }
      }
    } catch (err: any) {
      log.error("analyze:exception", { sessionId: req.params.id, error: err.message, stack: err instanceof Error ? err.stack : undefined });
      messages.add(req.params.id, "assistant", `[Analysis error: ${err.message}]`, "Assistant");
      const payload = { type: "error", content: err.message, user: user.name, clientId };
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
      broadcast(req.params.id, payload, clientId);
      res.end();
    } finally {
      activeAnalyses.delete(req.params.id);
    }
  });

  app.get("/session/:id/lucky", async (req, res) => {
    if (!settings.getFeatureFlags().lucky) return res.status(403).json({ error: "Lucky analyzer is disabled" });
    const session = sessions.get(req.params.id);
    if (!session) return res.status(404).json({ error: "session not found" });
    if (!session.workspace_path) return res.status(400).json({ error: "no workspace loaded" });

    const user = users.getById(req.query.userId as string);
    if (!user) return res.status(400).json({ error: "userId required" });
    const clientId = (req.query.clientId as string) || randomUUID();

    if (activeAnalyses.has(req.params.id))
      return res.status(409).json({ error: "an analysis is already in progress for this session" });
    activeAnalyses.add(req.params.id);

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const writeLucky = (payload: object) => {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
      broadcast(req.params.id, payload, clientId);
    };
    const writeStatus = (content: string) => {
      writeLucky({ type: "status", content, user: user.name, clientId });
    };

    const lensSessionId = req.params.id;
    let clientDisconnected = false;
    req.on("close", () => {
      clientDisconnected = true;
    });

    writeStatus("[Lucky] Starting…");
    broadcast(req.params.id, { type: "analyzing", user: user.name, clientId, mode: "lucky" }, clientId);

    try {
      // Auto-download top-level bug attachments (not comment attachments — those can be 300+ MB)
      let bugJson: any = null;
      let luckyFiles: string[] = [];
      let luckyExtrasOnDisk = 0;
      try {
        bugJson = JSON.parse(await fs.readFile(path.join(session.workspace_path, "bug.json"), "utf8"));
      } catch { /* no bug.json — use user-selected_files for Lucky */ }

      if (bugJson && !clientDisconnected) {
        const maxLuckyAttachments = Number(process.env.MAX_LUCKY_ATTACHMENTS ?? 20);
        const allAttachments: any[] = bugJson.attachments ?? [];
        if (allAttachments.length > maxLuckyAttachments) {
          writeStatus(`[Lucky] ${allAttachments.length} attachments found — processing first ${maxLuckyAttachments} (set MAX_LUCKY_ATTACHMENTS to override).`);
        }
        const candidatePaths: string[] = [];
        for (const att of allAttachments.slice(0, maxLuckyAttachments)) {
          if (clientDisconnected) break;
          const attPath = path.join(session.workspace_path, "attachments", att.name);
          let downloaded = true;
          try { await fs.access(attPath); } catch {
            if (clientDisconnected) break;
            try {
              writeStatus(`[Lucky] Downloading ${att.name}...`);
              await downloadAttachment(tracker, session.bug_id, att.id, att.name, session.workspace_path);
            } catch (err: any) {
              writeStatus(`[Lucky] Skipping ${att.name}: ${err.message}`);
              downloaded = false;
            }
          }
          if (!downloaded) continue;
          if (att.name.endsWith(".zip")) {
            const extractBaseDir = path.join(session.workspace_path, "attachments", path.basename(att.name, ".zip"));
            try {
              const entries = await listZipContents(attPath, extractBaseDir);
              for (const entry of entries) {
                if (clientDisconnected) break;
                if (!entry.extracted) {
                  try {
                    writeStatus(`[Lucky] Extracting ${entry.innerPath}...`);
                    candidatePaths.push(await extractZipEntry(attPath, entry.innerPath, extractBaseDir));
                  } catch { /* skip bad entry */ }
                } else if (entry.filePath) {
                  candidatePaths.push(entry.filePath);
                }
              }
            } catch { /* skip unreadable zip */ }
          } else {
            candidatePaths.push(attPath);
          }
        }

        if (!clientDisconnected) {
          // Apply attachment-filter skill. Lucky sends ONLY `critical` files into the prompt;
          // anything else stays on disk for the agent to discover via shell if it needs more.
          // If `critical` is empty (skill missing or no critical globs match), fall back to
          // priority+useful so we never send zero files.
          const classified = await classifyBatch(candidatePaths, session.workspace_path);
          const criticalFiles = classified.filter((c) => isCritical(c.classification)).map((c) => c.absPath);
          const autoSelectFiles = classified.filter((c) => shouldAutoSelect(c.classification)).map((c) => c.absPath);
          if (criticalFiles.length > 0) {
            luckyFiles.push(...criticalFiles);
            luckyExtrasOnDisk = autoSelectFiles.length - criticalFiles.length;
          } else {
            luckyFiles.push(...autoSelectFiles);
            if (autoSelectFiles.length > 0) {
              writeStatus("[Lucky] No `critical` matches — falling back to priority+useful (consider tuning the attachment-filter skill).");
            }
          }
          const summary = summarizeBatch(classified);
          writeStatus(`[Lucky] Filter: prompting ${luckyFiles.length} of ${classified.length} files (critical ${summary.critical}, priority ${summary.priority}, useful ${summary.useful}, skipped ${summary.skip}, oversize ${summary.oversize}, other ${summary.other}).${luckyExtrasOnDisk > 0 ? ` ${luckyExtrasOnDisk} more on disk — agent can discover via shell.` : ""}`);
          log.info("lucky:filter", { sessionId: lensSessionId, candidates: classified.length, prompted: luckyFiles.length, extrasOnDisk: luckyExtrasOnDisk, ...summary });
          writeStatus("[Lucky] Comment attachments not auto-downloaded — add large log files manually via the file explorer if needed.");
        }
      }

      if (clientDisconnected) return;

      const updatedSession = sessions.get(lensSessionId)!;
      const filesForLucky = bugJson ? luckyFiles : updatedSession.selected_files;
      log.info("lucky:start", { sessionId: lensSessionId, files: filesForLucky });
      const luckyStartedAt = Date.now();

      // 🎲 Lucky always starts a fresh Cline session: runLucky passes no
      // clineSessionId, and the new session_id event below overwrites any prior
      // one in the DB. We deliberately do NOT clear cline_session_id up front —
      // that would open a window where Stop/abort finds no session.
      messages.add(lensSessionId, "user", "🎲 I'm Feeling Lucky — finding root cause automatically...", user.name);
      const reportSnapshot = await snapshotAgentReportPaths(updatedSession.workspace_path);
      let fullResponse = "";

      const effectiveModel = users.getPreferredModel(user.id) ?? settings.getLlmConfig().model;
      sessions.setLastModel(lensSessionId, effectiveModel);
      for await (const event of runLucky(
        runner,
        { workspace_path: updatedSession.workspace_path, selected_files: filesForLucky },
        effectiveModel,
        luckyExtrasOnDisk > 0
          ? { count: luckyExtrasOnDisk, attachmentsRoot: path.join(updatedSession.workspace_path, "attachments") }
          : undefined
      )) {
        if (event.type === "session_id") {
          // Persist like a normal session so the user can resume this Lucky
          // thread with follow-up messages via the /analyze route.
          sessions.setClineSessionId(lensSessionId, event.content);
          continue;
        }
        if (event.type === "text") {
          fullResponse += event.content;
          writeLucky({ type: "text", content: event.content, user: user.name, clientId });
        } else if (event.type === "done") {
          log.info("lucky:done", { sessionId: req.params.id, durationMs: Date.now() - luckyStartedAt, responseLen: fullResponse.length });
          const bubbleText = fullResponse || "[Lucky analysis produced no output]";
          messages.add(req.params.id, "assistant", bubbleText);
          const reports = await listNewAgentReports(updatedSession.workspace_path, reportSnapshot);
          writeLucky({ type: "done", user: user.name, clientId, reports });
          break;
        } else if (event.type === "error") {
          messages.add(req.params.id, "assistant", `[Analysis error: ${event.content}]`);
          writeLucky({ type: "error", content: event.content, user: user.name, clientId });
          break;
        } else if (event.type === "status") {
          writeLucky({ type: "status", content: event.content, user: user.name, clientId });
        } else if (event.type === "tool_error") {
          writeLucky({ type: "tool_error", content: event.content, user: user.name, clientId });
        } else if (event.type === "tool_command") {
          writeLucky({
            type: "tool_command",
            commands: event.toolCommands ?? [],
            user: user.name,
            clientId,
          });
        }
      }
    } catch (err: any) {
      log.error("lucky:exception", { sessionId: lensSessionId, error: err.message, stack: err instanceof Error ? err.stack : undefined });
      messages.add(lensSessionId, "assistant", `[Analysis error: ${err.message}]`);
      writeLucky({ type: "error", content: err.message, user: user.name, clientId });
    } finally {
      activeAnalyses.delete(lensSessionId);
      if (!res.writableEnded) res.end();
    }
  });

  // ── Wiki routes ──────────────────────────────────────────────────────────────

  // Synthesizes a wiki entry from a session transcript via the LLM and writes it.
  // Throws Error on any failure; the caller maps that to an SSE error event.
  async function synthesizeWiki(
    session: NonNullable<ReturnType<typeof sessions.get>>,
    rawModule: string,
    rawTitle: string
  ): Promise<WikiEntry> {
    const transcript = messages.buildSummary(session.id);
    if (!transcript) throw new Error("no messages to synthesize");

    // Load bug comments from workspace
    let bugComments = "";
    try {
      const bugJson = JSON.parse(await fs.readFile(path.join(session.workspace_path, "bug.json"), "utf8"));
      bugComments = (bugJson.comments ?? [])
        .map((c: any) => `${c.author} [${c.created_at}]: ${c.body}`)
        .join("\n");
    } catch (err: any) {
      log.debug("wiki:bug-comments-missing", { sessionId: session.id, error: err.message, stack: err.stack });
    }

    let transcriptForLlm = transcript;
    let bugCommentsForLlm = bugComments;
    if (isLlmSanitizeEnabled()) {
      transcriptForLlm = sanitizeForLlm(transcript).text;
      bugCommentsForLlm = sanitizeForLlm(bugComments).text;
    }

    const llmCfg = settings.getLlmConfig();
    const baseUrl = llmCfg.provider === "openai"
      ? "https://api.openai.com/v1"
      : (llmCfg.baseUrl ?? "");
    if (!baseUrl) throw new Error("LLM baseUrl not configured");

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (llmCfg.apiKey) headers["Authorization"] = `Bearer ${llmCfg.apiKey}`;

    let llmRes: Response;
    try {
      llmRes = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: llmCfg.model,
          stream: false,
          messages: [{ role: "user", content: await buildWikiSynthesisPrompt(transcriptForLlm, bugCommentsForLlm, session.bug_id, rawModule) }],
        }),
      });
    } catch (err: any) {
      log.error("wiki:llm-unreachable", { sessionId: session.id, error: err.message, stack: err instanceof Error ? err.stack : undefined });
      throw new Error(`LLM unreachable: ${err.message}`);
    }

    if (!llmRes.ok) {
      const txt = await llmRes.text().catch(() => "");
      log.error("wiki:llm-error", { status: llmRes.status, body: txt.slice(0, 200) });
      throw new Error(`LLM returned ${llmRes.status}`);
    }

    const data = await llmRes.json() as any;
    const llmOutput: string = data.choices?.[0]?.message?.content ?? "";
    if (!llmOutput.trim()) throw new Error("LLM returned empty response");

    // Extract title from first H1 if user didn't supply one
    const titleFromLlm = llmOutput.match(/^#\s+(.+)/m)?.[1]?.trim() ?? `Bug ${session.bug_id}`;
    const title = rawTitle || titleFromLlm;

    // Extract tags from frontmatter in LLM output
    const tagsRaw = llmOutput.match(/^tags:\s*(.+)/m)?.[1] ?? "";
    const tags = tagsRaw.split(",").map((t: string) => t.trim()).filter(Boolean);

    // Extract summary line (last line of LLM output)
    const oneLiner = llmOutput.match(/^summary:\s*(.+)/m)?.[1]?.trim() ?? title;

    const entry = await createWikiEntry({ module: rawModule, title, bugId: session.bug_id, tags, body: llmOutput, oneLiner });
    log.info("wiki:created", { path: entry.path, module: entry.moduleSlug, bugId: session.bug_id });
    return entry;
  }

  // SSE: synthesize a wiki entry in the background. The frontend keeps this
  // stream open in a global store so the banner survives modal close / nav.
  app.get("/session/:id/wiki/synthesize", async (req, res) => {
    const session = sessions.get(req.params.id);
    if (!session) return res.status(404).json({ error: "session not found" });

    const rawModule = String(req.query.module ?? "").trim();
    if (!rawModule) return res.status(400).json({ error: "module required" });
    const rawTitle = String(req.query.title ?? "").trim();

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    const send = (obj: unknown) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

    send({ type: "status", content: "Synthesizing wiki entry…" });
    try {
      const entry = await synthesizeWiki(session, rawModule, rawTitle);
      send({ type: "done", entry: { moduleSlug: entry.moduleSlug, filename: entry.filename, path: entry.path, title: entry.title } });
    } catch (err: any) {
      log.error("wiki:synthesize-error", { sessionId: req.params.id, error: err.message });
      send({ type: "error", content: err.message ?? "Wiki synthesis failed" });
    }
    res.end();
  });

  app.get("/skills", async (_req, res) => {
    try {
      if (!skillsCache || Date.now() - skillsCacheAt > SKILLS_CACHE_TTL_MS) {
        const skills = await loadAgentSkills();
        skillsCache = skills.map(({ name, description, frontmatter }) => ({
          name,
          description: description ?? "",
          triggers: Array.isArray(frontmatter?.triggers) ? (frontmatter.triggers as string[]) : [],
        }));
        skillsCacheAt = Date.now();
      }
      res.json(skillsCache);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/wiki", async (_req, res) => {
    if (!settings.getFeatureFlags().wiki) return res.status(403).json({ error: "Wiki is disabled" });
    try {
      const entries = await listWikiEntries();
      res.json({ entries });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/wiki/:module", async (req, res) => {
    if (!settings.getFeatureFlags().wiki) return res.status(403).json({ error: "Wiki is disabled" });
    try {
      const all = await listWikiEntries();
      const filtered = all.filter((e) => e.moduleSlug === req.params.module);
      if (!filtered.length) return res.status(404).json({ error: "module not found" });
      res.json({ entries: filtered });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/wiki/:module/:filename", async (req, res) => {
    if (!settings.getFeatureFlags().wiki) return res.status(403).json({ error: "Wiki is disabled" });
    const { module: moduleSlug, filename } = req.params;
    if (!filename.endsWith(".md")) return res.status(400).json({ error: "filename must end in .md" });
    try {
      const content = await readWikiEntry(moduleSlug, filename);
      // ?render=html → styled standalone page (used by the wiki banner's
      // "View entry" link); otherwise raw markdown as JSON for the SPA.
      if (req.query.render === "html") {
        const titleMatch = content.match(/^#\s+(.+)/m);
        const bodyHtml = DOMPurify.sanitize(await marked.parse(content));
        return res
          .type("html")
          .send(renderReportPage(titleMatch?.[1]?.trim() ?? filename, bodyHtml));
      }
      res.json({ entry: { moduleSlug, filename, content } });
    } catch (err: any) {
      if (err.code === "ENOENT") return res.status(404).json({ error: "entry not found" });
      if (err.code === "EACCES") return res.status(404).json({ error: "not found" });
      res.status(500).json({ error: err.message });
    }
  });

  // ── Settings routes ───────────────────────────────────────────────────────────

  app.post("/settings/llm/models", async (req, res) => {
    const { pin, provider, baseUrl, apiKey } = req.body;
    if (!provider) return res.status(400).json({ error: "provider required" });

    // PIN-gated: this route fetches a caller-supplied baseUrl and may fall back
    // to the stored API key — without a gate that leaks the key to any host.
    if (!pin) return res.status(400).json({ error: "pin required" });
    const storedPin = settings.getAdminPinHash();
    if (!storedPin) return res.status(503).json({ error: "Admin PIN not configured — set ADMIN_PIN in .env" });
    if (!(await verifyPin(String(pin), storedPin))) return res.status(401).json({ error: "Invalid PIN" });

    const url =
      provider === "openai"
        ? "https://api.openai.com/v1/models"
        : baseUrl
          ? `${baseUrl}/models`
          : null;

    if (!url) return res.status(400).json({ error: "baseUrl required" });

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      const resolvedApiKey = apiKey?.trim() || settings.getLlmConfig().apiKey;
      if (resolvedApiKey) headers["Authorization"] = `Bearer ${resolvedApiKey}`;
      const upstream = await fetch(url, { headers });
      if (!upstream.ok) return res.status(502).json({ error: `Provider returned ${upstream.status}` });
      const data: any = await upstream.json();
      const models: string[] = (data.data ?? []).map((m: any) => String(m.id)).sort();
      res.json({ models });
    } catch (err: any) {
      log.warn("settings:models-fetch-error", { url, error: err.message });
      res.status(502).json({ error: err.message });
    }
  });

  // 30s cache for upstream model list (per provider+baseUrl key)
  let modelListCache: { key: string; models: string[]; fetchedAt: number } | null = null;

  app.get("/settings/llm/models", async (_req, res) => {
    const cfg = settings.getLlmConfig();
    const url =
      cfg.provider === "openai"
        ? "https://api.openai.com/v1/models"
        : cfg.baseUrl
          ? `${cfg.baseUrl}/models`
          : null;
    if (!url) return res.status(400).json({ error: "baseUrl not configured" });

    const cacheKey = `${cfg.provider}|${url}`;
    if (modelListCache && modelListCache.key === cacheKey && Date.now() - modelListCache.fetchedAt < 30_000) {
      return res.json({ models: modelListCache.models });
    }

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (cfg.apiKey) headers["Authorization"] = `Bearer ${cfg.apiKey}`;
      const upstream = await fetch(url, { headers });
      if (!upstream.ok) return res.status(502).json({ error: `Provider returned ${upstream.status}` });
      const data: any = await upstream.json();
      const models: string[] = (data.data ?? []).map((m: any) => String(m.id)).sort();
      modelListCache = { key: cacheKey, models, fetchedAt: Date.now() };
      res.json({ models });
    } catch (err: any) {
      log.warn("settings:models-fetch-error", { url, error: err.message });
      res.status(502).json({ error: err.message });
    }
  });

  app.get("/settings/user/model", (req, res) => {
    const userId = req.query.userId as string | undefined;
    if (!userId) return res.status(400).json({ error: "userId required" });
    const user = users.getById(userId);
    if (!user) return res.status(404).json({ error: "user not found" });
    res.json({ model: users.getPreferredModel(userId) });
  });

  app.put("/settings/user/model", (req, res) => {
    const { userId, model } = req.body ?? {};
    if (!userId) return res.status(400).json({ error: "userId required" });
    const user = users.getById(String(userId));
    if (!user) return res.status(404).json({ error: "user not found" });
    if (model !== null && typeof model !== "string")
      return res.status(400).json({ error: "model must be a string or null" });
    const next = typeof model === "string" && model.trim() ? model.trim() : null;
    users.setPreferredModel(String(userId), next);
    log.info("settings:user-model-updated", { userId, model: next });
    res.json({ model: next });
  });

  app.get("/settings/llm", (_req, res) => {
    const cfg = settings.getLlmConfig();
    const agent = settings.getAgentSettings();
    const out = {
      ...cfg,
      maxIterations: agent.maxIterations,
      systemPromptSource: agent.systemPromptSource,
      engine: agent.engine,
      cliCommand: agent.cliCommand,
      cliInjectHistory: agent.cliInjectHistory,
    } as any;
    if (out.apiKey) out.apiKey = "••••" + out.apiKey.slice(-4);
    res.json(out);
  });

  app.put("/settings/llm", async (req, res) => {
    const { pin, provider, model, baseUrl, apiKey, maxIterations, systemPromptSource, engine, cliCommand, cliInjectHistory } = req.body;
    if (!pin) return res.status(400).json({ error: "pin required" });
    if (!provider || !model) return res.status(400).json({ error: "provider and model required" });

    const stored = settings.getAdminPinHash();
    if (!stored) return res.status(503).json({ error: "Admin PIN not configured — set ADMIN_PIN in .env" });
    if (!(await verifyPin(String(pin), stored))) return res.status(401).json({ error: "Invalid PIN" });

    const existing = settings.getLlmConfig();
    const resolvedApiKey =
      typeof apiKey === "string" && apiKey.trim() ? apiKey.trim() : existing.apiKey;

    if (provider === "openai" && !resolvedApiKey)
      return res.status(400).json({ error: "apiKey required for OpenAI" });
    if ((provider === "openai-compatible" || provider === "ollama") && !baseUrl)
      return res.status(400).json({ error: "baseUrl required" });

    const agentPartial: {
      maxIterations?: number;
      systemPromptSource?: "lens" | "cline";
      engine?: "cline-core" | "cli";
      cliCommand?: string;
      cliInjectHistory?: boolean;
    } = {};
    if (maxIterations !== undefined) {
      const n = Number(maxIterations);
      if (!Number.isInteger(n) || n < 1 || n > 100)
        return res.status(400).json({ error: "maxIterations must be an integer between 1 and 100" });
      agentPartial.maxIterations = n;
    }
    if (systemPromptSource !== undefined) {
      if (systemPromptSource !== "lens" && systemPromptSource !== "cline")
        return res.status(400).json({ error: "systemPromptSource must be lens or cline" });
      agentPartial.systemPromptSource = systemPromptSource;
    }
    if (engine !== undefined) {
      if (engine !== "cline-core" && engine !== "cli")
        return res.status(400).json({ error: "engine must be cline-core or cli" });
      agentPartial.engine = engine;
    }
    if (cliCommand !== undefined) {
      if (typeof cliCommand !== "string" || !cliCommand.trim())
        return res.status(400).json({ error: "cliCommand must be a non-empty string" });
      agentPartial.cliCommand = cliCommand.trim();
    }
    if (cliInjectHistory !== undefined) {
      if (typeof cliInjectHistory !== "boolean")
        return res.status(400).json({ error: "cliInjectHistory must be a boolean" });
      agentPartial.cliInjectHistory = cliInjectHistory;
    }
    if (engine === "cli") {
      const effectiveCliCommand = agentPartial.cliCommand ?? settings.getAgentSettings().cliCommand;
      if (!effectiveCliCommand)
        return res.status(400).json({ error: "cliCommand required when engine is cli" });
    }
    if (Object.keys(agentPartial).length > 0) settings.setAgentSettings(agentPartial);

    const cfg: LlmConfig = { provider, model, baseUrl, apiKey: resolvedApiKey };
    settings.setLlmConfig(cfg);
    log.info("settings:llm-updated", { provider, model });

    const agent = settings.getAgentSettings();
    const out = {
      ...cfg,
      maxIterations: agent.maxIterations,
      systemPromptSource: agent.systemPromptSource,
      engine: agent.engine,
      cliCommand: agent.cliCommand,
      cliInjectHistory: agent.cliInjectHistory,
    } as any;
    if (out.apiKey) out.apiKey = "••••" + out.apiKey.slice(-4);
    res.json(out);
  });

  app.get("/settings/skills", (_req, res) => {
    const env = settings.getEnvSkillsDirs();
    const extra = settings.getExtraSkillsDirs();
    res.json({
      dirs: extra,
      env,
      extra,
      configured: settings.getSkillsDirs(),
    });
  });

  app.put("/settings/skills", async (req, res) => {
    const { pin, dirs } = req.body;
    if (!pin) return res.status(400).json({ error: "pin required" });
    if (!Array.isArray(dirs) || dirs.some((d) => typeof d !== "string"))
      return res.status(400).json({ error: "dirs must be an array of strings" });
    if (dirs.some((d) => !d.startsWith("/")))
      return res.status(400).json({ error: "all dirs must be absolute paths" });

    const stored = settings.getAdminPinHash();
    if (!stored) return res.status(503).json({ error: "Admin PIN not configured — set ADMIN_PIN in .env" });
    if (!(await verifyPin(String(pin), stored))) return res.status(401).json({ error: "Invalid PIN" });

    for (const dir of dirs) {
      try {
        await fs.stat(dir);
      } catch {
        return res.status(400).json({ error: `directory not found: ${dir}` });
      }
    }

    settings.setSkillsDirs(dirs);
    skillsCache = null;
    res.json({ dirs });
  });

  app.get("/settings/features", (_req, res) => {
    res.json({ flags: settings.getFeatureFlags() });
  });

  app.put("/settings/features", async (req, res) => {
    const { pin, flags } = req.body;
    if (!pin) return res.status(400).json({ error: "pin required" });
    if (!flags || typeof flags !== "object") return res.status(400).json({ error: "flags object required" });

    const stored = settings.getAdminPinHash();
    if (!stored) return res.status(503).json({ error: "Admin PIN not configured — set ADMIN_PIN in .env" });
    if (!(await verifyPin(String(pin), stored))) return res.status(401).json({ error: "Invalid PIN" });

    const current = settings.getFeatureFlags();
    const updated = { ...current, ...flags };
    settings.setFeatureFlags(updated);
    res.json({ flags: updated });
  });

  app.put("/settings/admin/pin", async (req, res) => {
    const { currentPin, newPin } = req.body;
    if (!currentPin || !newPin) return res.status(400).json({ error: "currentPin and newPin required" });

    const stored = settings.getAdminPinHash();
    if (!stored) return res.status(503).json({ error: "Admin PIN not configured — set ADMIN_PIN in .env" });
    if (!(await verifyPin(String(currentPin), stored))) return res.status(401).json({ error: "Invalid PIN" });

    settings.setAdminPinHash(await hashPin(String(newPin)));
    log.info("settings:pin-changed");
    res.json({ ok: true });
  });

  // SPA fallback: any unmatched GET that wants HTML gets the React app shell,
  // so client-side routes (/session/:id, /login) survive a hard refresh.
  // Registered after every API route so it never shadows them.
  if (hasReactBuild) {
    app.get("*", (req, res, next) => {
      if (!req.accepts("html")) return next();
      res.sendFile(path.join(reactDist, "index.html"));
    });
  }

  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err.code === "LIMIT_FILE_SIZE") {
      const mb = Math.round(MAX_UPLOAD_BYTES / 1024 / 1024);
      return res.status(413).json({ error: `File too large — max ${mb} MB. Please zip your files.` });
    }
    res.status(500).json({ error: err.message ?? "Internal error" });
  });

  return app;
}
