---
name: Explore Workspace
description: List all files in the bug workspace and extract zip attachments
triggers: [ls, list files, what files, attachments, zip, explore, show files, downloaded]
---

# Explore Workspace

Use this skill when the user asks to list files, wants to know what was downloaded,
says "ls", "what files do we have", "show me the attachments", or similar.

## Steps

`WORKSPACE` is set in your task header — copy it exactly (the line starting with `WORKSPACE=`).

1. **Extract any zip files** found in `attachments/`:

```bash
find "$WORKSPACE"/attachments -name "*.zip" | while read z; do
  unzip -o "$z" -d "${z%.zip}"
  echo "Extracted: $z"
done
```

2. **List all files** in the workspace with sizes, sorted by path:

```bash
find "$WORKSPACE" -type f | sort | xargs ls -lh 2>/dev/null
```

Or for a cleaner tree view using rg:

```bash
rg --files "$WORKSPACE" | sort
```

## Output format

Present the result as a grouped list by directory, like:

```
attachments/
  app-logs.zip          (original archive)
  app-logs/
    application.log     2.3 MB
    error.log           145 KB
    gc.log              890 KB

agent_notes/            (empty)
bug_summary.md          1.2 KB
bug.json                3.4 KB
```

Tell the user the total file count and total size, and flag any file types that
look like logs (`.log`, `.txt`, `.out`, `.json`) vs binaries or archives.

## Android `bugreport-*.zip` specifics

Android bug reports have a predictable layout once extracted:

```
bugreport-*.zip
├── bugreport-*.txt           ← full system dump; locate sections first
├── dumpstate_board.txt       ← board-specific dumps
└── FS/
    └── data/
        ├── anr/traces.txt    ← ANR traces
        ├── tombstones/       ← native crash dumps
        └── misc/radio/       ← radio / IMS logs
```

The `bugreport-*.txt` file is huge but section-delimited. Jump to the right
section instead of scanning the whole thing:

```bash
rg '^------' "$WORKSPACE"/attachments/**/bugreport-*.txt
```

Common section headers: `------ SYSTEM LOG (logcat) ------`,
`------ DUMPSYS ------`, `------ ANR (/data/anr/traces.txt) ------`.
