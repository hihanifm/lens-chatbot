# Slash-Command Skill Picker

## Context

Users have no way to discover or invoke specific skills from the chat UI. Skills exist as markdown files loaded by the agent, but are invisible to the user. This feature adds a `/` trigger in the chat input that shows a filterable dropdown of available skills — similar to slash commands in coding agents like Cursor or Cline. Selecting a skill inserts its name into the message; the agent (which already has all skill definitions in its prompt) will apply it.

---

## Changes

### 1. `src/app.ts` — Add `GET /skills` endpoint

Call the existing `loadAgentSkills()` (already imported for the agent pipeline) and return a JSON array. Strip `filePath` from the response — no server paths exposed to the client.

```
GET /skills
→ 200 [{ name, description, triggers }]
```

Place it near the other informational routes (e.g. near `/version`).

### 2. `static/index.html` — Skill picker UI

#### Fetch & cache
On DOM ready, fetch `/skills` once and store in a module-level `let skillsCache = []`. Silent fail if the endpoint errors — picker just won't appear.

#### Markup
Add `#skill-picker` div inside `#input-row`, positioned above the textarea. Hidden by default. Mirror the existing `#session-menu` dropdown style (same card + item pattern).

```html
<div id="skill-picker">
  <!-- .skill-item rows rendered dynamically -->
</div>
```

#### Input listener
On `input` event of `#question-input`:
1. Find the current word at cursor (text from last space/newline to cursor position).
2. If it starts with `/`:
   - Extract the filter string (text after `/`).
   - Filter `skillsCache` by `name` or `description` (case-insensitive substring match).
   - Render matched skills as `.skill-item` rows and show `#skill-picker`.
3. Otherwise: hide `#skill-picker`.

Each `.skill-item` shows the skill `name` (bold) and `description` (muted, smaller).

#### Selection (click only)
On `.skill-item` click:
- Replace the `/xxx` word in the input with the skill name (e.g. `Explore Workspace`).
- Hide `#skill-picker`.
- Re-focus the textarea.

On `Escape` keydown while picker is visible → hide picker.

#### Dismiss on outside click
Reuse the existing outside-click pattern (same as `#session-menu` dismiss).

#### CSS
Add styles for:
- `#skill-picker`: absolute card above input, `bottom: calc(100% + 6px)`, box-shadow, border-radius, max-height with overflow-y scroll
- `.skill-item`: padding, hover highlight, cursor pointer
- `.skill-name`: font-weight bold
- `.skill-desc`: smaller, muted color

Mirror `.session-menu` / `.att-menu` patterns already in the file.

---

## Files to Change

| File | Change |
|------|--------|
| `src/app.ts` | Add `GET /skills` endpoint |
| `static/index.html` | Picker markup, CSS, fetch/cache, input listener, selection handler |

No new files. No DB changes. No schema changes.

---

## Success Criteria

1. Type `/` in chat input → picker appears listing all non-disabled skills
2. Type `/search` → list filters to matching skills only
3. Click a skill → `/xxx` replaced with skill name, picker closes, textarea focused
4. Type `Escape` → picker closes, input unchanged
5. Submit message with skill name → agent response applies that skill
6. `npm run test:e2e` passes with no regressions
