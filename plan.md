# Plan: Engineering Bottom Bar

## Goal
Fixed bottom strip on every page (except /login) showing build identity + runtime details. Compact one-line summary; click chevron to expand a panel with all fields. GitHub URL served from `/version`.

## Backend changes

### `src/app.ts`
1. Extend `SERVER_BUILD_INFO` with more fields:
   - `appVersion` — from `package.json` (read once at startup).
   - `gitSha` (new key; keep existing `build` for back-compat alias).
   - `repoUrl` — from `package.json` `repository.url`, normalized to https (strip `git+`, `.git`).
   - `env` — `process.env.NODE_ENV ?? "development"`.
   - `startedAt` — ISO timestamp captured at module load.
   - `nodeVersion` — `process.version`.
2. Add helper `readPackageJson()` near `readOpenApiVersion()`.
3. `/version` returns the extended object (keep `api` + `build` keys; add new ones alongside).

No new endpoint — existing `/settings/llm` and `/settings/skills` already expose model, engine, base URL, and skill dirs. Footer fetches what it needs from existing routes.

## Frontend changes

### `frontend/src/api/queries.ts`
Add `useVersion()` hook → `GET /version`, long `staleTime`.

```ts
export interface VersionInfo {
  api: string;
  build: string;       // back-compat alias for gitSha
  appVersion: string;
  gitSha: string;
  repoUrl: string;
  env: string;
  startedAt: string;
  nodeVersion: string;
}
```

### New: `frontend/src/components/StatusBar.tsx`
- Fixed-position bottom strip (`fixed bottom-0 inset-x-0 z-40`), thin (~26px), monospace, small font, neutral bg with top border.
- Compact line: `vX.Y.Z · api X.Y.Z · sha · env · model · engine · uptime`.
- Right side: GitHub link, `/docs` link, chevron toggle.
- Expanded panel: grid of all fields including `baseUrl`, `userName`, `nodeVersion`, `startedAt`, configured skill dir count.
- Uses `useVersion()`, `useLlmSettings()`, `useSkillsSettings()`, `useAuth`.
- Uptime: client computes from `startedAt`, ticks every 30s.
- Env pill colored: `production` red, `development` amber, else gray.
- Hide when route is `/login`.

### `frontend/src/App.tsx`
- Render `<StatusBar />` inside `Shell` after `<main>`.
- Add bottom padding so content isn't covered.

## Files touched
- `src/app.ts` — extend `SERVER_BUILD_INFO`, helper, `/version` payload.
- `frontend/src/api/queries.ts` — `useVersion` + `VersionInfo` type.
- `frontend/src/components/StatusBar.tsx` — new.
- `frontend/src/App.tsx` — mount StatusBar, adjust shell padding.

## Verification
- `npx tsc --noEmit`
- `npm run build`
- `curl localhost:38001/version` shows new fields
- Visual: bar visible on Home + Session; expand works; hidden on /login

## Out of scope
- No new env-exposing endpoint. Data dir / wiki dir omitted (not on existing public routes).
- No auth on `/version` — matches existing internal-tool posture.
- No PIN-gated info in footer.
