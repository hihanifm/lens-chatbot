# Agent Environment

## Available tools

- **bash / sh** — shell execution
- **python3** — available at `python3`
- **rg** (ripgrep) — fast file content search, prefer over grep
- **jq** — JSON processing
- **grep, awk, sed, find, cut, sort, unzip** — standard Unix tools

## Workspace layout

```
<workspacePath>/
  bug.json          ← raw bug tracker data
  bug_summary.md    ← formatted bug summary (read first for context)
  attachments/      ← downloaded log and attachment files
  reports/          ← write your final analysis reports here (shown to the user)
  agent_notes/      ← scratchpad: working notes, intermediate findings
```

## Notes

- Do not modify files outside the workspace.
- Prefer `rg` over `grep` for searching large log files — significantly faster.
- Write final reports to `reports/` — these are surfaced to the user in the chat UI.
- Use `agent_notes/` for intermediate working notes and scratchpad content.
- Skills are listed in the task prompt. Read the relevant ones before starting —
  each skill's frontmatter `triggers` tells you when it applies. Citation format,
  wiki access, prior-report reuse, and Android log triage are all covered by skills.
