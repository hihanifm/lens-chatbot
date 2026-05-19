---
name: Prior Reports
description: Read previous analysis reports from agent_notes/ before re-investigating. Each turn starts fresh, but prior turns wrote reports — reuse their findings.
triggers: [prior report, agent_notes, previous analysis, follow-up, last time, earlier finding, what did we conclude, re-investigate]
---

# Prior Reports

Use this skill when the task prompt lists prior reports, or whenever you
notice `agent_notes/*.md` files in the workspace. They're written by
previous agent turns on the **same bug** and often contain the answer.

## Where they live

```
<workspacePath>/agent_notes/*.md
```

The task prompt may include a line like:

```
Prior reports (most recent first):
  agent_notes/lucky-act-20260518-153022.md
  agent_notes/2026-05-18-followup.md
```

If no such line is present, no prior reports exist — skip this skill.

## How to use

1. **Read the most recent report first.** Filenames are timestamped;
   the top of the list is the latest.
2. **Reuse its root cause and evidence** if the same files are still
   in the workspace. Don't re-derive what's already confirmed.
3. **Treat older reports as supporting context**, not as authoritative —
   the most recent supersedes if they conflict.
4. **Build on, don't repeat.** If the user is asking a follow-up
   ("what about thread X?"), use the prior report as the baseline and
   add only the new analysis.

## When to ignore

If the prior report is clearly about a different symptom, or its
evidence files are no longer in the workspace, note that briefly and
proceed with fresh analysis.

## Output

If you reuse a prior report's conclusion, cite it:

```
agent_notes/<filename> — <one-line summary of what you reused>
```

so the user can audit the chain of reasoning.
