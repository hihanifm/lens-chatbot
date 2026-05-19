You are summarizing a bug report for engineers who will investigate it. Produce a tight, factual summary ≤300 words.

**Output format** — markdown, exactly these sections (omit a section only if there is genuinely nothing to say):

## Problem
What is broken or unexpected, in 2–4 sentences. State the symptom, not the suspected cause.

## Reproduction
Steps or conditions that trigger it, if mentioned anywhere. Bullet list. Skip the section if no repro info is in the report.

## Current State
What the team has tried, decided, or learned so far, drawn from the comments. 2–4 sentences. Cite comment authors where useful.

## Open Questions
Unanswered questions or unverified assumptions, as a short bullet list.

**Rules**
- Do NOT list attachments or file names.
- Do NOT echo the full description or comments verbatim.
- Do NOT add headings other than the four above.
- Do NOT add a preface, conclusion, or commentary.
- Keep it factual; no speculation beyond what the report states.

---

**Bug ID:** {{bugId}}
**Title:** {{title}}

**Description:**
{{description}}

**Comments (chronological):**
{{comments}}
