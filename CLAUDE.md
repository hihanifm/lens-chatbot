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

npm run prompts:check              # fail if prompt-like strings appear in src/**/*.ts outside src/prompts/
npm run prompts:check-cline-system # fail if @cline/shared system prompts drift from docs/reference snapshot
npm run prompts:sync-cline-system  # refresh that snapshot after bumping @cline/sdk
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
| `PROMPTS_DIR` | `src/prompts` (bundled) | Top-level `.md` prompts plus `fragments/`; mount as a volume to edit at runtime without rebuild |
| `MAX_LUCKY_ATTACHMENTS` | `20` | Lucky route: max top-level bug attachments to auto-download |
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
src/index.ts             ← entry point: wires MockBugTracker + ClineCoreAgentRunner, calls createApp()
src/app.ts               ← Express app factory (createApp), all routes, SSE streaming
src/db.ts                ← SQLite via node:sqlite (built-in, no native addon)
src/logger.ts            ← thin console wrapper with timestamps + levels
src/broadcast.ts         ← SSE presence room (addClient/removeClient/broadcast), 25s ping keepalive
src/prompts/
  promptLoader.ts        ← loadPrompt, loadFragment, renderPrompt ({{var}}), composePrompt (join fragments)
  base.md                ← ClineCore overridePrompt (act/plan analyze + Lucky act mode)
  base-yolo.md           ← overridePrompt when mode=yolo (Lucky only); enables submit_and_exit termination
  environment.md         ← tools + Android file reference; prepended to every user turn
  lucky.md               ← Lucky user question (three-phase RCA instructions)
  wiki-synthesis.md      ← wiki entry generation template ({{bugId}}, {{module}}, etc.)
  fragments/rules/       ← domain rules → buildSystemRules() → {{CLINE_RULES}} slot
  fragments/user/        ← per-turn context → buildPrompt() / buildFollowUpPrompt()
src/services/
  bugTracker.ts          ← BugTracker interface + MockBugTracker + InternalBugTracker stub
  attachmentService.ts   ← workspace creation, file download, bug_summary.md write
  workspaceExplorer.ts   ← builds VirtualTree (AttachmentNodes + CommentSections) for file explorer
  wikiService.ts         ← create/list/read troubleshooting wiki entries; buildWikiSynthesisPrompt (uses wiki-synthesis.md template)
src/agent/
  agentRunner.ts         ← AgentRunner interface + AgentEvent types
  agentPrompt.ts         ← buildSystemRules(), buildPrompt(), buildFollowUpPrompt() via composePrompt + fragments
  clineCoreAgentRunner.ts ← ClineCoreAgentRunner; base.md + rules + environment; prior agent_notes/ reports
  skillsLoader.ts        ← reads skill .md files from SKILLS_DIR(s), parses frontmatter via @cline/sdk
  luckyAnalyzer.ts       ← runLucky(): lucky.md as user question; ephemeral session (not persisted)
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

**AgentRunner is an interface.** `ClineCoreAgentRunner` is the only implementation. To add CLI fallback: create `clineCliRunner.ts` implementing the same interface, swap one line in `index.ts`. Product code never imports `@cline/sdk` directly (except `clineCoreAgentRunner.ts` and `skillsLoader.ts`).

**BugTracker is an interface.** `MockBugTracker` returns hardcoded data. `InternalBugTracker` stub exists in `bugTracker.ts` — implement the two methods and swap in `index.ts`.

**Agent sessions persist across turns.** `cline_session_id` is stored in SQLite and passed back on follow-up turns so `ClineCoreAgentRunner` calls `cline.send()` instead of `cline.start()`, preserving ClineCore's native context. If the session is no longer found (e.g. after Docker restart), the runner falls back to `cline.start()` automatically.

**ClineCoreAgentRunner config**: defaults to `"act"` mode (`GET /session/:id/analyze?mode=plan` for plan). Max `AGENT_MAX_ITERATIONS` iterations. Disabled tools: `APPLY_PATCH`, `EDITOR`, `FETCH_WEB_CONTENT`, all MCP settings tools; `SUBMIT_AND_EXIT` only when `mode=yolo` (Lucky). Spawn agent and agent teams disabled.

**Prompt composition** (two layers):
1. **System prompt** — `loadPrompt("base")` or `loadPrompt("base-yolo")` passed as `overridePrompt` to `getClineDefaultSystemPrompt()`. Domain rules from `fragments/rules/*` via `buildSystemRules()` fill `{{CLINE_RULES}}` (stable per session).
2. **User turn** — `buildPrompt()` prepends `environment.md`, then composes `fragments/user/*` (workspace, file list, skills/wiki hints, prior reports, question). Follow-ups use `buildFollowUpPrompt()` (shorter file list + question only).

**Ad-hoc sessions**: users can create a session without a bug tracker entry (`POST /session/adhoc` with title/description/optional bugId), then upload files (`POST /session/:id/upload`, up to 20 files, optional `commentLabel`/`commentBody` for grouping in the file explorer). Same workspace layout and analysis flow as tracker-based sessions.

**Lucky analyzer** (`luckyAnalyzer.ts`): passes `lucky.md` as the user question through the normal `analyze()` path (same system prompt stack as chat). Ephemeral — no `cline_session_id` persisted. `app.ts` auto-downloads top-level bug attachments (not comment attachments; cap `MAX_LUCKY_ATTACHMENTS`) and **fully extracts zips** into context before `runLucky` — unlike the file explorer, which lists zip contents lazily. Triggered via `GET /session/:id/lucky` (SSE). Gated by feature flag `lucky`.

**Lucky modes** (A/B): `GET /session/:id/lucky` defaults to act (`base.md`). `?mode=yolo` uses `base-yolo.md` and enables `SUBMIT_AND_EXIT` — the agent must call `submit_and_exit` to finish (vs act, where a tool-call-less reply ends the task). UI: "yolo" checkbox beside 🎲. Reports: `agent_notes/lucky-act-<ts>.md` vs `lucky-yolo-<ts>.md`.

**Externalized prompts**: all LLM-facing text lives under `PROMPTS_DIR` (default bundled `src/prompts/`). Edit without rebuild, or mount a volume in Docker.

| File / dir | Role |
|------------|------|
| `base.md`, `base-yolo.md` | ClineCore `overridePrompt` templates (`{{CLINE_RULES}}`, `{{PLATFORM_NAME}}`, etc.) |
| `environment.md` | Tools + workspace/Android reference; first block of each user turn |
| `lucky.md` | Lucky RCA instructions (injected as user question) |
| `wiki-synthesis.md` | Wiki entry template (`renderPrompt` vars) |
| `fragments/rules/*` | Session-stable domain rules (`role`, `rca-template`, `citation-format`, `budget`, `path-policy`, `no-modify`) |
| `fragments/user/*` | Per-turn context (`workspace-header`, `files-*`, `skills-hint`, `wiki-hint`, `prior-reports`, `question`, `followup-files`) |

`composePrompt()` in `promptLoader.ts` joins parts; `{ fragment: "rules/role" }` loads `fragments/rules/role.md`; `{ fragment: "user/question", vars: { question } }` substitutes `{{question}}`.

**ClineCore system-prompt drift check**: `npm run prompts:check-cline-system` exits non-zero if `@cline/shared`'s upstream `DEFAULT_CLINE_SYSTEM_PROMPT` / `YOLO_CLINE_SYSTEM_PROMPT` differ from the snapshot in `docs/reference/cline-shared-system-prompts.md`. Run `npm run prompts:sync-cline-system` after bumping `@cline/sdk`, diff the changes, and decide whether `base.md` should follow upstream tool-call wording changes.

**HTTP egress logging** (`httpEgressLogging` feature flag, default off): `src/services/httpEgressLogger.ts` installs a `globalThis.fetch` interceptor at startup and uses `AsyncLocalStorage` to correlate outbound calls with the active session's workspace. When enabled, every fetch to the configured LLM `baseUrl` host (or known LLM hosts `api.openai.com` / `api.anthropic.com`) is dumped to `<workspacePath>/agent_notes/http-egress-<ts>-<seq>.json` with full request body, response body (clone-tee — works for SSE streams), redacted `Authorization` / `x-api-key` headers, and `durationMs`. Compare against `llm-request-*.json` (from the `beforeModel` hook) to verify the composed system prompt and user message reach the wire intact.

**Prompt-drift check**: `npm run prompts:check` scans `src/**/*.ts` (outside `src/prompts/`) for multi-line template literals containing prompt markers (`IMPORTANT:`, `MUST read`, `Selected files`, etc.) and fails if found — ensures prompt content stays in `.md` files.

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

**Zip behavior**: zips are no longer auto-extracted on download. The zip file is saved to disk; contents are listed lazily when the user expands the zip node. Individual entries are extracted to disk when the user clicks `[Extract]`; adding to agent context is a separate step via `[+ Add]`.

**Comment context**: when a file that came from a bug comment is added to context, `buildFileCommentMap()` in `clineCoreAgentRunner.ts` maps the file path to its comment body. `agentPrompt.ts` renders an inline `Comment:` line beside that file in the prompt so the agent sees the relevant comment without the user having to copy it.

File explorer endpoints:

| Endpoint | Purpose |
|----------|---------|
| `GET /session/:id/workspace/files` | Returns `VirtualTree` JSON — `bugAttachments` + per-comment `CommentSection[]` |
| `GET /session/:id/zip-contents?zipPath=…` | Reads zip central directory (no extraction); returns `ZipEntry[]` with `extracted` flag |
| `POST /session/:id/extract-file` | Extracts one entry from a zip to workspace disk (does not add to session context; use `PATCH /files` or explorer `[+ Add]`) |
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

## Prompt-vs-skill decoupling principle

**Prompt fragments carry state. Skills carry verbs.**

- A fragment should be **data the agent didn't know exists**: the workspace path, the file list, the wiki path, the list of prior reports, the user's question.
- A skill is **how to use that state**: "to navigate the wiki, do X"; "to reuse prior reports, do Y"; "to cite evidence, format Z".
- If a fragment contains more than one sentence of instruction prose, it's probably a skill in disguise — extract the verbs to a skill and leave only the data line in the fragment (e.g. `Wiki: <path>\n(Use the \`wiki-lookup\` skill.)`).

Why: skills load on demand (the model picks via frontmatter `triggers`), fragments load every turn. Moving verbs to skills lowers per-turn token cost, removes always-on instruction noise, and keeps domain knowledge portable to the future Cline CLI (`skills/` ports as-is; fragments are this product's prompt fork).

What stays as always-on fragments: identity (`role`), output contracts that apply to every reply (`citation-format`), runtime constraints (`budget`, `no-modify`, `path-policy`).

## User-editable skill data principle

When a skill carries a **machine-parsed data block** (e.g. the JSON rules in `skills/attachment-filter.md`), treat it like config that ships with the app:

- Backend must tolerate it missing/malformed and fall back to a baked-in `DEFAULT` constant — never crash, never block agent startup.
- Add a CI guard in `npm run prompts:check` (or a sibling script) that parses the block and validates shape. Bad edit → fail in CI, not silently in prod.
- The skill body itself documents the schema for human editors; the validator enforces it for the machine.
- Cache reads (short TTL, e.g. 30s) so live edits to a mounted `SKILLS_DIR` take effect without a restart.

This keeps domain heuristics in portable `.md` skills (CLI-ready) while preventing silent regressions when teammates tune them.

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
