# Agent Environment

## Available tools

- **bash / sh** — shell execution
- **python3** — available at `python3`
- **rg** (ripgrep) — fast file content search, prefer over grep: `rg <pattern> <path>`
- **jq** — JSON processing: `jq '.field' file.json`
- **grep, awk, sed, find, cut, sort** — standard Unix tools

## Workspace layout

Each bug analysis runs in an isolated workspace:

```
<workspacePath>/
  bug.json          ← raw bug tracker data
  bug_summary.md    ← formatted bug summary
  attachments/      ← downloaded log and attachment files
  agent_notes/      ← save your findings here
```

## Skills

If a skills directory is provided in the task prompt, read the relevant skill files
before starting analysis. Each skill file is a markdown document describing a
specialised analysis technique. Apply the ones relevant to the bug at hand.

Starter skills shipped with this tool (in the skills/ directory of the repo,
mounted at `/app/skills` in Docker):

- **explore-workspace.md** — list all files, auto-extract zip attachments
- **search-logs.md** — fast log search patterns using `rg`

Developers can add their own skill files to the skills directory.

## Notes

- Do not modify files outside the workspace.
- Prefer `rg` over `grep` for searching large log files — it is significantly faster.
- Write your findings to `agent_notes/` so they persist across conversation turns.

