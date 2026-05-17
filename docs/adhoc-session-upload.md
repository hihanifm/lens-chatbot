# Ad Hoc Session — Implementation Plan for Cursor

## What we're building
A "bring your own file" mode. Users can create a session with a custom bug ID + description, upload log files directly (no bug tracker needed), and later upload more files grouped as named comments. Everything else — file explorer, agent analysis, wiki — works identically.

---

## Step 1 — Install `multer`

In `package.json`, add to `dependencies`:
```json
"multer": "^1"
```
Add to `devDependencies`:
```json
"@types/multer": "^1"
```

Then run: `npm install`

---

## Step 2 — Add `saveAdHocFiles()` to `src/services/attachmentService.ts`

Add this import at the top of the file (after existing imports):
```typescript
import { randomUUID } from "crypto";
```

Add this new export function at the **end** of the file:

```typescript
export interface AdHocUploadResult {
  filePaths: string[];
  commentId?: string;
}

export async function saveAdHocFiles(
  workspacePath: string,
  files: Array<{ originalname: string; buffer: Buffer }>,
  comment?: { label: string; body: string }
): Promise<AdHocUploadResult> {
  const filePaths: string[] = [];

  for (const file of files) {
    const dest = path.join(workspacePath, "attachments", file.originalname);
    await fs.writeFile(dest, file.buffer);
    log.info("adhoc:file-saved", { dest, bytes: file.buffer.length });
    filePaths.push(dest);
  }

  const bugJsonPath = path.join(workspacePath, "bug.json");
  // no concurrency guard needed: single-user tool
  const bug = JSON.parse(await fs.readFile(bugJsonPath, "utf8"));

  const attEntries = files.map((f) => ({
    id: randomUUID(),
    name: f.originalname,
    size: f.buffer.length,
  }));

  let commentId: string | undefined;

  if (comment) {
    commentId = randomUUID();
    bug.comments.push({
      id: commentId,
      author: "user",
      body: comment.label + (comment.body ? `\n\n${comment.body}` : ""),
      created_at: new Date().toISOString(),
      attachments: attEntries,
    });
  } else {
    bug.attachments.push(...attEntries);
  }

  await fs.writeFile(bugJsonPath, JSON.stringify(bug, null, 2));
  return { filePaths, commentId };
}
```

---

## Step 3 — Add two endpoints to `src/app.ts`

### 3a — Add multer import and setup

After the existing imports at the top of `src/app.ts`, add:

```typescript
import multer from "multer";
import { saveAdHocFiles } from "./services/attachmentService.js";
```

Inside `createApp()`, right after `app.use(express.json())` (around line 40), add:

```typescript
const MAX_UPLOAD_BYTES = parseInt(process.env.UPLOAD_SIZE_LIMIT_MB ?? "50") * 1024 * 1024;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES } });
```

### 3b — `POST /session/adhoc` endpoint

Add this **before** `app.post("/session", ...)` (currently at line 72):

```typescript
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
```

### 3c — `POST /session/:id/upload` endpoint

Add this after the `POST /session/adhoc` endpoint (and before `app.get("/sessions", ...)`):

```typescript
app.post("/session/:id/upload", upload.array("files", 20), async (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) return res.status(404).json({ error: "session not found" });
  if (!session.workspace_path) return res.status(400).json({ error: "no workspace" });

  const files = req.files as Express.Multer.File[];
  if (!files || files.length === 0) return res.status(400).json({ error: "no files uploaded" });

  const commentLabel = (req.body.commentLabel as string | undefined)?.trim();
  const commentBody = (req.body.commentBody as string | undefined)?.trim();
  const comment = commentLabel ? { label: commentLabel, body: commentBody ?? "" } : undefined;

  try {
    const result = await saveAdHocFiles(session.workspace_path, files, comment);
    log.info("session:upload:done", { sessionId: session.id, count: files.length });
    res.json(result);
  } catch (err: any) {
    log.error("session:upload:error", { err: err.message });
    res.status(500).json({ error: err.message });
  }
});
```

Also add a multer error handler immediately after `createApp`'s route definitions (just before `return app`):

```typescript
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err.code === "LIMIT_FILE_SIZE") {
    const mb = Math.round(MAX_UPLOAD_BYTES / 1024 / 1024);
    return res.status(413).json({ error: `File too large — max ${mb} MB. Please zip your files.` });
  }
  res.status(500).json({ error: err.message ?? "Internal error" });
});
```

> **Note:** `MAX_UPLOAD_BYTES` is defined inside `createApp()`, so the error handler must also be inside `createApp()` (before `return app`).

---

## Step 4 — Frontend: `static/index.html`

### 4a — HTML: replace the header input area

Find this block (around line 260–262):
```html
<input id="bug-id-input" type="text" placeholder="Enter Bug ID (e.g. BUG-123)" />
<button id="load-bug-btn">Load Bug</button>
```

Replace with:
```html
<div id="session-mode-tabs">
  <button id="tab-tracker" class="tab-btn tab-active">Load Bug</button>
  <button id="tab-adhoc" class="tab-btn">Ad Hoc</button>
</div>

<!-- tracker mode (default) -->
<div id="tracker-mode">
  <input id="bug-id-input" type="text" placeholder="Enter Bug ID (e.g. BUG-123)" />
  <button id="load-bug-btn">Load Bug</button>
</div>

<!-- ad hoc mode -->
  <div id="adhoc-mode" style="gap:8px; align-items:center; flex-wrap:wrap;">
  <input id="adhoc-id-input" type="text" placeholder="Custom ID (optional)" style="width:160px;" />
  <input id="adhoc-title-input" type="text" placeholder="Issue title (required)" style="flex:1; min-width:180px;" />
  <input id="adhoc-desc-input" type="text" placeholder="Description (optional)" style="flex:1; min-width:180px;" />
  <label id="adhoc-file-label" class="attachment-upload-label">
    📁 Choose files
    <input id="adhoc-files-input" type="file" multiple style="display:none;" />
  </label>
  <span id="adhoc-file-count" style="font-size:12px; color:#6b7280;"></span>
  <button id="adhoc-create-btn">Create Session</button>
</div>
```

### 4b — HTML: add upload panel to explorer drawer

Find the explorer drawer (around line 315–321):
```html
<div id="explorer-drawer">
  <div id="explorer-header">
    <span>Workspace Files</span>
    <button id="explorer-close">✕</button>
  </div>
  <div id="explorer-body"></div>
</div>
```

Replace with:
```html
<div id="explorer-drawer">
  <div id="explorer-header">
    <span>Workspace Files</span>
    <button id="explorer-close">✕</button>
  </div>
  <div id="explorer-body"></div>
  <div id="explorer-upload-panel">
    <div style="font-size:12px; font-weight:600; color:#374151; margin-bottom:6px;">⬆ Upload Files</div>
    <input id="upload-label-input" type="text" placeholder="Comment label (optional)" style="width:100%; margin-bottom:6px; box-sizing:border-box;" />
    <input id="upload-body-input" type="text" placeholder="Note (optional)" style="width:100%; margin-bottom:6px; box-sizing:border-box;" />
    <label style="display:inline-block; margin-bottom:6px; cursor:pointer; font-size:13px; color:#2563eb;">
      📁 Choose files
      <input id="upload-files-input" type="file" multiple style="display:none;" />
    </label>
    <span id="upload-file-count" style="font-size:12px; color:#6b7280; margin-left:6px;"></span>
    <br/>
    <button id="upload-submit-btn" style="margin-top:6px;">Upload</button>
    <span id="upload-status" style="font-size:12px; margin-left:8px;"></span>
  </div>
</div>
```

### 4c — CSS: add styles

Find the `<style>` block and add at the end (before `</style>`):

```css
/* session mode tabs */
#session-mode-tabs { display: flex; gap: 4px; }
.tab-btn { background: #f3f4f6; border: 1px solid #d1d5db; border-radius: 6px; padding: 6px 14px; cursor: pointer; font-size: 13px; font-family: inherit; }
.tab-btn.tab-active { background: #2563eb; color: white; border-color: #2563eb; }
#adhoc-mode { display: none; gap: 8px; align-items: center; flex-wrap: wrap; }
#adhoc-mode input { padding: 7px 10px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 13px; font-family: inherit; }
.attachment-upload-label { padding: 7px 14px; background: #f3f4f6; border: 1px solid #d1d5db; border-radius: 6px; cursor: pointer; font-size: 13px; white-space: nowrap; }

/* explorer upload panel — hidden by default; shown only for ad hoc sessions */
#explorer-upload-panel { display: none; padding: 12px 16px; border-top: 1px solid #e5e7eb; background: #f9fafb; }
#explorer-upload-panel input[type=text] { padding: 5px 8px; border: 1px solid #d1d5db; border-radius: 5px; font-size: 12px; font-family: inherit; }
#upload-submit-btn { background: #2563eb; color: white; border: none; border-radius: 6px; padding: 6px 14px; cursor: pointer; font-size: 13px; font-family: inherit; }
#upload-submit-btn:disabled { opacity: 0.5; cursor: not-allowed; }
```

### 4d — JavaScript: tab switching

Find the `document.getElementById('load-bug-btn').onclick` handler (around line 706) and add **before** it:

> **Note:** Add `let isAdhocSession = false;` near the other top-level `let` declarations (e.g. near `let currentSessionId`). The upload panel is only shown for ad hoc sessions.
>
> Also add these two lines at the **top** of the existing `load-bug-btn` onclick handler (before the `fetch` call):
> ```javascript
> isAdhocSession = false;
> setUploadPanelVisible(false);
> ```

```javascript
// Tab switching: Load Bug ↔ Ad Hoc
document.getElementById('tab-tracker').onclick = () => {
  document.getElementById('tracker-mode').style.display = '';
  document.getElementById('adhoc-mode').style.display = 'none';
  document.getElementById('tab-tracker').classList.add('tab-active');
  document.getElementById('tab-adhoc').classList.remove('tab-active');
};
document.getElementById('tab-adhoc').onclick = () => {
  document.getElementById('tracker-mode').style.display = 'none';
  document.getElementById('adhoc-mode').style.display = 'flex';
  document.getElementById('tab-adhoc').classList.add('tab-active');
  document.getElementById('tab-tracker').classList.remove('tab-active');
};

function setUploadPanelVisible(visible) {
  document.getElementById('explorer-upload-panel').style.display = visible ? '' : 'none';
}

// Ad hoc file picker: show count
document.getElementById('adhoc-files-input').onchange = (e) => {
  const n = e.target.files.length;
  document.getElementById('adhoc-file-count').textContent = n ? `${n} file${n > 1 ? 's' : ''} selected` : '';
};

// Ad hoc create session
document.getElementById('adhoc-create-btn').onclick = async () => {
  const title = document.getElementById('adhoc-title-input').value.trim();
  if (!title) { alert('Title is required'); return; }

  const bugId = document.getElementById('adhoc-id-input').value.trim() || undefined;
  const description = document.getElementById('adhoc-desc-input').value.trim();

  const res = await fetch('/session/adhoc', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bugId, title, description }),
  });
  const body = await res.json();
  if (!res.ok) {
    appendMessage('error', `✗ Failed to create ad hoc session: ${body.error ?? res.statusText}`);
    return;
  }

  const { session, bug } = body;
  currentSessionId = session.id;
  isAdhocSession = true;
  setUploadPanelVisible(true);
  addSeenSession(session.id);
  contextFiles = {};
  updateContextBar();
  renderBugPanel(bug, []);
  document.getElementById('chat').innerHTML = '';
  document.getElementById('question-input').disabled = true;
  document.getElementById('send-btn').disabled = true;
  document.getElementById('session-menu-wrap').style.display = 'block';
  connectListen(session.id);
  loadSessions();

  // Upload files if any were selected
  const files = document.getElementById('adhoc-files-input').files;
  if (files.length > 0) {
    const fd = new FormData();
    for (const f of files) fd.append('files', f);
    const upRes = await fetch(`/session/${session.id}/upload`, { method: 'POST', body: fd });
    const upBody = await upRes.json();
    if (!upRes.ok) {
      const msg = upRes.status === 413
        ? upBody.error
        : `Upload failed: ${upBody.error ?? upRes.statusText}`;
      appendMessage('error', `✗ ${msg}`);
    }
    if (explorerOpen) refreshExplorerTree();
  }
};
```

### 4e — JavaScript: explorer upload panel

Find the `refreshExplorerTree` function or the `explorer-close` click handler and add **after** the explorer event listeners:

```javascript
// Explorer upload panel
document.getElementById('upload-files-input').onchange = (e) => {
  const n = e.target.files.length;
  document.getElementById('upload-file-count').textContent = n ? `${n} file${n > 1 ? 's' : ''} selected` : '';
};

document.getElementById('upload-submit-btn').onclick = async () => {
  if (!currentSessionId) return;
  const files = document.getElementById('upload-files-input').files;
  if (!files.length) { alert('Select at least one file'); return; }

  const label = document.getElementById('upload-label-input').value.trim();
  const body = document.getElementById('upload-body-input').value.trim();

  const fd = new FormData();
  for (const f of files) fd.append('files', f);
  if (label) fd.append('commentLabel', label);
  if (body) fd.append('commentBody', body);

  const btn = document.getElementById('upload-submit-btn');
  const status = document.getElementById('upload-status');
  btn.disabled = true;
  status.textContent = 'Uploading…';

  const res = await fetch(`/session/${currentSessionId}/upload`, { method: 'POST', body: fd });
  const resBody = await res.json();

  btn.disabled = false;
  if (!res.ok) {
    const msg = res.status === 413 ? resBody.error : `Upload failed: ${resBody.error ?? res.statusText}`;
    status.textContent = `✗ ${msg}`;
    appendMessage('error', `✗ ${msg}`);
    return;
  }

  status.textContent = `✓ ${resBody.filePaths.length} file(s) uploaded`;
  document.getElementById('upload-files-input').value = '';
  document.getElementById('upload-file-count').textContent = '';
  document.getElementById('upload-label-input').value = '';
  document.getElementById('upload-body-input').value = '';
  refreshExplorerTree();
};
```

---

## Step 5 — Verify

```bash
npx tsc --noEmit          # must pass with zero errors
npm run dev               # start local server
```

Manual checklist:
- [ ] Click "Ad Hoc" tab → tracker input hides, ad hoc form appears
- [ ] Create session with title only (no custom ID) → auto-generates `ADHOC-{timestamp}`
- [ ] Upload a file → appears in Files drawer under "Bug Attachments"
- [ ] Upload with comment label → appears as a named comment section in Files drawer
- [ ] Add file to context → question input enables, analysis runs normally
- [ ] Upload a file > 50 MB → error message shown: "File too large — max 50 MB. Please zip your files."
- [ ] Load a tracker bug → upload panel in Files drawer is hidden
- [ ] Switch back to "Load Bug" tab → normal tracker flow still works
- [ ] `npm run test:e2e` → all existing tests pass

---

## Files changed summary

| File | What changes |
|------|-------------|
| `package.json` | + `multer`, `@types/multer` |
| `src/services/attachmentService.ts` | + `saveAdHocFiles()` at end of file |
| `src/app.ts` | + multer import/setup, + `POST /session/adhoc`, + `POST /session/:id/upload`, + multer error handler |
| `static/index.html` | + tab HTML, + adhoc form HTML, + explorer upload panel HTML, + CSS, + JS handlers |

## Functions reused unchanged
| Function | Location |
|----------|----------|
| `getOrCreateWorkspace()` | `src/services/attachmentService.ts:12` |
| `saveBugSummary()` | `src/services/attachmentService.ts:74` |
| `sessions.create()` | `src/db.ts:92` |
| `buildVirtualTree()` | `src/services/workspaceExplorer.ts:56` — reads updated `bug.json` automatically |
| `renderBugPanel()`, `refreshExplorerTree()`, SSE, analysis | `static/index.html` — no changes |
