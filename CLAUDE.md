# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Session setup

Invoke `/caveman lite` at the start of every session.

## What this is

A web chatbot for engineers to debug bugs. User enters a bug ID → backend fetches details from an internal tracker → user downloads a log attachment → Cline SDK agent analyzes it and streams the result back. Multi-turn follow-up chat is supported. Sessions persist in SQLite.

## Dev commands

```bash
npm run dev          # run locally via tsx (no Docker)
make build && make up  # build Docker image + start dev stack (port 38001)
make restart         # down + up without rebuild
make logs            # tail dev container logs
make prod-up         # build + start prod stack (port 38000)

npm run test:e2e         # Playwright e2e suite (spins up real Express + MockBugTracker + StubAgentRunner)
npm run test:e2e:ui      # same, with Playwright UI
npm run test:e2e:live    # live suite against real Ollama (see playwright.live.config.ts)
```

Requires a `.env` file — copy from `.env.example`. Ollama defaults: `LLM_BASE_URL=http://host.docker.internal:11434/v1`, `LLM_MODEL=llama3.1:8b`.

## Architecture

```
static/index.html        ← single-page UI, plain JS, SSE consumer
src/index.ts             ← entry point: wires MockBugTracker + ClineSdkAgentRunner, calls createApp()
src/app.ts               ← Express app factory (createApp), all routes, SSE streaming
src/db.ts                ← SQLite via node:sqlite (built-in, no native addon)
src/logger.ts            ← thin console wrapper with timestamps + levels
src/services/
  bugTracker.ts          ← BugTracker interface + MockBugTracker + InternalBugTracker stub
  attachmentService.ts   ← workspace creation, file download, bug_summary.md write
src/agent/
  agentRunner.ts         ← AgentRunner interface + AgentEvent types
  clineSdkRunner.ts      ← ClineSdkAgentRunner (@cline/sdk, OpenAI-compatible)
  skillsLoader.ts        ← reads skill .md files from SKILLS_DIR(s), parses frontmatter via @cline/sdk
agents.md                ← agent environment context (tools, workspace layout) — read by agent every task
skills/                  ← built-in skill files (Cline frontmatter format), baked into Docker at /app/skills
e2e/
  smoke.spec.ts          ← Playwright tests: load bug, download attachment, analyze stream
  server.ts              ← test server (MockBugTracker + StubAgentRunner, port 3099)
  stubAgentRunner.ts     ← AgentRunner stub that emits predictable "E2E mock analysis" reply
fixtures/                ← static fixture files for tests
```

## Key design decisions

**AgentRunner is an interface.** `ClineSdkAgentRunner` is the only implementation. To add CLI fallback: create `clineCliRunner.ts` implementing the same interface, swap one line in `index.ts`. Product code never imports `@cline/sdk` directly.

**BugTracker is an interface.** `MockBugTracker` returns hardcoded data. `InternalBugTracker` stub exists in `bugTracker.ts` — implement the two methods and swap in `index.ts`.

**Agent is stateless per call.** No in-memory session resumption. Each `/analyze` call rebuilds full context from the `messages` table (`messages.buildSummary()`). SQLite is the source of truth.

**Workspace layout** per bug:
```
DATA_DIR/workspaces/BUG-ID/
  bug.json          ← raw tracker response (never modified)
  bug_summary.md    ← formatted for agent prompt
  attachments/      ← downloaded files
  agent_notes/      ← agent responses saved here
```
`DATA_DIR` defaults to `/app/data` in Docker, CWD locally.

**SSE streaming**: `/session/:id/analyze?question=...` is a GET that streams `text/event-stream`. Each event is `data: {type, content}\n\n`. Types: `status`, `text`, `done`, `error`.

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

This tool is for engineers. Surface all agent lifecycle events to the UI — more is better. Every meaningful internal state change should appear as a `status` event in the SSE stream and render inline in the chat. In `clineSdkRunner.ts`, the default `else` branch already emits any unknown Cline SDK event as a `· event.type` status line. Preserve this behaviour. When adding new routes or error paths:
- HTTP errors → return `{ error: "descriptive message" }` with correct status code
- Frontend fetch calls → always check `res.ok` and call `appendMessage('error', ...)` on failure
- New agent event types → emit as `status` first, refine later if needed

## Docker

- Dev: port 38001, source mounted as volume (rebuild only needed for dependency changes)
- Prod: port 38000, compiled from `dist/`, static files baked in
- Base image: `public.ecr.aws/docker/library/node:22-bookworm-slim` (ECR mirror, no Docker Hub dependency)
- Runtimes available in both stages: `python3`, `jq`, `ripgrep` — agents can shell out to all of these
- Proxy: `HTTP_PROXY` / `HTTPS_PROXY` / `NO_PROXY` passed as build args; `host.docker.internal` in `NO_PROXY` by default

## Swapping implementations

| What | Where | How |
|------|-------|-----|
| Bug tracker | `src/index.ts:9` | `new InternalBugTracker()` |
| Agent runner | `src/index.ts:9` | `new ClineCliAgentRunner()` |
| LLM model | `.env` → `LLM_MODEL` | any Ollama model name |
| Skills dirs | `.env` → `SKILLS_DIR` | colon-separated paths |
| Ports | `.env` → `DEV_PORT` / `PROD_PORT` | override compose defaults |
