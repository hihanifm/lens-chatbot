# UI Redesign: Navy Blue / White Professional Theme

**Goal:** Replace the current indigo/purple (#6366f1) palette and near-black sidebar with a Chase Bank / Samsung-style navy + sky blue + white design.

**Scope:** CSS-only + minor HTML text changes. Zero JS logic changes (one optional avatar initial in JS noted below).

---

## Color Tokens — add `:root` block at top of `<style>` in `index.html`

```css
:root {
  --navy:            #002366;   /* sidebar bg, primary buttons, brand */
  --navy-hover:      #0d4f9e;   /* session active */
  --navy-muted:      #0a3d7a;   /* session list hover */
  --action:          #0062cc;   /* interactive hover, focus, links */
  --action-disabled: #7ab3e0;   /* disabled button bg */
  --sidebar-text:    #e2eaf7;
  --sidebar-muted:   #7ba4d4;
  --sidebar-border:  rgba(255,255,255,0.10);
  --sky-chip:        #dbeafe;   /* chip/pill bg */
  --sky-border:      #93c5fd;   /* chip/pill border */
  --sky-text:        #003087;   /* chip/pill text */
  --chat-bg:         #eff6ff;
  --page-bg:         #f0f6ff;
  --focus-shadow:    rgba(0,98,204,0.15);
  --explorer-bg:     #001a4d;
}
```

---

## `static/index.html` — CSS bulk replacements

Do these exact string replacements in the `<style>` block only (not in JS):

| Find | Replace | Component |
|---|---|---|
| `background: #f0f2f5` | `background: var(--page-bg)` | body |
| `background: #0f1117` | `background: var(--navy)` | sidebar |
| `color: #e5e7eb` *(on #sidebar)* | `color: var(--sidebar-text)` | sidebar text |
| `color: #f9fafb` | `color: #ffffff` | brand text |
| `border-bottom: 1px solid #1f2937` | `border-bottom: 1px solid var(--sidebar-border)` | brand separator |
| `color: #4b5563` *(sidebar h2, brand-sub, .date)* | `color: var(--sidebar-muted)` | sidebar muted |
| `background: #1c1f26` | `background: var(--navy-muted)` | session hover |
| `background: #1e2a3a` | `background: var(--navy-hover)` | session active |
| `border-top: 1px solid #1f2937` | `border-top: 1px solid var(--sidebar-border)` | footer divider |
| `background: #1e2a3a` *(avatar)* | `background: rgba(255,255,255,0.12)` | avatar |
| `border: 1.5px solid #374151` | `border: 1.5px solid rgba(255,255,255,0.20)` | avatar border |
| `color: #f3f4f6` | `color: #ffffff` | sidebar-username |
| `color: #6b7280` *(sidebar elements)* | `color: var(--sidebar-muted)` | logout, badge, settings btn |
| `background: #1c1f26` *(settings btn hover)* | `background: rgba(255,255,255,0.10)` | settings hover |
| `background: #6366f1` | `background: var(--navy)` | all primary buttons |
| `background: #4f46e5` | `background: var(--action)` | all primary hover |
| `background: #c7d2fe` | `background: var(--action-disabled)` | disabled buttons |
| `border-color: #6366f1` | `border-color: var(--action)` | focus borders |
| `box-shadow: 0 0 0 3px rgba(99,102,241,0.1)` | `box-shadow: 0 0 0 3px var(--focus-shadow)` | focus rings |
| `box-shadow: 0 0 0 3px rgba(99,102,241,0.08)` | `box-shadow: 0 0 0 3px var(--focus-shadow)` | textarea focus |
| `background: #eef2ff` | `background: var(--sky-chip)` | chips, pills, toggle hover |
| `border: 1.5px solid #a5b4fc` | `border: 1.5px solid var(--sky-border)` | attachment pills |
| `border: 1px solid #a5b4fc` | `border: 1px solid var(--sky-border)` | context chips |
| `color: #4338ca` | `color: var(--sky-text)` | chip/pill text |
| `border-color: #a5b4fc` | `border-color: var(--sky-border)` | chip hover |
| `background: #e0e7ff` | `background: #bfdbfe` | attachment hover bg |
| `border-color: #6366f1` *(attachment hover)* | `border-color: var(--action)` | attachment hover border |
| `color: #3730a3` | `color: var(--navy)` | attachment hover text |
| `border-left: 3px solid #e0e7ff` | `border-left: 3px solid #bfdbfe` | comment accent |
| `background: #f8fafc` *(#chat)* | `background: var(--chat-bg)` | chat area |
| `background: #eef2ff` *(copy btn hover)* | `background: var(--sky-chip)` | copy btn |
| `border-color: #c7d2fe` | `border-color: var(--sky-border)` | copy btn hover border |
| `linear-gradient(135deg, #6366f1, #4f46e5)` | `linear-gradient(135deg, #003087, var(--action))` | user chat bubble |
| `rgba(99,102,241,0.25)` | `rgba(0,48,135,0.25)` | user bubble shadow |
| `color: #6366f1` *(eng-log hover)* | `color: var(--action)` | eng log toggle hover |
| `color: #818cf8` *(context chip remove)* | `color: var(--action)` | chip remove btn |
| `background: #1a1d27` | `background: var(--explorer-bg)` | file explorer drawer |
| `border-bottom: 1px solid #2d3143` | `border-bottom: 1px solid var(--sidebar-border)` | explorer header |
| `color: #9ca3af` *(explorer header)* | `color: var(--sidebar-muted)` | explorer header text |
| `border-top: 1px solid #2d3143` | `border-top: 1px solid rgba(255,255,255,0.08)` | comment section divider |
| `color: #a5b4fc` | `color: var(--sky-border)` | comment author in explorer |
| `background: #252836` | `background: var(--navy-muted)` | explorer file row hover |
| `color: #818cf8` *(in-context)* | `color: var(--sky-border)` | in-context file name |
| `border-color: #6366f1` *(exp-add-btn)* | `border-color: var(--action)` | add btn hover |
| `color: #818cf8` *(exp-add-btn)* | `color: var(--sky-border)` | add btn hover text |
| `background: #1e1b4b` | `background: rgba(0,98,204,0.25)` | in-context add btn bg |
| `background: #ede9fe` *(explorer-btn.active)* | `background: var(--sky-chip)` | explorer btn active |
| `color: #6d28d9` | `color: var(--sky-text)` | explorer btn active text |
| `border-color: #c4b5fd` | `border-color: var(--sky-border)` | explorer btn active border |

---

## `static/index.html` — New CSS rules (append to end of `<style>`)

```css
/* Brand icon — "WR" monogram box */
#sidebar-brand .brand-icon {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.5px;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: rgba(255,255,255,0.15);
  border: 1.5px solid rgba(255,255,255,0.25);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  flex-shrink: 0;
}

/* Avatar — styled circle (content set by JS or left empty) */
#sidebar-avatar {
  color: #ffffff;
  font-size: 14px;
  font-weight: 700;
  background: rgba(255,255,255,0.15);
  border: 1.5px solid rgba(255,255,255,0.25);
}
```

---

## `static/index.html` — HTML text changes

| Location | Find | Replace |
|---|---|---|
| `#sidebar-brand` .brand-icon | `⚔️` | `WR` |
| `#sidebar-avatar` | `👤` | *(empty)* |
| `#wiki-session-btn` | `📖 Add to wiki` | `Add to Wiki` |
| `#wiki-modal h3` | `📖 Save to troubleshooting wiki` | `Save to Troubleshooting Wiki` |
| `#explorer-btn` | `🗂 Files` | `Files` |

---

## `static/index.html` — Fix 2 inline styles directly in HTML

**Presence bar** (find by `background:#f0f9ff`):
```
background:#f0f9ff → background:#eff6ff
border-bottom:1px solid #bae6fd → border-bottom:1px solid #bfdbfe
color:#0369a1 → color:#003087
```

**Reset cancel button** (find `background:#f3f4f6; color:#374151` on `#reset-cancel-btn`):
```
background:#f3f4f6 → background:#f0f6ff
color:#374151 → color:#003087
```

---

## `static/login.html` — CSS changes

Add `border-top: 4px solid #002366;` to `.card`.

Add to `<style>`:
```css
.brand-icon {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.5px;
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: #002366;
  color: white;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
```

Swap these values in the existing CSS:

| Find | Replace |
|---|---|
| `background: #f0f2f5` | `background: #f0f6ff` |
| `color: #0f1117` *(brand-name)* | `color: #002366` |
| `border-color: #6366f1` | `border-color: #0062cc` |
| `rgba(99,102,241,0.10)` | `rgba(0,98,204,0.12)` |
| `background: #6366f1` *(submit)* | `background: #002366` |
| `background: #4f46e5` | `background: #0062cc` |
| `background: #c7d2fe` | `background: #7ab3e0` |

HTML: `<span class="brand-icon">⚔️</span>` → `<span class="brand-icon">WR</span>`

---

## Optional JS tweak (avatar initials)

In the section where `sidebar-username` is set, also add:
```js
document.getElementById('sidebar-avatar').textContent = currentUser.name[0].toUpperCase();
```
Not required — the styled empty circle still looks clean without it.

---

## Verification Checklist

- [ ] Login page: navy top-border on card, blue button, WR monogram, no purple
- [ ] Sidebar: deep navy (#002366), WR box, muted sky-blue secondary text
- [ ] Avatar: styled circle (with or without initial)
- [ ] Bug info: attachment pills and context chips are sky-blue/navy
- [ ] Chat: user bubble is navy gradient, assistant bubble is white, chat bg is #eff6ff
- [ ] Files drawer: matches sidebar navy tone (#001a4d)
- [ ] All focus rings: blue (#0062cc), no purple
- [ ] Search `#6366f1` in both files — should return zero matches
- [ ] Search `#4f46e5` in both files — should return zero matches
- [ ] Search `#0f1117` in both files — should return zero matches
