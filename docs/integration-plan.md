# External integration plan

This document records the phased plan to expose lens-chatbot to other agents
and services. **Phase 1 is implemented today** (this PR). Phases 2 and 3 are
future work and are documented here so contract decisions stay consistent.

## Context

Other agents and services in the org want to drive the troubleshooting
workflow — create a session for a bug, upload logs, run analysis, read the
report, post to the wiki. Today the only contract is the React frontend's
ad-hoc `fetch` calls against `src/app.ts` routes. Shapes are implicit, the
SSE event union isn't published, and there's no machine-friendly contract.

Posture: trusted internal network, no tokens. Surfaces stay independent of
each other so they can evolve separately. Scope is read + run analysis +
wiki write; admin/PIN-gated mutations stay UI-only.

---

## Phase 1 — OpenAPI spec (DONE)

Single hand-authored OpenAPI 3.1 document is the contract. Every other
surface (TS SDK, MCP, Python clients, Go clients, Postman collections,
dashboards) can derive from it independently.

**Shipped:**

- [`docs/openapi.yaml`](openapi.yaml) — the spec.
- [`docs/openapi.previous.yaml`](openapi.previous.yaml) — snapshot for the
  diff guard.
- [`docs/openapi-CHANGELOG.md`](openapi-CHANGELOG.md) — keep-a-changelog.
- `GET /openapi.yaml` — serves the live spec.
- `GET /docs` — Redoc renders the spec in a browser tab.
- `GET /version` — `{ api: <spec version>, build: <git sha> }` so any client
  can detect drift at runtime.
- `npm run openapi:check` — Redocly lint + breaking-change diff against the
  committed snapshot. Mirrors the existing `prompts:check-cline-system`
  snapshot pattern.

**Versioning rules** (apply to `info.version` in `docs/openapi.yaml`):

- **patch** — doc-only (descriptions, examples)
- **minor** — additive (new route, new optional field)
- **major** — breaking (removed/renamed field, removed route, changed type)

When bumping the version, update `docs/openapi.previous.yaml` to match
`docs/openapi.yaml` and add an entry to `docs/openapi-CHANGELOG.md`.

**Excluded from the spec** (intentional): admin/PIN-gated settings routes
(`PUT /settings/llm`, `PUT /settings/skills`, `PUT /settings/features`,
`PUT /settings/admin/pin`, `POST /settings/llm/models`). These are UI-only
and not part of the public contract.

---

## Phase 2 — TypeScript SDK + MCP server (FUTURE)

Once the spec is stable, package two TS-side surfaces. Both are independent
npm workspaces in this repo; both derive types from the spec via
`openapi-typescript`.

- **`@lens-chatbot/sdk`** — thin `LensClient` wrapping `fetch` for REST and
  an async-iterator helper for SSE. Public API: `auth`, `createSession`,
  `createAdhocSession`, `uploadFiles`, `analyze` (async iterator),
  `analyzeAndWait` (collected reply), `listWiki`, `synthesizeWikiEntry`,
  `listSkills`, etc.
- **`@lens-chatbot/mcp`** — stdio MCP server using
  `@modelcontextprotocol/sdk`. Imports the SDK and exposes tools:
  `lens_create_session`, `lens_get_session`, `lens_upload_file`,
  `lens_analyze` (collects SSE, forwards `status` events as MCP progress
  notifications), `lens_lucky`, `lens_abort`, `lens_list_skills`,
  `lens_search_wiki`, `lens_create_wiki_entry`. Admin routes deliberately
  not wrapped.

Files (future): `sdk/`, `mcp/`, `e2e/sdk.spec.ts`, root `package.json`
workspaces declaration.

---

## Phase 3 — Release automation (FUTURE)

Single `scripts/release.sh <version>` drives all surfaces in lockstep with
`info.version`:

1. Bump `info.version` in spec.
2. Run `openapi:check`.
3. Copy spec → `openapi.previous.yaml`.
4. Bump SDK + MCP `package.json` to match.
5. Regenerate `sdk/src/types.ts`.
6. Build + e2e.
7. Update changelogs, commit, `git tag v<version>`, push.
8. Publish SDK + MCP to the **internal** npm registry (never public).

Mirror in `.github/workflows/release.yml` so a tag push re-runs cleanly in CI.

---

## Other-language consumers (no work needed)

OpenAPI is language-neutral. Python, Go, Rust, etc. callers point their
generator (`openapi-python-client`, `oapi-codegen`, `progenitor`, …) at
`GET /openapi.yaml` and produce their own typed clients. We do **not** ship
or maintain non-TS clients in this repo — the spec is the contract.

Python agents that want zero codegen can use the Phase 2 MCP server via the
`mcp` PyPI package over stdio.
