# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Session setup

Invoke `/caveman lite` at the start of every session.

## What this is

A web chatbot for engineers to debug bugs. User enters a bug ID → backend fetches details from an internal tracker → user downloads a log attachment → Cline SDK agent analyzes it and streams the result back. Multi-turn follow-up chat is supported. Sessions persist in SQLite.

## Dev commands

```bash
npm run dev          # run locally via tsx (no Docker)
npm run build        # compile TypeScript → dist/ (runs tsc)
npx tsc --noEmit     # type-check only, no output

make build && make up  # build Docker image (not TypeScript) + start dev stack (port 38001)
make rebuild           # full --no-cache Docker rebuild + up (after dependency changes)
make restart         # down + up without rebuild
make logs            # tail dev container logs
make prod-up         # build + start prod stack (port 38000)

npm run test:e2e         # Playwright e2e suite (spins up real Express + MockBugTracker + StubAgentRunner)
npm run test:e2e:ui      # same, with Playwright UI
npm run test:e2e:live    # live suite against real Ollama (see playwright.live.config.ts)
npx playwright test -g "test name pattern"  # run a single e2e test by name
```

Requires a `.env` file — copy from `.env.example`. Ollama defaults: `LLM_BASE_URL=http://host.docker.internal:11434/v1`, `LLM_MODEL=llama3.1:8b`. `NODE_OPTIONS=--experimental-sqlite` is required for `node:sqlite` (Node 22); set automatically by Docker and `npm run dev`.

Key env vars:

| Var | Default | Purpose |
|-----|---------|---------|
| `ADMIN_PIN` | `"admin"` | Hashed with scrypt on first startup, stored in SQLite; ignored on restart. Required to change LLM settings. |
| `UPLOAD_SIZE_LIMIT_MB` | `50` | Max file upload size (multer, 413 on exceed) |
| `AGENT_MAX_ITERATIONS` | `12` | ClineCore max iterations per analysis |
| `LOG_LEVEL` | `info` | Server verbosity: `debug\|info\|warn\|error` |
| `SKILLS_DIR` | `/app/skills` | Colon-separated skill directories (extra dirs also configurable via Settings UI) |
| `WIKI_DIR` | `DATA_DIR/wiki` | Wiki storage; mount as shared volume for team-wide knowledge |
| `PROMPTS_DIR` | `src/prompts` (bundled) | Directory of `.md` prompt files (`task.md`, `lucky.md`, `wiki-synthesis.md`); mount as a volume to edit prompts at runtime without rebuild |
| `DATA_DIR` | `/app/data` (Docker), CWD (local) | Workspaces, DB, wiki root |

Additional make targets:

```bash
make setup       # one-time: install deps + copy .env.example
make dev-stop    # stop background Node dev process (PID-tracked)
make dev-clean   # wipe data/local (DB + workspaces for npm run dev)
make dock-clean  # wipe data/dev (DB + workspaces for Docker dev)
make down        # stop dev containers
make ps          # show container status
make clean       # remove containers, volumes, prune images
```

## Architecture

```
static/index.html        ← single-page UI, plain JS, SSE consumer; includes file explorer drawer
src/index.ts             ← entry point: wires MockBugTracker + ClineSdkAgentRunner, calls createApp()
src/app.ts               ← Express app factory (createApp), all routes, SSE streaming
src/db.ts                ← SQLite via node:sqlite (built-in, no native addon)
src/logger.ts            ← thin console wrapper with timestamps + levels
src/broadcast.ts         ← SSE presence room (addClient/removeClient/broadcast), 25s ping keepalive
src/prompts/
  promptLoader.ts        ← loadPrompt(name) reads <name>.md from PROMPTS_DIR (or bundled src/prompts/); renderPrompt(template, vars) does {{var}} substitution
  task.md                ← system prompt for normal analysis sessions
  lucky.md               ← three-phase RCA prompt for Lucky analyzer
  wiki-synthesis.md      ← LLM prompt template for wiki entry synthesis (uses {{bugId}}, {{module}}, {{today}}, {{bugComments}}, {{transcript}})
src/services/
  bugTracker.ts          ← BugTracker interface + MockBugTracker + InternalBugTracker stub
  attachmentService.ts   ← workspace creation, file download, bug_summary.md write
  workspaceExplorer.ts   ← builds VirtualTree (AttachmentNodes + CommentSections) for file explorer
  wikiService.ts         ← create/list/read troubleshooting wiki entries; buildWikiSynthesisPrompt (uses wiki-synthesis.md template)
src/agent/
  agentRunner.ts         ← AgentRunner interface + AgentEvent types
  agentPrompt.ts         ← builds agent prompt string; accepts taskContext (from task.md), fileComments, skills, wikiRootIndex, priorReports
  clineCoreAgentRunner.ts ← ClineCoreAgentRunner (@cline/sdk ClineCore, session-aware); loads task.md via loadPrompt; passes prior agent_notes/ reports
  skillsLoader.ts        ← reads skill .md files from SKILLS_DIR(s), parses frontmatter via @cline/sdk
  environment.md         ← agent environment context (tools, workspace layout) — read by agent every task
  luckyAnalyzer.ts       ← runLucky(): loads lucky.md via loadPrompt, runs ephemeral agent session for structured RCA
skills/                  ← built-in skill files (Cline frontmatter format), baked into Docker at /app/skills
wiki/                    ← two-level knowledge base: index.md → <module>/index.md → dated entries
e2e/
  smoke.spec.ts          ← stub tests (MockBugTracker + StubAgentRunner, DATA_DIR=./e2e/.data, port 3099)
  live.spec.ts           ← live tests against real Ollama (DATA_DIR=./e2e/.live-data)
  server.ts              ← stub test server
  liveServer.ts          ← live test server
  stubAgentRunner.ts     ← AgentRunner stub that emits predictable "E2E mock analysis" reply
fixtures/                ← static fixture files for tests
```

## Key design decisions

**AgentRunner is an interface.** `ClineSdkAgentRunner` is the only implementation. To add CLI fallback: create `clineCliRunner.ts` implementing the same interface, swap one line in `index.ts`. Product code never imports `@cline/sdk` directly.

**BugTracker is an interface.** `MockBugTracker` returns hardcoded data. `InternalBugTracker` stub exists in `bugTracker.ts` — implement the two methods and swap in `index.ts`.

**Agent sessions persist across turns.** `cline_session_id` is stored in SQLite and passed back on follow-up turns so `ClineCoreAgentRunner` calls `cline.send()` instead of `cline.start()`, preserving ClineCore's native context. If the session is no longer found (e.g. after Docker restart), the runner falls back to `cline.start()` automatically.

**ClineCoreAgentRunner config**: runs in `"plan"` mode, max `AGENT_MAX_ITERATIONS` iterations. Disabled tools: `APPLY_PATCH`, `EDITOR`, `FETCH_WEB_CONTENT`, `SUBMIT_AND_EXIT`, all MCP settings tools. Spawn agent and agent teams disabled.

**Ad-hoc sessions**: users can create a session without a bug tracker entry (`POST /session/adhoc` with title/description/optional bugId), then upload files (`POST /session/:id/upload`, up to 20 files, optional `commentLabel`/`commentBody` for grouping in the file explorer). Same workspace layout and analysis flow as tracker-based sessions.

**Lucky analyzer** (`luckyAnalyzer.ts`): loads the RCA prompt from `src/prompts/lucky.md` via `loadPrompt`, then runs an ephemeral agent session (not persisted to DB). `app.ts` auto-downloads top-level bug attachments and extracts zip entries into context before calling `runLucky`. Triggered via `GET /session/:id/lucky` (SSE stream). Edit `lucky.md` (or mount a custom `PROMPTS_DIR`) to change the RCA structure without rebuilding.

**Externalized prompts**: all LLM-facing prompts live in `src/prompts/*.md` and are loaded at runtime via `promptLoader.ts`. Set `PROMPTS_DIR` to a mounted volume to edit prompts without rebuilding. Three prompts: `task.md` (normal analysis), `lucky.md` (RCA), `wiki-synthesis.md` (wiki entry generation, supports `{{var}}` substitution).

**Prior reports**: on every `analyze` call, `clineCoreAgentRunner.ts` scans `agent_notes/` for previous `.md` reports and passes them to `buildPrompt` as `priorReports`. The prompt tells the agent to read the most recent report first and reuse its root cause rather than re-deriving from scratch.

**Admin PIN**: default is `"admin"` (logged as a warning at startup if `ADMIN_PIN` env var was not set). Hashed with scrypt, stored in SQLite `settings` table. All LLM and skill-directory changes via API require PIN. Extra skill directories are also stored in DB and merged with `SKILLS_DIR` at load time.

**Workspace layout** per bug:
```
DATA_DIR/workspaces/BUG-ID/
  bug.json          ← raw tracker response (never modified)
  bug_summary.md    ← formatted for agent prompt
  attachments/      ← downloaded files
  agent_notes/      ← agent responses saved here
```
`DATA_DIR` defaults to `/app/data` in Docker, CWD locally.

**SSE streaming**: `/session/:id/analyze?question=...` is a GET that streams `text/event-stream`. Each event is `data: {type, content}\n\n`. Types: `status`, `text`, `done`, `error`. **`/session/:id/listen`** (GET, SSE) is a passive observer stream — same analysis events broadcast via `broadcast.ts`, plus presence events: `presence:snapshot`, `presence:join`, `presence:leave`.

## File explorer

A 🗂 Files drawer in the UI lets users browse all workspace files grouped by the bug comment that uploaded them, and toggle individual files into or out of the agent context.

**Upload progress**: local file uploads (adhoc create or Files drawer) show a global `#upload-banner` below the header with bug ID, filename, MB progress, and phase (`Uploading` / `Saving on server…`). Progress stays visible when switching sessions or with the drawer closed. Only one in-flight upload per session. Server streams multipart bodies to `workspace/.upload-tmp/` via multer `diskStorage`, then renames into `attachments/` (not memory buffers).

**Zip behavior**: zips are no longer auto-extracted on download. The zip file is saved to disk; contents are listed lazily when the user expands the zip node, and individual entries are extracted only when the user clicks `[Extract & Add]`.

**Comment context**: when a file that came from a bug comment is added to context, `buildFileCommentMap()` in `clineCoreAgentRunner.ts` maps the file path to its comment body. `agentPrompt.ts` renders an inline `Comment:` line beside that file in the prompt so the agent sees the relevant comment without the user having to copy it.

File explorer endpoints:

| Endpoint | Purpose |
|----------|---------|
| `GET /session/:id/workspace/files` | Returns `VirtualTree` JSON — `bugAttachments` + per-comment `CommentSection[]` |
| `GET /session/:id/zip-contents?zipPath=…` | Reads zip central directory (no extraction); returns `ZipEntry[]` with `extracted` flag |
| `POST /session/:id/extract-file` | Extracts one entry from a zip; adds the resulting path to session files |
| `PATCH /session/:id/files` | Add/remove a file from session context (`{ path, selected: true/false }`) |
| `POST /session/:id/upload` | Upload files to session (multipart, max `UPLOAD_SIZE_LIMIT_MB`) |

All path-handling endpoints validate that resolved paths stay within `session.workspace_path` and return 403 on traversal attempts.

## Wiki system

After a bug investigation the agent (or user) can save a structured wiki entry for future reference. Entries are stored in `WIKI_DIR` in a two-level layout:

```
WIKI_DIR/
  index.md                          ← root index: one section per module (tags, entry count)
  SCHEMA.md                         ← reading guide (written on first use)
  log.md                            ← append-only ingest log
  <module-slug>/
    index.md                        ← module catalog: one line per entry with one-sentence summary
    YYYYMMDD-BUGID-slug.md          ← full entry: Problem · Root Cause · Evidence · Resolution · Key Log Patterns
```

`WIKI_DIR` defaults to `DATA_DIR/wiki`. Set it to a shared Docker volume for team-wide knowledge.

`wikiService.ts` exports: `createWikiEntry`, `listWikiEntries`, `readWikiEntry`, `buildWikiSynthesisPrompt`.

Wiki endpoints:

| Endpoint | Purpose |
|----------|---------|
| `POST /session/:id/wiki` | Agent posts synthesized entry; calls `createWikiEntry` and returns the saved path |
| `GET /wiki` | Lists all entries across modules (sorted by date) |
| `GET /wiki/:module` | Reads the module's `index.md` |
| `GET /wiki/:module/:filename` | Reads one full entry file |

## Other API endpoints

| Endpoint | Purpose |
|----------|---------|
| `POST /auth` | Login with `{ name, pin }` → returns `{ userId }` |
| `POST /session/adhoc` | Create ad-hoc session (`{ title, description?, bugId? }`) |
| `POST /session/:id/refresh-bug` | Re-fetch bug details from tracker |
| `POST /session/:id/abort` | Abort current in-progress agent analysis |
| `POST /session/:id/stop` | Stop agent and clear `cline_session_id` (resets to fresh session) |
| `GET /session/:id/lucky` | SSE stream: structured RCA via `LuckyAnalyzer` |
| `GET /skills` | List all loaded skills with frontmatter (name, description, triggers) |
| `GET /settings/llm` | Current LLM config (API key redacted to last 4 chars) |
| `PUT /settings/llm` | Update LLM config (requires PIN) |
| `POST /settings/llm/models` | List available models from the upstream LLM provider |
| `GET /settings/skills` | List extra skill directories stored in DB |
| `PUT /settings/skills` | Update extra skill directories (requires PIN, paths must exist) |
| `PUT /settings/admin/pin` | Change admin PIN (requires current PIN) |

## Skills system

Skills are markdown files in Cline's native format (YAML frontmatter + instructions body). On every analysis call, `skillsLoader.ts` reads all `.md` files from `SKILLS_DIR` (colon-separated list of paths), parses frontmatter via `parseSkillConfigFromMarkdown` from `@cline/sdk`, and passes the resulting file list directly into the agent prompt. The agent reads whichever skills are relevant on its own — no backend selection logic.

`SKILLS_DIR` defaults to `/app/skills` in Docker (baked in). Admins can append extra directories: `SKILLS_DIR=/app/skills:/mnt/team-skills`.

Skill frontmatter fields: `name`, `description`, `triggers` (hint list for the LLM), `disabled` (boolean).

## LLM-first principle

**Prefer LLM intelligence over hand-coded logic whenever the model can do it better.** Examples:
- Skill selection: pass all skills to the agent and let it choose relevant ones from frontmatter — don't write keyword-matching code.
- Response formatting: instruct the model to adapt its format to the question — don't template every response.
- Any decision that involves understanding context, language, or intent belongs to the model, not to `if/else` in TypeScript.

Reserve backend code for things the LLM cannot do: I/O, persistence, streaming, auth, routing.

## Transparency principle — show everything to the user

This tool is for engineers. Surface all agent lifecycle events to the UI — more is better. Every meaningful internal state change should appear as a `status` event in the SSE stream and render inline in the chat. In `clineCoreAgentRunner.ts`, the default `else` branch already emits any unknown Cline SDK event as a `· event.type` status line. Preserve this behaviour. When adding new routes or error paths:
- HTTP errors → return `{ error: "descriptive message" }` with correct status code
- Frontend fetch calls → always check `res.ok` and call `appendMessage('error', ...)` on failure
- New agent event types → emit as `status` first, refine later if needed

## Docker

- Dev: port 38001, source mounted as volume (rebuild only needed for dependency changes)
- Prod: port 38000, compiled from `dist/`, static files baked in
- Base image: `public.ecr.aws/docker/library/node:22-bookworm-slim` (ECR mirror, no Docker Hub dependency)
- Runtimes available in both stages: `python3`, `jq`, `ripgrep` — agents can shell out to all of these
- Proxy: `HTTP_PROXY` / `HTTPS_PROXY` / `NO_PROXY` passed as build args; `host.docker.internal` in `NO_PROXY` by default
- `WIKI_DIR`: defaults to `DATA_DIR/wiki`; mount a named volume here in Docker for a team-shared knowledge base

## Swapping implementations

| What | Where | How |
|------|-------|-----|
| Bug tracker | `src/index.ts:9` | `new InternalBugTracker()` |
| Agent runner | `src/index.ts:9` | `new ClineCliAgentRunner()` |
| LLM model | `.env` → `LLM_MODEL` | any Ollama model name |
| Skills dirs | `.env` → `SKILLS_DIR` | colon-separated paths |
| Wiki dir | `.env` → `WIKI_DIR` | shared volume path for team-wide wiki |
| Ports | `.env` → `DEV_PORT` / `PROD_PORT` | override compose defaults |
