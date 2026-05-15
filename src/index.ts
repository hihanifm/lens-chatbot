import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { MockBugTracker } from "./services/bugTracker.js";
import { getOrCreateWorkspace, downloadAttachment, saveBugSummary } from "./services/attachmentService.js";
import { ClineSdkAgentRunner } from "./agent/clineSdkRunner.js";
import { sessions, messages } from "./db.js";

const app = express();
app.use(express.json());

const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use(express.static(path.join(__dirname, "../static")));

// Swap MockBugTracker → InternalBugTracker when API is ready
const tracker = new MockBugTracker();
const runner = new ClineSdkAgentRunner();

// Create session + fetch bug details
app.post("/session", async (req, res) => {
  const { bugId } = req.body;
  if (!bugId) return res.status(400).json({ error: "bugId required" });

  const bug = await tracker.getBug(bugId);
  const workspacePath = await getOrCreateWorkspace(bugId);
  await saveBugSummary(workspacePath, bug.id, bug.title, bug.description);

  const session = sessions.create(bugId, workspacePath);
  res.json({ session, bug });
});

// List all sessions
app.get("/sessions", (_req, res) => {
  res.json(sessions.list());
});

// Get session state + message history
app.get("/session/:id", (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) return res.status(404).json({ error: "session not found" });
  res.json({ session, messages: messages.list(req.params.id) });
});

// Download attachment into workspace
app.post("/session/:id/attachment/:attId", async (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) return res.status(404).json({ error: "session not found" });

  const { attName } = req.body;
  if (!attName) return res.status(400).json({ error: "attName required" });

  const filePath = await downloadAttachment(
    tracker,
    session.bug_id,
    req.params.attId,
    attName,
    session.workspace_path
  );
  sessions.addFile(req.params.id, filePath);
  res.json({ filePath });
});

// SSE: analyze (first query or follow-up)
app.get("/session/:id/analyze", async (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) return res.status(404).json({ error: "session not found" });

  const question = req.query.question as string;
  if (!question) return res.status(400).json({ error: "question required" });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  messages.add(req.params.id, "user", question);

  const conversationSummary = messages.buildSummary(req.params.id);
  const updatedSession = sessions.get(req.params.id)!;

  let fullResponse = "";

  try {
    for await (const event of runner.analyze({
      workspacePath: updatedSession.workspace_path,
      files: updatedSession.selected_files,
      question,
      conversationSummary,
    })) {
      if (event.type === "text") {
        fullResponse += event.content;
        res.write(`data: ${JSON.stringify({ type: "text", content: event.content })}\n\n`);
      } else if (event.type === "done") {
        messages.add(req.params.id, "assistant", fullResponse);
        res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
        res.end();
      } else if (event.type === "error") {
        res.write(`data: ${JSON.stringify({ type: "error", content: event.content })}\n\n`);
        res.end();
      }
    }
  } catch (err: any) {
    res.write(`data: ${JSON.stringify({ type: "error", content: err.message })}\n\n`);
    res.end();
  }
});

const port = process.env.PORT ?? 3000;
const publicUrl = process.env.PUBLIC_URL ?? `http://localhost:${port}`;
app.listen(port, () => console.log(`Lens chatbot listening on port ${port} → ${publicUrl}`));
