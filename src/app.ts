import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createHash, randomUUID, scrypt, randomBytes, timingSafeEqual } from "crypto";
import type { BugTracker } from "./services/bugTracker.js";
import { getOrCreateWorkspace, downloadAttachment, saveBugSummary } from "./services/attachmentService.js";
import type { AgentRunner } from "./agent/agentRunner.js";
import { sessions, messages, users, settings } from "./db.js";
import type { LlmConfig } from "./db.js";
import { addClient, removeClient, broadcast } from "./broadcast.js";
import { log } from "./logger.js";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

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
      return res.json({ session: existing, bug });
    }

    const workspacePath = await getOrCreateWorkspace(bugId);
    await saveBugSummary(workspacePath, bug);
    const session = sessions.create(bugId, workspacePath);
    log.info("session:created", { sessionId: session.id, workspace: workspacePath });
    res.json({ session, bug });
  });

  app.get("/sessions", (_req, res) => {
    res.json(sessions.list());
  });

  app.get("/session/:id", async (req, res) => {
    const session = sessions.get(req.params.id);
    if (!session) return res.status(404).json({ error: "session not found" });
    let bug = null;
    try {
      const raw = await import("fs/promises").then(fs => fs.readFile(path.join(session.workspace_path, "bug.json"), "utf8"));
      bug = JSON.parse(raw);
    } catch {
      // bug.json missing or unreadable — omit gracefully
    }
    res.json({ session, messages: messages.list(req.params.id), bug });
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
      log.error("bug:refresh-error", { sessionId: req.params.id, error: err.message });
      res.status(502).json({ error: `Failed to refresh bug: ${err.message}` });
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
    log.info("attachment:saved", { filePath, extractedFiles: extractedFiles.length });
    if (extractedFiles.length > 0) {
      for (const ef of extractedFiles) sessions.addFile(req.params.id, ef);
    } else {
      sessions.addFile(req.params.id, filePath);
    }
    res.json({ filePath, extractedFiles });
  });

  app.patch("/session/:id/files", (req, res) => {
    const session = sessions.get(req.params.id);
    if (!session) return res.status(404).json({ error: "session not found" });
    const { filePath, selected } = req.body;
    if (!filePath) return res.status(400).json({ error: "filePath required" });
    if (selected) sessions.addFile(req.params.id, filePath);
    else sessions.removeFile(req.params.id, filePath);
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

    addClient(req.params.id, { clientId, userName: user.name, sessionId: req.params.id, res });
    req.on("close", () => removeClient(req.params.id, clientId));
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
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/session/:id/analyze", async (req, res) => {
    const session = sessions.get(req.params.id);
    if (!session) return res.status(404).json({ error: "session not found" });

    const question = req.query.question as string;
    if (!question) return res.status(400).json({ error: "question required" });

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

    log.info("analyze:start", { sessionId: req.params.id, files: updatedSession.selected_files, question: question.slice(0, 80), user: user.name });
    let fullResponse = "";

    try {
      for await (const event of runner.analyze({
        workspacePath: updatedSession.workspace_path,
        files: updatedSession.selected_files,
        question,
        clineSessionId: updatedSession.cline_session_id,
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
        }
      }
    } catch (err: any) {
      log.error("analyze:exception", { sessionId: req.params.id, error: err.message });
      messages.add(req.params.id, "assistant", `[Analysis error: ${err.message}]`, "Assistant");
      const payload = { type: "error", content: err.message, user: user.name, clientId };
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
      broadcast(req.params.id, payload, clientId);
      res.end();
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

  return app;
}
