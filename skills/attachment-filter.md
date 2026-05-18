---
name: Attachment Filter
description: Heuristic to decide which workspace files are worth showing the model. Filters noise (binaries, screenshots, dumps) and prioritizes high-signal Android log files. Used by Lucky autoselection and chat default-selection.
triggers: [filter, attachments, files to include, file selection, what to analyze, noise, prioritize, skip files]
---

# Attachment Filter

Use this skill when you need to decide which files to expose to the model
out of a large attachment set (we routinely see 200+ files per Android bug,
most of them noise). It's also read by the backend to seed the default
`Selected files` list at session start and to pre-trim Lucky's working set.

## How the agent should use it

1. If you're listing files for the user, read this skill first so you can
   call out which ones look high-signal (priority/useful) vs noise (skip).
2. If a file you need was classified `skip`, you can still read it via the
   shell — the filter only controls default selection, not visibility.
3. If you find a pattern of useful files that the rules below miss, suggest
   adding the glob to this file in your final report.

## Classification rules

The backend parses the first `json` fenced block below. Globs are matched
against the path **relative to the workspace** (e.g.
`attachments/bugreport-x/FS/data/anr/traces.txt`).

- `priority` — almost always worth reading. Auto-selected.
- `useful` — usually worth reading. Auto-selected.
- `skip` — rarely useful (binaries, media, dumps). Not auto-selected.
- `size_cap_mb` — any single file above this is excluded from auto-selection
  regardless of classification (user can still manually add via file
  explorer).

Order: `skip` wins over `useful`, `useful` wins over `priority` only if both
match — list specific patterns last. (Implementation: first matching rule
in the order `skip → priority → useful` decides.)

```json
{
  "priority": [
    "**/bugreport-*.txt",
    "**/bugreport-*.zip",
    "**/dumpstate-*.zip",
    "**/radio_log*",
    "**/main_log*",
    "**/kernel_log*",
    "**/dmesg*",
    "**/anr/traces*.txt",
    "**/tombstones/tombstone_*",
    "**/system_log*",
    "**/logcat*"
  ],
  "useful": [
    "**/*.log",
    "**/*.txt",
    "**/*.out",
    "**/*.json",
    "**/*.xml",
    "**/*.csv",
    "**/*.yaml",
    "**/*.yml",
    "**/*.md",
    "**/*.trace",
    "**/*.htrace",
    "**/FS/data/misc/radio/**",
    "**/FS/data/anr/**",
    "**/FS/data/tombstones/**"
  ],
  "skip": [
    "**/*.png",
    "**/*.jpg",
    "**/*.jpeg",
    "**/*.gif",
    "**/*.webp",
    "**/*.bmp",
    "**/*.mp4",
    "**/*.mov",
    "**/*.webm",
    "**/*.mp3",
    "**/*.wav",
    "**/*.zip.tmp",
    "**/*.bin",
    "**/*.dmp",
    "**/*.dump",
    "**/*.apk",
    "**/*.so",
    "**/*.dex",
    "**/*.odex",
    "**/*.vdex",
    "**/*.art",
    "**/*.oat",
    "**/*.elf",
    "**/*.img",
    "**/*.gz.bin",
    "**/screenshot_*",
    "**/screenshot-*",
    "**/Screenshot*",
    "**/thumbnail_*",
    "**/.DS_Store",
    "**/Thumbs.db",
    "**/__MACOSX/**",
    "**/cache/**",
    "**/code_cache/**"
  ],
  "size_cap_mb": 200
}
```

## Maintenance

Add new patterns here as the team learns. The file is loaded fresh per
session, so edits take effect on the next analysis — no rebuild required
if you mount `SKILLS_DIR` as a volume.
