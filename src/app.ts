import express from "express";
import path from "path";
import fs from "node:fs/promises";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "url";
import { createHash, randomUUID, scrypt, randomBytes, timingSafeEqual } from "crypto";
import type { BugTracker } from "./services/bugTracker.js";
import { getOrCreateWorkspace, downloadAttachment, saveBugSummary, listZipContents, extractZipEntry, saveAdHocFiles } from "./services/attachmentService.js";
import multer from "multer";
import { buildVirtualTree } from "./services/workspaceExplorer.js";
import type { AgentRunner } from "./agent/agentRunner.js";
import { sessions, messages, users, settings } from "./db.js";
import type { LlmConfig } from "./db.js";
import { addClient, removeClient, broadcast } from "./broadcast.js";
import { createWikiEntry, listWikiEntries, readWikiEntry, buildWikiSynthesisPrompt } from "./services/wikiService.js";
import { loadAgentSkills } from "./agent/agentPrompt.js";
import { runLucky } from "./agent/luckyAnalyzer.js";
import { log } from "./logger.js";
import { isLlmSanitizeEnabled, sanitizeForLlm } from "./services/llmSanitize.js";
import { classifyBatch, shouldAutoSelect, summarizeBatch } from "./services/attachmentFilter.js";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

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

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp(tracker: BugTracker, runner: AgentRunner): express.Application {
  const app = express();
  app.use(express.json());

  const MAX_UPLOAD_BYTES = parseInt(process.env.UPLOAD_SIZE_LIMIT_MB ?? "500") * 1024 * 1024;

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

  app.use(express.static(path.join(__dirname, "../static")));

  app.post("/auth", (req, res) => {
    const { name, pin } = req.body;
    if (!name || !pin) return res.status(400).json({ error: "name and pin required" });

    const pinHash = sha256(String(pin));
    const trimmed = String(name).trim().slice(0, 50);
    const existing = users.getByName(trimmed);

    if (!existing) {
      const user = users.create(trimmed, pinHash);
      return res.json(user);
    }
    if (existing.pin_hash !== pinHash) {
      return res.status(401).json({ error: "Wrong PIN for that name" });
    }
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

    log.info("session:create", { bugId });
    const bug = await tracker.getBug(bugId);
    log.debug("bug:fetched", { bugId, title: bug.title, attachments: bug.attachments.length });

    const existing = sessions.findActiveByBugId(bugId);
    if (existing) {
      await saveBugSummary(existing.workspace_path, bug);
      log.info("session:reused", { sessionId: existing.id });
      const downloaded_files = await listDownloadedAttachmentPaths(existing.workspace_path);
      return res.json({ session: existing, bug, downloaded_files });
    }

    const workspacePath = await getOrCreateWorkspace(bugId);
    await saveBugSummary(workspacePath, bug);
    const session = sessions.create(bugId, workspacePath);
    log.info("session:created", { sessionId: session.id, workspace: workspacePath });
    const downloaded_files = await listDownloadedAttachmentPaths(workspacePath);
    res.json({ session, bug, downloaded_files });
  });

  app.get("/sessions", (req, res) => {
    const ids = (req.query.ids as string | undefined)?.split(",").filter(Boolean) ?? [];
    res.json(sessions.listByIds(ids));
  });

  app.get("/session/:id", async (req, res) => {
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
    const zipPath = path.resolve(String(req.query.zipPath ?? ""));
    if (!zipPath.startsWith(path.resolve(session.workspace_path) + path.sep))
      return res.status(403).json({ error: "path outside workspace" });
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
    const resolvedZip = path.resolve(String(zipPath));
    if (!resolvedZip.startsWith(path.resolve(session.workspace_path) + path.sep))
      return res.status(403).json({ error: "path outside workspace" });
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
    const filePath = path.resolve(String(req.query.filePath ?? ""));
    if (!filePath.startsWith(path.resolve(session.workspace_path) + path.sep))
      return res.status(403).json({ error: "path outside workspace" });
    res.download(filePath, path.basename(filePath), (err) => {
      if (err) log.error("workspace:download-error", { filePath, error: err.message });
    });
  });

  app.post("/session/:id/attachment/:attId", async (req, res) => {
    const session = sessions.get(req.params.id);
    if (!session) return res.status(404).json({ error: "session not found" });

    const { attName } = req.body;
    if (!attName) return res.status(400).json({ error: "attName required" });

    log.info("attachment:download", { sessionId: req.params.id, attId: req.params.attId, attName });
    const { filePath, extractedFiles } = await downloadAttachment(
      tracker,
      session.bug_id,
      req.params.attId,
      attName,
      session.workspace_path
    );
    // Auto-select via attachment-filter skill (priority/useful only).
    const classified = await classifyBatch([filePath, ...extractedFiles], session.workspace_path);
    const autoAdded: string[] = [];
    for (const c of classified) {
      if (shouldAutoSelect(c.classification)) {
        sessions.addFile(req.params.id, c.absPath);
        autoAdded.push(c.relPath);
      }
    }
    log.info("attachment:saved", { filePath, extractedFiles: extractedFiles.length, autoSelected: autoAdded.length });
    res.json({ filePath, extractedFiles, autoSelected: autoAdded });
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
    if (!session.cline_session_id) return res.status(400).json({ error: "no active agent session" });
    try {
      await runner.abort(session.cline_session_id);
      log.info("agent:aborted", { sessionId: req.params.id, clineSessionId: session.cline_session_id });
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

    const user = users.getById(req.query.userId as string);
    if (!user) return res.status(400).json({ error: "userId required" });
    const clientId = (req.query.clientId as string) || randomUUID();

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    messages.add(req.params.id, "user", question, user.name);

    broadcast(req.params.id, { type: "user_message", content: question, user: user.name, clientId }, clientId);
    broadcast(req.params.id, { type: "analyzing", user: user.name, clientId }, clientId);

    const updatedSession = sessions.get(req.params.id)!;

    const questionLog = isLlmSanitizeEnabled() ? sanitizeForLlm(question).text : question;
    log.info("analyze:start", { sessionId: req.params.id, files: updatedSession.selected_files, question: questionLog.slice(0, 80), user: user.name });
    let fullResponse = "";

    try {
      for await (const event of runner.analyze({
        workspacePath: updatedSession.workspace_path,
        files: updatedSession.selected_files,
        question,
        clineSessionId: updatedSession.cline_session_id,
        mode: agentMode,
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
          const payload = { type: "done", user: user.name, clientId };
          res.write(`data: ${JSON.stringify(payload)}\n\n`);
          broadcast(req.params.id, payload, clientId);
          res.end();
        } else if (event.type === "error") {
          log.error("analyze:agent-error", { sessionId: req.params.id, error: event.content });
          messages.add(req.params.id, "assistant", `[Analysis error: ${event.content}]`, "Assistant");
          const payload = { type: "error", content: event.content, user: user.name, clientId };
          res.write(`data: ${JSON.stringify(payload)}\n\n`);
          broadcast(req.params.id, payload, clientId);
          res.end();
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
    }
  });

  app.get("/session/:id/lucky", async (req, res) => {
    if (!settings.getFeatureFlags().lucky) return res.status(403).json({ error: "Lucky analyzer is disabled" });
    const session = sessions.get(req.params.id);
    if (!session) return res.status(404).json({ error: "session not found" });
    if (!session.workspace_path) return res.status(400).json({ error: "no workspace loaded" });
    const mode: "act" | "yolo" = req.query.mode === "yolo" ? "yolo" : "act";

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    broadcast(req.params.id, { type: "analyzing", mode: "lucky" }, undefined);

    // Auto-download top-level bug attachments (not comment attachments — those can be 300+ MB)
    let bugJson: any = null;
    try {
      bugJson = JSON.parse(await fs.readFile(path.join(session.workspace_path, "bug.json"), "utf8"));
    } catch { /* no bug.json — proceed with existing selected_files */ }

    if (bugJson) {
      const maxLuckyAttachments = Number(process.env.MAX_LUCKY_ATTACHMENTS ?? 20);
      const allAttachments: any[] = bugJson.attachments ?? [];
      if (allAttachments.length > maxLuckyAttachments) {
        res.write(`data: ${JSON.stringify({ type: "status", content: `[Lucky] ${allAttachments.length} attachments found — processing first ${maxLuckyAttachments} (set MAX_LUCKY_ATTACHMENTS to override).` })}\n\n`);
      }
      const candidatePaths: string[] = [];
      for (const att of allAttachments.slice(0, maxLuckyAttachments)) {
        const attPath = path.join(session.workspace_path, "attachments", att.name);
        let downloaded = true;
        try { await fs.access(attPath); } catch {
          try {
            res.write(`data: ${JSON.stringify({ type: "status", content: `[Lucky] Downloading ${att.name}...` })}\n\n`);
            await downloadAttachment(tracker, session.bug_id, att.id, att.name, session.workspace_path);
          } catch (err: any) {
            res.write(`data: ${JSON.stringify({ type: "status", content: `[Lucky] Skipping ${att.name}: ${err.message}` })}\n\n`);
            downloaded = false;
          }
        }
        if (!downloaded) continue;
        if (att.name.endsWith(".zip")) {
          const extractBaseDir = path.join(session.workspace_path, "attachments", path.basename(att.name, ".zip"));
          try {
            const entries = await listZipContents(attPath, extractBaseDir);
            for (const entry of entries) {
              if (!entry.extracted) {
                try {
                  res.write(`data: ${JSON.stringify({ type: "status", content: `[Lucky] Extracting ${entry.innerPath}...` })}\n\n`);
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

      // Apply attachment-filter skill — keep priority/useful, drop skip/oversize.
      const classified = await classifyBatch(candidatePaths, session.workspace_path);
      for (const c of classified) {
        if (shouldAutoSelect(c.classification)) sessions.addFile(req.params.id, c.absPath);
      }
      const summary = summarizeBatch(classified);
      res.write(`data: ${JSON.stringify({ type: "status", content: `[Lucky] Filter: kept ${summary.kept} of ${classified.length} files (priority ${summary.priority}, useful ${summary.useful}, skipped noise ${summary.skip}, oversize ${summary.oversize}, other ${summary.other}). Override via file explorer.` })}\n\n`);
      log.info("lucky:filter", { sessionId: req.params.id, candidates: classified.length, ...summary });
      res.write(`data: ${JSON.stringify({ type: "status", content: "[Lucky] Comment attachments not auto-downloaded — add large log files manually via the file explorer if needed." })}\n\n`);
    }

    const updatedSession = sessions.get(req.params.id)!;
    log.info("lucky:start", { sessionId: req.params.id, mode, files: updatedSession.selected_files });
    const luckyStartedAt = Date.now();

    messages.add(req.params.id, "user", `[Lucky:${mode}] Automated root cause analysis`);
    let fullResponse = "";

    try {
      for await (const event of runLucky(runner, updatedSession, mode)) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
        broadcast(req.params.id, event, undefined);
        if (event.type === "text") {
          fullResponse += event.content;
        } else if (event.type === "done") {
          log.info("lucky:done", { sessionId: req.params.id, mode, durationMs: Date.now() - luckyStartedAt, responseLen: fullResponse.length });
          if (fullResponse) {
            const reportName = `lucky-${mode}-${new Date().toISOString().replace(/[:.]/g, "-")}.md`;
            const reportPath = path.join(updatedSession.workspace_path, "agent_notes", reportName);
            try {
              await fs.writeFile(reportPath, fullResponse);
              log.info("lucky:report-saved", { reportPath });
            } catch (writeErr: any) {
              log.error("lucky:report-write-error", { reportPath, error: writeErr.message });
            }
          }
          messages.add(req.params.id, "assistant", fullResponse || "[Lucky analysis produced no output]");
          break;
        } else if (event.type === "error") {
          messages.add(req.params.id, "assistant", `[Analysis error: ${event.content}]`);
          break;
        }
      }
    } catch (err: any) {
      log.error("lucky:exception", { sessionId: req.params.id, error: err.message, stack: err instanceof Error ? err.stack : undefined });
      messages.add(req.params.id, "assistant", `[Analysis error: ${err.message}]`);
      const payload = { type: "error", content: err.message };
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    }

    res.end();
  });

  // ── Wiki routes ──────────────────────────────────────────────────────────────

  app.post("/session/:id/wiki", async (req, res) => {
    const session = sessions.get(req.params.id);
    if (!session) return res.status(404).json({ error: "session not found" });

    const rawModule = String(req.body.module ?? "").trim();
    if (!rawModule) return res.status(400).json({ error: "module required" });
    const rawTitle = String(req.body.title ?? "").trim();

    const transcript = messages.buildSummary(req.params.id);
    if (!transcript) return res.status(400).json({ error: "no messages to synthesize" });

    // Load bug comments from workspace
    let bugComments = "";
    try {
      const { readFile } = await import("fs/promises");
      const bugJson = JSON.parse(await readFile(path.join(session.workspace_path, "bug.json"), "utf8"));
      bugComments = (bugJson.comments ?? [])
        .map((c: any) => `${c.author} [${c.created_at}]: ${c.body}`)
        .join("\n");
    } catch (err: any) {
      log.debug("wiki:bug-comments-missing", { sessionId: req.params.id, error: err.message, stack: err.stack });
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
    if (!baseUrl) return res.status(400).json({ error: "LLM baseUrl not configured" });

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
          temperature: 0.3,
          messages: [{ role: "user", content: await buildWikiSynthesisPrompt(transcriptForLlm, bugCommentsForLlm, session.bug_id, rawModule) }],
        }),
      });
    } catch (err: any) {
      log.error("wiki:llm-unreachable", { sessionId: req.params.id, error: err.message, stack: err instanceof Error ? err.stack : undefined });
      return res.status(502).json({ error: `LLM unreachable: ${err.message}` });
    }

    if (!llmRes.ok) {
      const txt = await llmRes.text().catch(() => "");
      log.error("wiki:llm-error", { status: llmRes.status, body: txt.slice(0, 200) });
      return res.status(502).json({ error: `LLM returned ${llmRes.status}` });
    }

    const data = await llmRes.json() as any;
    const llmOutput: string = data.choices?.[0]?.message?.content ?? "";
    if (!llmOutput.trim()) return res.status(502).json({ error: "LLM returned empty response" });

    // Extract title from first H1 if user didn't supply one
    const titleFromLlm = llmOutput.match(/^#\s+(.+)/m)?.[1]?.trim() ?? `Bug ${session.bug_id}`;
    const title = rawTitle || titleFromLlm;

    // Extract tags from frontmatter in LLM output
    const tagsRaw = llmOutput.match(/^tags:\s*(.+)/m)?.[1] ?? "";
    const tags = tagsRaw.split(",").map((t: string) => t.trim()).filter(Boolean);

    // Extract summary line (last line of LLM output)
    const oneLiner = llmOutput.match(/^summary:\s*(.+)/m)?.[1]?.trim() ?? title;

    try {
      const entry = await createWikiEntry({ module: rawModule, title, bugId: session.bug_id, tags, body: llmOutput, oneLiner });
      log.info("wiki:created", { path: entry.path, module: entry.moduleSlug, bugId: session.bug_id });
      res.json({ entry });
    } catch (err: any) {
      log.error("wiki:write-error", { sessionId: req.params.id, error: err.message, stack: err instanceof Error ? err.stack : undefined });
      res.status(500).json({ error: `Failed to write wiki entry: ${err.message}` });
    }
  });

  app.get("/skills", async (_req, res) => {
    try {
      if (!skillsCache) {
        const skills = await loadAgentSkills();
        skillsCache = skills.map(({ name, description, frontmatter }) => ({
          name,
          description: description ?? "",
          triggers: Array.isArray(frontmatter?.triggers) ? (frontmatter.triggers as string[]) : [],
        }));
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
      res.json({ entry: { moduleSlug, filename, content } });
    } catch (err: any) {
      if (err.code === "ENOENT") return res.status(404).json({ error: "entry not found" });
      if (err.code === "EACCES") return res.status(404).json({ error: "not found" });
      res.status(500).json({ error: err.message });
    }
  });

  // ── Settings routes ───────────────────────────────────────────────────────────

  app.post("/settings/llm/models", async (req, res) => {
    const { provider, baseUrl, apiKey } = req.body;
    if (!provider) return res.status(400).json({ error: "provider required" });

    const url =
      provider === "openai"
        ? "https://api.openai.com/v1/models"
        : baseUrl
          ? `${baseUrl}/models`
          : null;

    if (!url) return res.status(400).json({ error: "baseUrl required" });

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
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

  app.get("/settings/llm", (_req, res) => {
    const cfg = settings.getLlmConfig();
    const out = { ...cfg } as any;
    if (out.apiKey) out.apiKey = "••••" + out.apiKey.slice(-4);
    res.json(out);
  });

  app.put("/settings/llm", async (req, res) => {
    const { pin, provider, model, baseUrl, apiKey } = req.body;
    if (!pin) return res.status(400).json({ error: "pin required" });
    if (!provider || !model) return res.status(400).json({ error: "provider and model required" });

    const stored = settings.getAdminPinHash();
    if (!stored) return res.status(503).json({ error: "Admin PIN not configured — set ADMIN_PIN in .env" });
    if (!(await verifyPin(String(pin), stored))) return res.status(401).json({ error: "Invalid PIN" });

    if (provider === "openai" && !apiKey) return res.status(400).json({ error: "apiKey required for OpenAI" });
    if ((provider === "openai-compatible" || provider === "ollama") && !baseUrl)
      return res.status(400).json({ error: "baseUrl required" });

    const cfg: LlmConfig = { provider, model, baseUrl, apiKey };
    settings.setLlmConfig(cfg);
    log.info("settings:llm-updated", { provider, model });

    const out = { ...cfg } as any;
    if (out.apiKey) out.apiKey = "••••" + out.apiKey.slice(-4);
    res.json(out);
  });

  app.get("/settings/skills", (_req, res) => {
    res.json({ dirs: settings.getExtraSkillsDirs() });
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

  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err.code === "LIMIT_FILE_SIZE") {
      const mb = Math.round(MAX_UPLOAD_BYTES / 1024 / 1024);
      return res.status(413).json({ error: `File too large — max ${mb} MB. Please zip your files.` });
    }
    res.status(500).json({ error: err.message ?? "Internal error" });
  });

  return app;
}
