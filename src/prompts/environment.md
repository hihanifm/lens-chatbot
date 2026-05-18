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

## Troubleshooting Wiki

A growing knowledge base of synthesized insights from resolved bug investigations.
The wiki is organized as:
  - WIKI_DIR/index.md              ← module directory (what each module covers, entry count)
  - WIKI_DIR/<module>/index.md     ← bug catalog for that module (one line per entry + summary)
  - WIKI_DIR/<module>/YYYYMMDD-BUGID-slug.md  ← full entry with root cause, evidence, resolution

IMPORTANT: At the start of every analysis task, if the task prompt provides a wiki index path,
you MUST read it before doing anything else. This is not optional. Confirmed root causes and
log patterns from past bugs will shortcut your investigation — do not re-derive what is already
documented. Follow the three-step navigation: root index → module index → entry file(s).

