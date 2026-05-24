# Plan: unify version display

## Goal
Show a single version in the StatusBar instead of `appVersion` + `api`. Reduce cognitive load.

## Files
- `frontend/src/components/StatusBar.tsx`

## Steps
1. Compact line: replace `v{appVersion} · api {api} · {sha}` with `v{appVersion} · {sha}`.
2. Expanded panel: remove the `api: {api}` row. Keep `appVersion`, `gitSha`, `nodeVersion`, `startedAt`.
3. Backend `/version` unchanged — `api` field remains for any external consumer, just not surfaced in UI.
