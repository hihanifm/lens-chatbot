# Plan — code review follow-up fixes (2026-05-22)

## Goal
Fix 2 security findings + 4 tech-debt items from the app.ts/db.ts review. Skip per-session
authorization (#3) by decision — keeps the collaborative `/listen` mirror open.

## Files
- `src/db.ts` — `users.updatePinHash`, `sessions.listExpiredBefore`, `sessions.delete`, capped `messages.buildSummary`
- `src/app.ts` — scrypt user PINs + legacy migration, PIN-gate `POST /settings/llm/models`, `/skills` cache TTL, `/analyze` + `/lucky` concurrency guard
- `src/services/retention.ts` — NEW: expired-session sweeper
- `src/index.ts` — wire `startRetentionSweeper()`

## Steps
1. **Security #1 — API-key leak / SSRF.** Add admin-PIN gate to `POST /settings/llm/models`
   (matches the other `/settings/*` mutations). Closes the unauthenticated stored-key
   exfiltration path.
2. **Security #2 — user PINs.** Hash with scrypt via existing `hashPin`/`verifyPin`. On login,
   detect legacy unsalted SHA-256 hashes (no `:`), verify, and transparently re-hash. Add
   `users.updatePinHash`.
3. **Retention.** New `retention.ts`: `sweepExpiredSessions(days)` deletes sessions older than
   `SESSION_RETENTION_DAYS` plus their messages and workspace dirs. Default 0 = disabled
   (opt-in — destructive). Run on startup + every 24h.
4. **Concurrency guard.** In-memory `Set<sessionId>` of in-flight analyses. `/analyze` and
   `/lucky` return 409 if the session is already running; released in `finally`.
5. **`buildSummary` cap.** Limit to last 40 turns, 4000 chars/msg (parity with CLI history).
6. **`/skills` cache TTL.** 30s expiry on `skillsCache`, matching the documented principle.

## Verify
`npx tsc --noEmit` (server) + `npm test`.
