# File Explorer — Phase 2: Lazy Zip Extraction

## Context

Phase 1 ships with full auto-extraction: downloading a zip immediately extracts everything to disk. Phase 2 changes this. The whole zip still has to be downloaded (the bug tracker has no per-file API), but contents are only extracted when the user explicitly picks specific files. This keeps disk usage low and gives users control over what the agent sees.

---

## Behavior change

| | Phase 1 | Phase 2 |
|---|---|---|
| Zip download | Extracts everything immediately | Saves zip only |
| Explorer zip node | Pre-populated children (already extracted) | Collapsed; children fetched lazily on expand |
| Selecting a zip file | Click `[+ Add]` on already-extracted file | Click `[Extract]` → writes file to disk; then `[+ Add]` to add to agent context |
| Disk usage | All zip contents written on download | Only selected files written to disk |

### Explorer UX (Phase 2)

```
▼ Bug Attachments
  crash_dump.zip ▶    ✓ downloaded — tap to browse

  → (user taps to expand — fetches contents from zip central directory)

  crash_dump.zip ▼
    radio_log.txt          [Extract]         ← not yet on disk
    system_log.txt         [✓ In context]    ← extracted + user clicked + Add
    modem_raw.bin          [Extract]
    debug_symbols.txt      [Extract]
```

---

## Files to change

| File | Change |
|------|--------|
| `src/services/attachmentService.ts` | Remove auto-extract; add `listZipContents()` + `extractZipEntry()` |
| `src/services/workspaceExplorer.ts` | Zip nodes have no `children` — empty array; lazy fetch happens client-side |
| `src/app.ts` | Add `GET /zip-contents`; add `POST /extract-file` |
| `static/index.html` | Zip node fetches contents on expand; `[Extract]` then optional `[+ Add]` |

No DB changes.

---

## 1. `src/services/attachmentService.ts`

### Remove auto-extract

In `downloadAttachment()`, delete the zip branch that calls `unzipper.Extract`. After saving the file to disk, return immediately:

```typescript
// Before (remove this block):
if (attName.endsWith(".zip")) {
  const extractDir = ...;
  await fs.mkdir(extractDir, { recursive: true });
  await new Promise((resolve, reject) =>
    createReadStream(filePath).pipe(unzipper.Extract({ path: extractDir }))
      .on("close", resolve).on("error", reject));
  const extractedFiles = await walkFiles(extractDir);
  return { filePath, extractedFiles };
}

// After — just return the zip path:
return { filePath, extractedFiles: [] };
```

The `extractedFiles` field stays in the return type for backward compatibility (callers already handle empty arrays).

### Add `listZipContents()`

```typescript
export interface ZipEntry {
  innerPath: string;    // e.g. "crash_dump/radio_log.txt"
  size: number;         // uncompressed size in bytes
  extracted: boolean;   // true if already on disk
  filePath?: string;    // absolute path on disk if extracted
}

export async function listZipContents(
  zipPath: string,
  extractBaseDir: string   // = {workspace}/attachments/{zipBaseName}/
): Promise<ZipEntry[]>
```

Implementation:
```typescript
import unzipper from "unzipper";

export async function listZipContents(zipPath, extractBaseDir) {
  const directory = await unzipper.Open.file(zipPath);
  const entries: ZipEntry[] = [];
  for (const file of directory.files) {
    if (file.type === "Directory") continue;   // skip directory entries
    const destPath = path.join(extractBaseDir, file.path);
    const resolved = path.resolve(destPath);
    if (!resolved.startsWith(path.resolve(extractBaseDir) + path.sep)) continue; // path safety
    let extracted = false, filePath: string | undefined;
    try { await fs.access(resolved); extracted = true; filePath = resolved; } catch {}
    entries.push({ innerPath: file.path, size: file.uncompressedSize, extracted, filePath });
  }
  return entries;
}
```

Uses `unzipper.Open.file()` — reads the central directory only, **no extraction**.

### Add `extractZipEntry()`

```typescript
export async function extractZipEntry(
  zipPath: string,
  innerPath: string,
  extractBaseDir: string
): Promise<string>   // returns absolute path of extracted file
```

Implementation:
```typescript
export async function extractZipEntry(zipPath, innerPath, extractBaseDir) {
  const destPath = path.resolve(path.join(extractBaseDir, innerPath));
  if (!destPath.startsWith(path.resolve(extractBaseDir) + path.sep))
    throw new Error("path traversal detected");
  await fs.mkdir(path.dirname(destPath), { recursive: true });
  const directory = await unzipper.Open.file(zipPath);
  const entry = directory.files.find(f => f.path === innerPath);
  if (!entry) throw new Error(`Entry not found in zip: ${innerPath}`);
  await new Promise<void>((resolve, reject) =>
    entry.stream()
      .pipe(createWriteStream(destPath))
      .on("close", resolve)
      .on("error", reject)
  );
  return destPath;
}
```

---

## 2. `src/services/workspaceExplorer.ts`

In `buildAttNode()` (or wherever zip children are built), remove the call to `walkFiles(extractDir)`:

```typescript
// Before:
if (node.isZip && node.downloaded) {
  node.children = await walkFiles(extractDir);  // remove this
}

// After:
// children left undefined — frontend fetches lazily via /zip-contents
```

The `AttachmentNode.children` field stays in the interface (for backward compat) but is never populated for zips anymore. `buildVirtualTree` stays async but is faster now.

---

## 3. `src/app.ts`

### `GET /session/:id/zip-contents`

Called when user expands a zip node in the explorer.

```typescript
app.get("/session/:id/zip-contents", async (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) return res.status(404).json({ error: "session not found" });

  const zipPath = path.resolve(String(req.query.zipPath ?? ""));
  if (!zipPath.startsWith(session.workspace_path + path.sep))
    return res.status(403).json({ error: "path outside workspace" });

  const zipBaseName = path.basename(zipPath, ".zip");
  const extractBaseDir = path.join(session.workspace_path, "attachments", zipBaseName);

  const entries = await listZipContents(zipPath, extractBaseDir);
  res.json({ entries });
});
```

### `POST /session/:id/extract-file`

Called when user clicks `[Extract]` on an inner zip entry (writes to disk only; does not update `selected_files`).

```typescript
app.post("/session/:id/extract-file", async (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) return res.status(404).json({ error: "session not found" });

  const { zipPath, innerPath } = req.body;
  if (!zipPath || !innerPath)
    return res.status(400).json({ error: "zipPath and innerPath required" });

  const resolvedZip = path.resolve(String(zipPath));
  if (!resolvedZip.startsWith(session.workspace_path + path.sep))
    return res.status(403).json({ error: "path outside workspace" });

  const zipBaseName = path.basename(resolvedZip, ".zip");
  const extractBaseDir = path.join(session.workspace_path, "attachments", zipBaseName);

  const extractedPath = await extractZipEntry(resolvedZip, String(innerPath), extractBaseDir);
  res.json({ filePath: extractedPath });
});
```

---

## 4. `static/index.html`

### Zip node expand — lazy fetch

When user clicks a zip node heading, instead of revealing pre-built children, fetch contents:

```javascript
async function expandZipNode(zipPath, container, toggleEl) {
  if (container.dataset.loaded) {
    // already fetched — just toggle visibility
    container.style.display = container.style.display === 'none' ? 'block' : 'none';
    return;
  }
  toggleEl.textContent = '⏳';
  const res = await fetch(
    `/session/${currentSessionId}/zip-contents?zipPath=${encodeURIComponent(zipPath)}`
  );
  if (!res.ok) { toggleEl.textContent = '⚠'; return; }
  const { entries } = await res.json();
  container.innerHTML = '';
  for (const entry of entries) {
    container.appendChild(makeZipEntryRow(zipPath, entry));
  }
  container.dataset.loaded = '1';
  container.style.display = 'block';
  toggleEl.textContent = '▼';
}
```

Cache with `dataset.loaded` so expanding/collapsing after the first fetch doesn't re-request.

### Zip entry row

```javascript
function makeZipEntryRow(zipPath, entry) {
  const row = document.createElement('div');
  row.className = 'exp-file-row';
  row.style.paddingLeft = '28px';

  const nameEl = document.createElement('span');
  nameEl.className = `exp-file-name${entry.extracted && contextFiles[entry.filePath] ? ' in-context' : ''}`;
  nameEl.textContent = entry.innerPath.split('/').pop();  // show basename
  nameEl.title = entry.innerPath;
  row.appendChild(nameEl);

  const btn = document.createElement('button');
  btn.className = 'exp-add-btn';

  if (entry.extracted && contextFiles[entry.filePath]) {
    // Already extracted and in context
    btn.textContent = '✓';
    btn.classList.add('in-context');
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await toggleFileInChat(entry.filePath, nameEl.textContent, false);
      btn.textContent = '+ Add';
      btn.classList.remove('in-context');
      nameEl.classList.remove('in-context');
    });
  } else if (entry.extracted) {
    // Extracted but not in context
    btn.textContent = '+ Add';
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await toggleFileInChat(entry.filePath, nameEl.textContent, true);
      btn.textContent = '✓';
      btn.classList.add('in-context');
      nameEl.classList.add('in-context');
    });
  } else {
    // Not yet extracted
    btn.textContent = 'Extract';
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      btn.textContent = '⏳';
      btn.disabled = true;
      const res = await fetch(`/session/${currentSessionId}/extract-file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ zipPath, innerPath: entry.innerPath }),
      });
      if (!res.ok) { btn.textContent = '⚠'; btn.disabled = false; return; }
      const { filePath } = await res.json();
      entry.extracted = true;
      entry.filePath = filePath;
      btn.textContent = '+ Add';
      btn.disabled = false;
      // user clicks + Add to call toggleFileInChat(...)
    });
  }

  row.appendChild(btn);
  return row;
}
```

### Remove stale children from `makeAttNode`

In the existing `makeAttNode()` function, remove the section that renders pre-built `node.children`. Replace with the lazy expand trigger:

```javascript
// Zip node (downloaded)
zipRow.addEventListener('click', () => {
  expandZipNode(node.filePath, childContainer, toggle);
});
```

---

## Verification

1. `npm run test:e2e` — update any test that checks zip auto-extraction on download; all others pass
2. Download a zip → confirm only the `.zip` file is written to disk (no sibling directory created)
3. Open explorer → tap zip node → loading spinner → inner file list appears
4. Click `[Extract]` on one file → only that file is written to disk → click `[+ Add]` to add to context bar
5. Collapse and re-expand zip node → no network request (cached)
6. Send question → agent prompt shows that file + its comment context
7. `POST /extract-file` with `innerPath` containing `../` → 403
