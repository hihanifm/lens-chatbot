# Troubleshooting Wiki — Phase 1

## Inspiration

Andrej Karpathy's [LLM Wiki pattern](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) proposes a three-layer knowledge system: immutable raw sources, an LLM-maintained wiki of synthesized pages, and a schema document that tells the LLM how the wiki is structured. The key insight: **don't let valuable synthesis disappear into chat history** — file it back as a durable, navigable artifact.

We adapt this for bug troubleshooting:
- **Raw sources** = the bug ticket, logs, and attachments (already exists per workspace)
- **The wiki** = synthesized markdown entries the LLM writes when a bug is resolved
- **Schema** = `WIKI_DIR/SCHEMA.md` — tells future agents how the wiki is structured and how to use it

Two root files (Karpathy's operational backbone) track the wiki's evolution:
- **`index.md`** — catalog of all pages with one-line summaries, organized by module; the agent reads this first to find relevant entries without scanning hundreds of files
- **`log.md`** — append-only chronicle of every save (`## [YYYY-MM-DD] ingest | BUG-ID | Module | Title`)

---

## Context

**Trigger**: The "Add to wiki" button appears at the **session level** only when the bug `state` matches a resolved-like value (`resolved`, `fixed`, `closed`, `done` — case-insensitive). The user refreshes the bug (existing button) to pull updated state; then the wiki option becomes visible. No per-message button.

**Module**: Pre-filled from `bug.module` (already in `BugDetails`, returned by `GET /session/:id`). User can edit before saving.

**Synthesis input**: The full conversation (`messages.buildSummary`) AND the bug tracker comment thread from `bug.json` on disk. The closing comment — added by the engineer when resolving — is the primary resolution signal.

**`WIKI_DIR`**: New env var, separate from `DATA_DIR`. Defaults to `${DATA_DIR}/wiki` locally. In Docker, mounted as its own volume (`./wiki:/app/wiki`) — host-accessible, shared across dev/prod, independently backupable. Add `wiki/` to `.gitignore`.

**Synthesis**: Dedicated `POST /session/:id/wiki` endpoint makes a direct non-streaming LLM call using the configured provider. No changes to agent tool policies.

---

## Wiki Directory Layout

```
WIKI_DIR/
  SCHEMA.md          ← created on first save; describes wiki structure for the agent
  index.md           ← root index: module directory with coverage summary + entry count
  log.md             ← append-only chronicle of every ingest
  <module>/
    index.md         ← module index: one line per bug entry with title + one-sentence summary
    YYYYMMDD-BUGID-<slug>.md   ← individual entry files
```

Agent navigation is a deliberate funnel — read root first, then module, then individual entries:
```
index.md           → "IMS: registration, P-CSCF, VoLTE — 4 entries"
IMS/index.md       → "BUG-123: P-CSCF discovery fails post-handover [2026-05-17]"
IMS/BUG-123.md     → full root cause, evidence, resolution, log patterns
```

### `SCHEMA.md` (created once on first save)

```markdown
# Troubleshooting Wiki — Schema

This wiki contains synthesized insights from resolved bug investigations.

## Navigation (read in this order)
1. `index.md` (this directory) — module directory; lists what each module covers and how many entries it has
2. `<module>/index.md` — bug catalog for that module; one line per entry with title and one-sentence summary
3. `<module>/YYYYMMDD-BUGID-slug.md` — full entry: root cause, evidence, resolution, log patterns

## Root index format
Each module section: name, coverage description (derived from entry tags), entry count, last updated date.

## Module index format
One line per entry: `- [title](filename) — one-sentence summary [date]`

## Entry format
YAML frontmatter (bug_id, module, date, title, tags) + five sections:
Problem · Root Cause · Evidence · Resolution · Key Log Patterns

## How to use
- Read root `index.md` to identify which module(s) are relevant to the current bug
- Read that module's `index.md` to pick 1–2 entries most likely to apply
- Read those entries for confirmed root causes and log patterns
- Do not re-derive what is already documented here
```

### Root `index.md` (upserted on every save)

Each module section is rewritten when a new entry is added to that module. The coverage description is derived from the union of all tags across the module's entries — no extra LLM call needed.

```markdown
# Troubleshooting Wiki

## IMS
**Covers:** ims, registration, handover, dns, p-cscf, volte, roaming
**Entries:** 2 · Last updated: 2026-05-18
→ [IMS/index.md](IMS/index.md)

## Radio
**Covers:** radio, lte, handover, crash, null-pointer
**Entries:** 1 · Last updated: 2026-05-17
→ [Radio/index.md](Radio/index.md)
```

### Module `index.md` (appended on every save to that module)

```markdown
# IMS — Bug Index

- [IMS registration failure after handover](20260517-BUG-123-ims-reg-fail.md) — P-CSCF discovery fails post-handover; DNS retry backoff resolved it [2026-05-17]
- [IMS re-registration storm on roaming](20260518-BUG-201-ims-rereg-storm.md) — missing T3412 timer caused excessive re-registration on roaming networks [2026-05-18]
```

### `log.md` (append-only)

```
## [2026-05-17] ingest | BUG-123 | IMS | IMS registration failure after handover
## [2026-05-17] ingest | BUG-456 | Radio | Crash 8s after LTE handover
```

### Entry file frontmatter + sections

```markdown
---
bug_id: BUG-123
module: IMS
date: 2026-05-17
title: IMS registration failure after handover
tags: ims, registration, handover, dns
---

# IMS registration failure after handover

## Problem
## Root Cause
## Evidence
## Resolution
## Key Log Patterns
```

---

## Files to Create

### `src/services/wikiService.ts`

```ts
export interface WikiEntry {
  path: string;       // absolute path on disk
  module: string;     // raw module from frontmatter
  moduleSlug: string; // directory name
  filename: string;   // just the .md filename
  title: string;
  bugId: string;
  date: string;
  tags: string[];
  content?: string;   // populated only for single-entry reads
}

export function getWikiRoot(): string
  // process.env.WIKI_DIR ?? path.join(process.env.DATA_DIR ?? "data/local", "wiki")

export function slugify(text: string): string
  // lowercase, replace non-alphanumeric with hyphens, trim, max 60 chars

export async function createWikiEntry(opts: {
  module: string; title: string; bugId: string; tags: string[]; body: string;
  oneLiner: string;  // ← extracted from LLM output for module index
}): Promise<WikiEntry>
  // 1. Write <moduleSlug>/YYYYMMDD-BUGID-<titleSlug>.md (collision → -2, -3)
  // 2. Append one line to <moduleSlug>/index.md (create with header if missing)
  // 3. Upsert module section in root index.md (rewrite that module's block with updated tag union + count)
  // 4. Append one line to log.md
  // 5. Write SCHEMA.md if it doesn't exist

export async function listWikiEntries(): Promise<WikiEntry[]>
  // Walk WIKI_DIR for *.md files (skip index.md, log.md, SCHEMA.md)
  // Parse frontmatter, return sorted by date desc

export async function readWikiEntry(moduleSlug: string, filename: string): Promise<string>
  // Path traversal guard: resolved path must start with getWikiRoot()
  // Enforce .md extension

export function buildWikiSynthesisPrompt(
  transcript: string, bugComments: string, bugId: string, module: string
): string
  // Instructs LLM to output the entry AND a one-sentence summary line
  // The summary is used to populate the module index
```

**`buildWikiSynthesisPrompt`** — use this **exact string** as the function body (substitute variables at call time):

```ts
export function buildWikiSynthesisPrompt(
  transcript: string,
  bugComments: string,
  bugId: string,
  module: string
): string {
  const today = new Date().toISOString().slice(0, 10);
  return `You are a technical knowledge base writer for an engineering team.
Your job is to extract troubleshooting insights from a resolved bug investigation
and write a structured wiki entry that future engineers can use to shortcut similar investigations.

Bug ID: ${bugId}
Module: ${module}

Bug tracker comment thread (read carefully — the most recent comment often contains the resolution):
${bugComments}

Conversation transcript between engineer and AI assistant:
${transcript}

Output ONLY the following — no preamble, no explanation, no commentary before or after:

---
bug_id: ${bugId}
module: ${module}
date: ${today}
title: <concise descriptive title, ≤10 words>
tags: <comma-separated lowercase tags, e.g. ims,registration,handover,dns>
---

# <same title as above>

## Problem
<1–3 sentences describing the symptom the engineer was investigating>

## Root Cause
<the specific underlying cause; if not fully confirmed write "Suspected: ..." and explain why>

## Evidence
<bullet list of exact log lines, error codes, metrics, or file artifacts that pointed to the cause; quote log patterns in backticks>

## Resolution
<what was done or recommended to fix the issue; if no fix was applied, write the confirmed next steps>

## Key Log Patterns
<bullet list of log signatures or error strings useful for recognising this class of bug in the future; use backticks for exact patterns>

---
summary: <one sentence for the module index: state the problem and fix together, ≤20 words>

Rules:
- Only include facts that appear in the conversation or comment thread. Do not invent information.
- If the conversation did not reach a confirmed resolution, write what IS known in each section.
- The trailing summary: line is required — it will be parsed separately and must be the last line.`;
}
```

`temperature: 0.3` in the LLM call.

**Parsing in `createWikiEntry`**: extract the `summary:` line from the LLM output using a regex (`/^summary:\s*(.+)/m`), strip it from the body before writing the entry file, use it to populate the module `index.md` line.

---

## Files to Modify

### `src/app.ts` — 4 new routes

**`POST /session/:id/wiki`**
Body: `{ module: string, title?: string }`
- `sessions.get(id)` → 404 if missing
- Validate `module` → 400 if blank
- `messages.buildSummary(sessionId)` → transcript (already in `db.ts:171`)
- Read `bug.json` from `session.workspace_path`, extract `comments`, format as:
  `"${c.author} [${c.created_at}]: ${c.body}"` joined by `\n`
- `settings.getLlmConfig()` → resolve baseUrl (same logic as `clineCoreAgentRunner.ts:26`)
- `fetch(<baseUrl>/chat/completions, { stream: false, temperature: 0.3 })` → 502 on error
- Extract title from LLM output's `# ` heading if user didn't supply one
- Extract tags from frontmatter in LLM output
- `createWikiEntry(...)` → 500 on write failure
- Return `{ entry: WikiEntry }`

**`GET /wiki`** → `{ entries: WikiEntry[] }` — calls `listWikiEntries()`
**`GET /wiki/:module`** → `{ entries: WikiEntry[] }` — filtered, 404 if dir missing
**`GET /wiki/:module/:filename`** → `{ entry: WikiEntry }` with `content`, path-traversal safe

### `src/agent/agentPrompt.ts`

**Replace** the current `loadWikiEntries()` + file-list injection approach with a two-level navigation hint:

```ts
export async function getWikiRootIndexPath(): Promise<string | null> {
  const indexPath = path.join(getWikiRoot(), "index.md");
  try { await fs.access(indexPath); return indexPath; }
  catch { return null; }
}
```

Extend `buildPrompt` signature: replace `wikiEntries: WikiEntry[]` with `wikiRootIndex: string | null`.

Add to prompt string (after `skillsHint`, before `New question:`). Use this **exact text** — it mirrors the MUST language in `environment.md` so both reinforce each other:

```ts
const wikiHint = wikiRootIndex
  ? `IMPORTANT: Before starting analysis, you MUST read the troubleshooting wiki index:\n` +
    `  ${wikiRootIndex}\n` +
    `Navigate in order:\n` +
    `  1. Read the root index above — find which module(s) match this bug\n` +
    `  2. Read <module>/index.md — pick the 1–2 entries most relevant to this bug\n` +
    `  3. Read those entry files — use their root cause and log patterns to shortcut investigation\n` +
    `Do not skip this step. Confirmed resolutions from past bugs are more reliable than re-deriving from scratch.\n\n`
  : "";
```

This is the key Karpathy insight: **give the agent the index, not a dump of all paths**. At 500 entries the root index is still a single compact file; the module index adds the second layer of precision.

### `src/agent/clineCoreAgentRunner.ts`

Line 58, after `const skills = await loadAgentSkills()`:
```ts
const wikiIndexPath = await getWikiIndexPath();
```
Line 80:
```ts
const prompt = buildPrompt({ ...input, skills, wikiIndexPath });
```

### `src/agent/environment.md`

Append this exact text:
```markdown
## Troubleshooting Wiki

A growing knowledge base of synthesized insights from resolved bug investigations.
The wiki is organized as:
  - WIKI_DIR/index.md              ← module directory (what each module covers, entry count)
  - WIKI_DIR/<module>/index.md     ← bug catalog for that module (one line per entry + summary)
  - WIKI_DIR/<module>/YYYYMMDD-BUGID-slug.md  ← full entry with root cause, evidence, resolution

IMPORTANT: At the start of every analysis task, if the task prompt provides a wiki index path,
you MUST read it before doing anything else. This is not optional. Confirmed root causes and
log patterns from past bugs will shortcut your investigation — do not re-derive what is already
documented. Follow the three-step navigation: root index → module index → entry file(s).
```

### `docker-compose.yml` — both `app` and `app-prod` profiles

```yaml
# add to volumes:
- ./wiki:/app/wiki
# add to environment:
WIKI_DIR: /app/wiki
```

`./wiki` at repo root — host-accessible, shared across both profiles, independently mountable. Add `wiki/` to `.gitignore`.

### `.env.example`

```
# WIKI_DIR=/app/wiki   # wiki storage (default: DATA_DIR/wiki); mount separately in Docker
```

### `static/index.html`

**CSS**: `#wiki-session-btn` (pill in bug panel, hidden by default), `#wiki-overlay` (fixed backdrop), `#wiki-modal` (centered card).

**HTML** (after reset modal):
```html
<div id="wiki-overlay">
  <div id="wiki-modal">
    <h3>Save to troubleshooting wiki</h3>
    <input id="wiki-module" placeholder="Module (e.g. IMS, Radio, Scheduler)" />
    <input id="wiki-title" placeholder="Title (optional — LLM will suggest one)" />
    <div id="wiki-error"></div>
    <button id="wiki-cancel-btn">Cancel</button>
    <button id="wiki-save-btn">Save</button>
  </div>
</div>
```

**JS additions**:

```js
function isResolved(state) {
  return ['resolved','fixed','closed','done'].includes((state ?? '').toLowerCase());
}
```

In `renderBugPanel(bug, ...)` (called on load and after refresh-bug):
```js
document.getElementById('wiki-session-btn').style.display =
  isResolved(bug.state) ? 'inline-flex' : 'none';
document.getElementById('wiki-module').value = bug.module ?? '';
```

`#wiki-session-btn` sits near the refresh button in the bug panel HTML, `display:none` by default.

Modal save handler: `POST /session/${currentSessionId}/wiki` → on success: close modal, append `· Wiki entry saved: <title>` as a status message, disable button with "Saved" label.

---

## API Contract

| Method | Path | Body | Response |
|--------|------|------|----------|
| POST | `/session/:id/wiki` | `{ module, title? }` | `{ entry: WikiEntry }` |
| GET | `/wiki` | — | `{ entries: WikiEntry[] }` |
| GET | `/wiki/:module` | — | `{ entries: WikiEntry[] }` |
| GET | `/wiki/:module/:filename` | — | `{ entry: WikiEntry }` (with `content`) |

---

## Verification

**Manual (browser):**
1. Load a bug with `state: "Open"` — "Add to wiki" is hidden.
2. Patch `MockBugTracker` to return `state: "Resolved"`, click Refresh → button appears, module pre-filled.
3. Submit with blank module → error "Module is required."
4. Fill module, submit → success message in chat.
5. Check disk: `WIKI_DIR/<module>/YYYYMMDD-BUG-*.md` exists with all 5 sections.
6. Check `WIKI_DIR/<module>/index.md` has a one-line entry with the summary.
7. Check `WIKI_DIR/index.md` (root) has a module section with updated tag union and entry count.
8. Check `WIKI_DIR/log.md` has the ingest line.
9. Check `WIKI_DIR/SCHEMA.md` was created with navigation instructions.
10. Save a second entry for same module → module index gains second line, root index count increments to 2.
11. Restart server. Start a new session — agent prompt mentions root `index.md` with 3-step navigation.
12. Ask agent "check the troubleshooting wiki" — it reads root index → module index → entry file.

**API (curl):**
```bash
curl -X POST http://localhost:3000/session/<id>/wiki \
  -H 'Content-Type: application/json' \
  -d '{"module":"IMS"}' | jq .entry.title

curl http://localhost:3000/wiki | jq '.entries | length'
curl "http://localhost:3000/wiki/../../../etc/passwd"  # must return 404
```

**E2E test** (`e2e/smoke.spec.ts`):
1. Patch MockBugTracker → `state: "Resolved"`, call refresh-bug endpoint.
2. Assert "Add to wiki" button visible.
3. Fill module, submit → assert `· Wiki entry saved:` status message appears.
4. Assert `WIKI_DIR/index.md` contains the new entry line.
