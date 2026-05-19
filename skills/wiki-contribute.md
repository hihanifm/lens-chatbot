---
name: Wiki Contribute
description: Synthesize a confirmed root cause into a reusable wiki entry. Use after reaching a confirmed RCA so the next investigator can shortcut the same bug. Posts to POST /session/:id/wiki.
triggers: [write wiki entry, contribute, document findings, save to wiki, synthesize, knowledge capture, write-up, post-mortem, document root cause]
---

# Wiki Contribute

Use this skill **after** you have a confirmed root cause — not for
speculative findings. The wiki is high-signal-only; partial guesses
dilute its value.

## When to write

Write a new entry if all are true:
- Root cause is confirmed by log evidence, not inferred.
- The bug is non-trivial (would have taken a teammate > 15 min to find).
- No existing wiki entry already covers this exact root cause. (Use the
  `wiki-lookup` skill first to check.)

If a similar entry exists but yours adds a new log pattern or a different
trigger, prefer **extending the existing entry** over creating a new one.
Mention this in your final reply so a human can do the merge.

## How to write

Post to the session's wiki endpoint:

```bash
curl -sS -X POST "http://localhost:$PORT/session/$SESSION_ID/wiki" \
  -H 'content-type: application/json' \
  -d '{
    "module": "<slug, e.g. ims, anr, tombstone, connectivity>",
    "title": "<short symptom-shaped title>",
    "tags": ["<tag1>", "<tag2>"],
    "body": "<markdown body — see structure below>"
  }'
```

(The exact URL is in the task context. If unsure, ask the user.)

The backend names the file `YYYYMMDD-BUGID-slug.md` and updates
`<module>/index.md` automatically. No manual file edits.

## Required body structure

```markdown
## Problem
One paragraph: what the user/system observed.

## Root Cause
One paragraph: the underlying defect or condition. Be specific —
"NPE in FooBar.onConnected when WiFi handover races with VoLTE
registration" beats "race condition in IMS".

## Evidence
Bulleted citations using the standard format (`file:line — timestamp PID TID L TAG: message`).
3–6 lines is plenty. Each line should be one fact, not a summary.

## Resolution
What fixed it (if known), or what mitigations exist. If unfixed,
say "Not yet fixed — workaround: …".

## Key Log Patterns
Ripgrep patterns the next investigator can run against a fresh bugreport
to confirm this is the same bug. One per line, fenced as bash.
```

## Tags

Pick 2–4 tags. Reuse existing ones from the module index where possible
(check via `wiki-lookup` first). New tags are fine but don't invent
synonyms of existing ones.

## After posting

Mention in your final reply:
- The path the backend returned (`wiki/<module>/<filename>`).
- One sentence on what's new vs. existing entries in that module.
