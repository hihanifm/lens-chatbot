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
  agent_notes/      ← persist your findings here across turns
```

## Citation format

Cite evidence as: `<file>:<line> — MM-DD HH:MM:SS.mmm PID TID L TAG: message`.
Always include the timestamp and PID/TID when present — they anchor the event in
time and process. For multi-line stack traces, cite the FATAL line plus the first
2–3 stack frames.

## Notes

- Do not modify files outside the workspace.
- Prefer `rg` over `grep` for searching large log files — significantly faster.
- Write findings to `agent_notes/` so they persist across conversation turns.
- Skills are listed in the task prompt. **Read the relevant ones before starting**
  — for Android log triage, `android-log-file-map` tells you which file to open
  for a given topic; `explore-workspace` covers zip extraction and the
  `bugreport-*.zip` layout; `android-rca-report` defines the answer structure
  for analysis questions.

## Troubleshooting Wiki

A growing knowledge base of synthesized insights from resolved bug investigations:
  - `WIKI_DIR/index.md`              ← module directory
  - `WIKI_DIR/<module>/index.md`     ← bug catalog per module
  - `WIKI_DIR/<module>/YYYYMMDD-BUGID-slug.md` ← full entry

IMPORTANT: If the task prompt provides a wiki index path, you MUST read it before
doing anything else. Confirmed root causes from past bugs shortcut investigation —
do not re-derive what is already documented. Navigate: root index → module index →
entry file(s).
