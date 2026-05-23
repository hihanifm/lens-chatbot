# OpenAPI Changelog

All notable changes to `docs/openapi.yaml` are recorded here. The version on
each entry mirrors `info.version` in the spec. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and SemVer:

- **MAJOR** — breaking change (removed/renamed field, removed route, changed type)
- **MINOR** — additive change (new route, new optional field)
- **PATCH** — doc-only change (descriptions, examples)

## [0.1.0] — 2026-05-23

Initial published spec. Documents the public-facing HTTP surface of `src/app.ts`:

- Auth: `POST /auth`, `GET /users/{id}`
- Sessions: `POST /session`, `POST /session/adhoc`, `GET /session/{id}`,
  `GET /sessions`, `POST /session/{id}/refresh-bug`, `POST /session/{id}/abort`,
  `POST /session/{id}/stop`
- Workspace: `POST /session/{id}/upload`, `PATCH /session/{id}/files`,
  `GET /session/{id}/workspace/files`, `GET /session/{id}/workspace/file`,
  `GET /session/{id}/workspace/download`, `GET /session/{id}/attachment/download`,
  `GET /session/{id}/attachment/{attId}/stream` (SSE),
  `GET /session/{id}/zip-contents`, `POST /session/{id}/extract-file`,
  `GET /session/{id}/report`
- Analysis (SSE): `GET /session/{id}/analyze`, `GET /session/{id}/lucky`,
  `GET /session/{id}/listen`
- Wiki: `GET /wiki`, `GET /wiki/{module}`, `GET /wiki/{module}/{filename}`,
  `GET /session/{id}/wiki/synthesize` (SSE)
- Skills: `GET /skills`
- Meta: `GET /version`, `GET /openapi.yaml`

Admin/PIN-gated settings routes (`PUT /settings/llm`, `PUT /settings/skills`,
`PUT /settings/features`, `PUT /settings/admin/pin`, `POST /settings/llm/models`)
are intentionally **excluded** — they are UI-only.
