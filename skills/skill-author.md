---
name: Skill Author
description: Capture a troubleshooting insight as a new or updated team skill. Use when the user says the bug taught them something reusable. Asks the user a few focused questions, then outputs a complete proposed skill file in chat for the user to commit to the team skills repo.
triggers: [should be a skill, add to skill, update the skill, new skill, capture this, save this for next time, team skill, improve the skill, skill update, turn this into a skill]
---

# Skill Author

Use this skill when the user wants to capture a troubleshooting insight from
the current session so the next investigator (and the next agent run)
benefits from it.

**The app does not write to the skills directory.** The skills folder is
read-only at runtime — it's the deployed view of a separate team-owned
skills git repo, pulled in on a schedule. So your job is to produce a
complete, paste-ready skill file in chat. The user commits it to the team
repo. The backend's next sync makes it live for everyone.

## 1. Elicit before authoring — never synthesize from chat history alone

The conversation that led to the insight is noisy: dead ends, debugger
detours, things the user already knew. The user is the only one who knows
which slice is reusable. **Ask first, draft second.** Send a single message
with 2–4 focused questions and wait for the answers:

- "In one sentence, what's the new thing the next investigator should do?"
  → seeds the skill's opening sentence.
- "What would you (or a teammate) type to make you reach for this? Give
  me 2–3 phrases." → becomes the `triggers` list.
- "Is this a refinement of an existing skill (and which one), or a new
  topic?" → decides extend vs new file. If extend, read the existing body
  now via shell (`cat /app/skills/<name>.md`).
- "What's the concrete evidence pattern that anchors it? A file path, an
  `rg` query, a SIP code, a stack frame — something copy-pasteable." →
  becomes the body's concrete-commands section.

Only after the user answers do you draft the file. If the user answers
tersely or skips a question, ask one follow-up — don't paper over with
assumptions. Output quality is a direct function of input scope.

## 2. New skill vs extend existing

- **New skill**: distinct procedure / topic / module not covered by an
  existing skill. Different triggers, different file.
- **Extend existing**: refinement to a procedure already documented (e.g. a
  new SIP code, a new log pattern, a new tombstone signature). Read the
  existing body first via shell, then propose the **full updated body**
  inline — not a diff fragment. Easier for the user to paste; the
  destination is one file, not a patch.

When in doubt, prefer extending. Skill sprawl is its own problem.

## 3. Frontmatter requirements

Mirror existing skills in this folder. Required fields:

- `name` — Title Case, short noun phrase. ("IMS / VoLTE Triage", not "ims")
- `description` — one sentence. Start with the verb, end with what it
  produces. Aim for ~25 words; the loader uses it for trigger matching.
- `triggers` — list of lowercase phrases a user would actually say. Cover
  symptoms ("anr fired"), domain terms ("volte"), and intent ("triage").
  6–12 entries is typical.
- `disabled` — boolean, optional. Omit unless intentionally shipping
  disabled.

## 4. Body conventions

Mirror the existing module-triage skills (`ims-volte-triage`, `anr-triage`,
`tombstone-triage`):

- Open with **"Use this skill when…"** so the next agent knows the firing
  condition without re-reading the frontmatter.
- Provide concrete shell commands. Use `$WORKSPACE` for the workspace root.
- Cross-reference related skills by name (e.g. "See `android-log-file-map`
  for the file → topic table").
- End with an output-format hint when applicable ("Cite findings using the
  citation-format from rules" / "Write the final report using
  `android-rca-report`").
- No emoji unless the user explicitly asked.
- Keep prose tight. Every paragraph should answer "what should the agent
  do here?" — not background context.

## 5. Output format for the chat reply

After elicitation is complete, post **exactly** this structure:

```
### Proposed skill update

**Save to**: `skills/<filename>.md` in the team skills repo
**Type**: New skill | Extension of <existing-skill-name>

` ` `markdown
<full file body — frontmatter and all — starting with --- and ending at the last paragraph>
` ` `

**Why**: <one sentence on what insight this captures>
**Triggers chosen because**: <one sentence on how you picked the trigger phrases>
```

(Replace the spaced backticks with real triple-backticks; they're spaced
here so this skill itself parses cleanly.)

The fenced markdown block lets the user copy in one click. The metadata
above lets them route the commit correctly. The "Why" and "Triggers"
footers help the reviewer understand intent during code review.

## 6. Anti-patterns

- **Don't propose skill changes for one-off bugs.** Only propose what the
  next investigator on a *different* bug would also benefit from. If you
  can't think of another bug this would help on, it's a wiki entry, not
  a skill.
- **Don't duplicate content** that exists in another skill — extend, don't
  fork.
- **Don't propose machine-parsed data blocks** (like the JSON in
  `attachment-filter`) without also calling out that a validator is
  needed. See the "User-editable skill data principle" in CLAUDE.md.
- **Don't auto-synthesize from chat history.** Always elicit. The user's
  answers are the source of truth; the chat log is just context.
- **Don't propose changes the user didn't ask for.** If they wanted a SIP
  code added, add the SIP code — don't also restructure the whole skill.

## 7. After the user commits

Remind them in one line:

> The backend syncs from the team skills repo on a schedule — your commit
> will be live for the whole team on the next pull.

That's it. No further action from you.
