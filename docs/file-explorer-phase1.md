# File Explorer — Phase 1 Spec

## Context

Attachments (including zip contents) are now downloaded but NOT auto-added to context. Users need a way to browse all available files for a bug — grouped by the comment that uploaded them — and click to add/remove specific files from the analysis context. Comment text is auto-injected into the agent prompt when a related file is selected.

**Scope:** No annotations, no lazy extraction, no right-click menu. Zips are fully extracted on download (existing behavior). Phase 1 is purely visibility + selection.

---

## UX

```
🗂 Files                          [toggle button in #header]

┌─ Explorer drawer (right side) ──────────────────────────┐
│ ▼ Bug Attachments                                        │
│   modem_log.txt          [+ Add]                         │
│   screenshot.png         [+ Add]                         │
│   crash_dump.zip ▶       (tap to expand)                 │
│     radio_log.txt        [✓ In context]                  │
│     system_log.txt       [+ Add]                         │
│                                                          │
│ ▼ jane.doe · May 10                                      │
│   "Reproduced on 4.2.1. DNS fails after handover."       │
│   modem_verbose.txt      [+ Add]                         │
│                                                          │
│ ▼ bob.lee · May 12                                       │
│   "Checked RIL — narrowing to P-CSCF discovery."         │
│   (no attachments)                                       │
└──────────────────────────────────────────────────────────┘
```

**States:**
- **Not downloaded** — greyed/italic, no add button. Click row → triggers download (POST /attachment/:attId), then refreshes tree.
- **Downloaded, not in context** — `[+ Add]` button. Click → adds to `selected_files`.
- **Downloaded, in context** — `[✓ In context]`. Click → removes from `selected_files`.
- **Zip node** — expandable. Tap heading to show/hide extracted file list (already extracted on disk).
- **Comment with no attachments** — renders header + body only (contextual info for the user).

Comment text is automatically included in the agent prompt for any selected file that came from that comment. No user action needed.

---

## Files to create / modify

| File | Action |
|------|--------|
| `src/services/workspaceExplorer.ts` | **Create** |
| `src/app.ts` | Add `GET /session/:id/workspace/files`; fix path safety on existing `PATCH /session/:id/files` |
| `src/agent/clineCoreAgentRunner.ts` | Call `buildFileCommentMap()` before `buildPrompt()` |
| `src/agent/agentPrompt.ts` | Accept `fileComments` param, render inline |
| `static/index.html` | Add drawer HTML + CSS + JS |

**No DB schema changes.**

---

## 1. `src/services/workspaceExplorer.ts` (new)

```typescript
export interface FileNode {
  name: string;
  filePath: string;   // absolute path on disk
}

export interface AttachmentNode {
  attId: string;
  name: string;
  isZip: boolean;
  downloaded: boolean;
  filePath?: string;      // set if downloaded
  children?: FileNode[];  // set for downloaded zips (extracted contents)
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
  comments: CommentSection[];   // all comments, even those with no attachments
}

export async function buildVirtualTree(workspacePath: string): Promise<VirtualTree>
```

**`buildVirtualTree` logic:**
1. Read + parse `{workspacePath}/bug.json`. Return empty tree if missing.
2. For each attachment in `bug.attachments` and each `comment.attachments`:
   - Expected disk path: `{workspacePath}/attachments/{att.name}`
   - `downloaded = await fileExists(path)`
   - If downloaded zip: walk `{workspacePath}/attachments/{name-without-.zip}/` recursively for `children`. Reuse the existing `walkFiles()` helper from `attachmentService.ts`.
3. Include all comments regardless of whether they have attachments.
4. **Path safety:** every resolved path must start with `workspacePath + path.sep` before being included.

---

## 2. `src/app.ts`

**Add new endpoint:**
```typescript
import { buildVirtualTree } from "./services/workspaceExplorer.js";

app.get("/session/:id/workspace/files", async (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) return res.status(404).json({ error: "session not found" });
  const tree = await buildVirtualTree(session.workspace_path);
  res.json(tree);
});
```

**Fix missing path safety on existing `PATCH /session/:id/files`:**
```typescript
const resolved = path.resolve(String(req.body.filePath ?? ""));
if (!resolved.startsWith(session.workspace_path + path.sep))
  return res.status(403).json({ error: "path outside workspace" });
```

No other changes to `app.ts`.

---

## 3. Comment context in agent prompt

### `src/agent/clineCoreAgentRunner.ts`

Add a helper (can live in this file or a shared util):

```typescript
async function buildFileCommentMap(
  workspacePath: string,
  files: string[]
): Promise<Record<string, string>>  // filePath → comment.body
```

**Logic:**
- Read `bug.json` from `workspacePath`. Skip gracefully if missing/unreadable.
- For each `comment` in `bug.comments`, for each `att` in `comment.attachments`:
  - Match selected files whose path ends with `/${att.name}` (flat file from comment)
  - Or whose path is under `/${path.basename(att.name, '.zip')}/` (extracted zip entry)
  - Map matched paths → `comment.body`

Call before `buildPrompt`:
```typescript
const fileComments = await buildFileCommentMap(input.workspacePath, input.files);
const prompt = buildPrompt({ ...input, fileComments, skills });
```

### `src/agent/agentPrompt.ts`

Add `fileComments?: Record<string, string>` to `buildPrompt` input. Render inline:

```
Selected files to analyze:
- /abs/path/modem_verbose.txt
  Comment: "Reproduced on 4.2.1. DNS resolution consistently fails after handover." — jane.doe, May 10
- /abs/path/crash_dump/radio_log.txt
  Comment: "Device crashes 8–10s post-handover. Zip contains radio and system logs." — bob.lee, May 12
- /abs/path/modem_log.txt
```

Files with no associated comment render as before (just the path). `AgentRunner` interface — no changes.

---

## 4. `static/index.html`

### HTML additions

In `#header`, beside the settings button:
```html
<button id="explorer-btn">🗂 Files</button>
```

After the closing `</div>` of `#main`:
```html
<div id="explorer-drawer">
  <div id="explorer-header">
    <span>Workspace Files</span>
    <button id="explorer-close">✕</button>
  </div>
  <div id="explorer-body"></div>
</div>
```

### CSS additions

```css
#explorer-drawer {
  position: fixed; right: 0; top: 0; bottom: 0; width: 300px;
  background: #1a1d27; color: #e5e7eb;
  display: flex; flex-direction: column;
  transform: translateX(100%);
  transition: transform 0.2s ease;
  z-index: 200;
  box-shadow: -4px 0 20px rgba(0,0,0,0.25);
}
#explorer-drawer.open { transform: translateX(0); }

#explorer-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 16px; border-bottom: 1px solid #2d3143;
  font-size: 13px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 1px; color: #9ca3af; flex-shrink: 0;
}
#explorer-body { flex: 1; overflow-y: auto; padding: 8px 0; }

/* Section headers */
.exp-section-header {
  padding: 10px 14px 4px;
  font-size: 11px; font-weight: 700; color: #6b7280; text-transform: uppercase;
}
.exp-comment-header {
  padding: 8px 14px;
  border-top: 1px solid #2d3143; margin-top: 4px;
}
.exp-comment-author { font-size: 12px; font-weight: 600; color: #a5b4fc; }
.exp-comment-body { font-size: 11px; color: #6b7280; margin-top: 2px; }

/* File rows */
.exp-file-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 5px 14px 5px 20px; font-size: 12px; cursor: pointer;
}
.exp-file-row:hover { background: #252836; }
.exp-file-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.exp-file-name.not-downloaded { color: #4b5563; font-style: italic; }
.exp-file-name.in-context { color: #818cf8; }
.exp-add-btn {
  flex-shrink: 0; font-size: 11px; padding: 2px 8px;
  border-radius: 4px; border: 1px solid #374151;
  background: none; color: #9ca3af; cursor: pointer; font-family: inherit;
}
.exp-add-btn:hover { border-color: #6366f1; color: #818cf8; }
.exp-add-btn.in-context { border-color: #6366f1; color: #818cf8; background: #1e1b4b; }

/* Zip toggle */
.exp-zip-row {
  display: flex; align-items: center; gap: 6px;
  padding: 5px 14px; font-size: 12px; cursor: pointer; color: #9ca3af;
}
.exp-zip-row:hover { background: #252836; }
.exp-zip-toggle { font-size: 10px; }
```

### JS additions (inside existing `<script type="module">`)

```javascript
// ── Explorer ──────────────────────────────────────────────────────
let explorerOpen = false;

document.getElementById('explorer-btn').addEventListener('click', () => toggleExplorer());
document.getElementById('explorer-close').addEventListener('click', () => toggleExplorer(false));

function toggleExplorer(force) {
  explorerOpen = force !== undefined ? force : !explorerOpen;
  document.getElementById('explorer-drawer').classList.toggle('open', explorerOpen);
  document.getElementById('explorer-btn').classList.toggle('active', explorerOpen);
  if (explorerOpen && currentSessionId) refreshExplorerTree();
}

async function refreshExplorerTree() {
  if (!currentSessionId) return;
  const res = await fetch(`/session/${currentSessionId}/workspace/files`);
  if (!res.ok) return;
  renderVirtualTree(await res.json());
}

function renderVirtualTree(tree) {
  const body = document.getElementById('explorer-body');
  body.innerHTML = '';

  // Bug-level attachments
  const bugHeader = document.createElement('div');
  bugHeader.className = 'exp-section-header';
  bugHeader.textContent = 'Bug Attachments';
  body.appendChild(bugHeader);
  for (const node of tree.bugAttachments) body.appendChild(makeAttNode(node, null));

  // Per-comment sections
  for (const section of tree.comments) {
    const commentEl = document.createElement('div');
    commentEl.className = 'exp-comment-header';
    const truncated = section.body.length > 80 ? section.body.slice(0, 80) + '…' : section.body;
    commentEl.innerHTML = `
      <div class="exp-comment-author">${escHtml(section.author)} · ${fmtDate(section.created_at)}</div>
      <div class="exp-comment-body" title="${escHtml(section.body)}">"${escHtml(truncated)}"</div>
    `;
    body.appendChild(commentEl);
    for (const node of section.nodes) body.appendChild(makeAttNode(node, section.body));
    if (!section.nodes.length) {
      const empty = document.createElement('div');
      empty.style.cssText = 'padding:4px 20px;font-size:11px;color:#374151;';
      empty.textContent = 'no attachments';
      body.appendChild(empty);
    }
  }
}

function makeAttNode(node, commentBody) {
  if (node.isZip && node.downloaded) {
    // Zip: expandable
    const wrapper = document.createElement('div');
    const zipRow = document.createElement('div');
    zipRow.className = 'exp-zip-row';
    let expanded = false;
    const toggle = document.createElement('span');
    toggle.className = 'exp-zip-toggle';
    toggle.textContent = '▶';
    zipRow.appendChild(toggle);
    const label = document.createElement('span');
    label.textContent = `📦 ${node.name}`;
    zipRow.appendChild(label);

    const childContainer = document.createElement('div');
    childContainer.style.display = 'none';
    for (const child of (node.children ?? [])) {
      childContainer.appendChild(makeFileRow(child.filePath, child.name, commentBody));
    }

    zipRow.addEventListener('click', () => {
      expanded = !expanded;
      toggle.textContent = expanded ? '▼' : '▶';
      childContainer.style.display = expanded ? 'block' : 'none';
    });
    wrapper.appendChild(zipRow);
    wrapper.appendChild(childContainer);
    return wrapper;
  }

  if (!node.downloaded) {
    // Not downloaded — click to download
    const row = document.createElement('div');
    row.className = 'exp-file-row';
    const name = document.createElement('span');
    name.className = 'exp-file-name not-downloaded';
    name.textContent = `⬇ ${node.name}`;
    name.title = 'Click to download';
    row.appendChild(name);
    row.addEventListener('click', async () => {
      name.textContent = `⏬ ${node.name}`;
      // Find and click the matching attachment button in the existing UI
      // OR call the download endpoint directly:
      const res = await fetch(`/session/${currentSessionId}/attachment/${node.attId}`, { method: 'POST' });
      if (res.ok) refreshExplorerTree();
      else name.textContent = `⚠ ${node.name}`;
    });
    return row;
  }

  // Downloaded flat file
  return makeFileRow(node.filePath, node.name, commentBody);
}

function makeFileRow(filePath, name, commentBody) {
  const row = document.createElement('div');
  row.className = 'exp-file-row';
  const nameEl = document.createElement('span');
  nameEl.className = `exp-file-name${contextFiles[filePath] ? ' in-context' : ''}`;
  nameEl.textContent = name;
  nameEl.title = filePath;
  const btn = document.createElement('button');
  btn.className = `exp-add-btn${contextFiles[filePath] ? ' in-context' : ''}`;
  btn.textContent = contextFiles[filePath] ? '✓' : '+ Add';
  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const adding = !contextFiles[filePath];
    await toggleFileInChat(filePath, name, adding);
    nameEl.classList.toggle('in-context', adding);
    btn.classList.toggle('in-context', adding);
    btn.textContent = adding ? '✓' : '+ Add';
  });
  row.appendChild(nameEl);
  row.appendChild(btn);
  return row;
}

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
```

**Refresh hooks (one-liner each — add to existing locations):**

In `makeAttachmentBtn` download success path (~line 706):
```javascript
if (explorerOpen) refreshExplorerTree();
```

In `loadBug` / `resumeSession` after rendering:
```javascript
if (explorerOpen) refreshExplorerTree();
```

---

## Verification checklist

1. `npm run test:e2e` — update any test that checked zip auto-add; all others pass
2. Load bug → open 🗂 Files → all attachments appear grouped under correct comment headers
3. Click a not-downloaded file → downloads → tree refreshes with updated state
4. Click `[+ Add]` → file appears in context bar chip
5. Send question → check agent prompt (in logs or debug) includes `Comment:` line for files from comments
6. `PATCH /session/:id/files` with path outside workspace → 403
