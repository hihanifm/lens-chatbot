# Multi-user Shared Bug Sessions

## Context
Currently each `POST /session` creates an isolated session per user — two engineers opening the same bug get separate, disconnected conversations. The goal is **bug ID = room**: one shared session per bug, where all users who join see each other's messages and agent responses in real time, plus a presence bar showing who's in the session.

### Identity model

- **Login gate on fresh browser.** If no valid UUID is in localStorage, the app redirects to `/login.html` before anything else loads.
- **Name + PIN.** One form handles both registration and login — no separate flows. Name is unique (DB-enforced). If the name is new, it is registered with the PIN. If the name exists and the PIN matches, the user is logged in. Wrong PIN → error.
- **UUID is the stable identity.** Server generates the UUID at registration. On login success, UUID is stored in localStorage. Subsequent visits skip the login page entirely — UUID is fetched from localStorage and verified silently.
- **Cross-device works.** Same name + PIN on any browser → same UUID → same message history and presence identity.

---

## Critical Files

| File | Status | Purpose |
|------|--------|---------|
| `src/broadcast.ts` | **NEW** | In-memory broadcast manager |
| `src/db.ts` | modify | Add `users` table, `user_name` column on messages, `findActiveByBugId` |
| `src/app.ts` | modify | User profile endpoints, idempotent session, `/listen` endpoint, broadcast in `/analyze` |
| `static/index.html` | modify | UUID bootstrap check, presence bar, remote streaming |
| `static/login.html` | **NEW** | Login/register gate — name + PIN form |

---

## Step 0: User Profiles

### `src/db.ts` — new `users` table

```ts
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL UNIQUE,   -- enforced unique; name is the lookup key
    pin_hash   TEXT NOT NULL,
    created_at TEXT NOT NULL
  )
`);
```

Exports:
```ts
export interface User { id: string; name: string; created_at: string; }
// pin_hash is never returned to clients

export const users = {
  getById(id: string): User | undefined,
  getByName(name: string): { id: string; name: string; pin_hash: string; created_at: string } | undefined,
  create(name: string, pinHash: string): User,   // server generates UUID; throws on duplicate name
};
```

Use Node's built-in `crypto.createHash('sha256')` to hash PINs — no extra dependency.

### `src/app.ts` — two endpoints

```ts
// POST /auth — register (name new) or login (name exists)
app.post("/auth", (req, res) => {
  const { name, pin } = req.body;
  if (!name || !pin) return res.status(400).json({ error: "name and pin required" });

  const pinHash = sha256(pin);
  const existing = users.getByName(name.trim());

  if (!existing) {
    // New name → register
    const user = users.create(name.trim().slice(0, 50), pinHash);
    return res.json(user);
  }

  if (existing.pin_hash !== pinHash) {
    return res.status(401).json({ error: "Wrong PIN for that name" });
  }

  // Correct PIN → return profile (without pin_hash)
  return res.json({ id: existing.id, name: existing.name, created_at: existing.created_at });
});

// GET /users/:id — silent verify on return visit
app.get("/users/:id", (req, res) => {
  const user = users.getById(req.params.id);
  if (!user) return res.status(404).json({ error: "not found" });
  res.json(user);
});
```

`sha256` helper (3 lines, no bcrypt dependency):
```ts
import { createHash } from "crypto";
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
```

### `static/login.html` — login/register gate

Simple standalone HTML page. One form: **Name** + **PIN** (type=password, maxlength=6) + Submit.

On submit → `POST /auth {name, pin}`:
- Success → store `user.id` in localStorage as `lens_user_id` → `window.location = '/'`
- 401 → show "Wrong PIN for that name" inline
- Other error → show error message

No separate register/login toggle — one form, the backend decides.

### `static/index.html` — UUID bootstrap (no login UI here)

```js
async function bootstrapUser() {
  const userId = localStorage.getItem('lens_user_id');
  if (userId) {
    const res = await fetch(`/users/${userId}`);
    if (res.ok) return await res.json();
    localStorage.removeItem('lens_user_id');
  }
  // No valid identity → go to login
  window.location.href = '/login.html';
  return null; // execution stops here
}

const currentUser = await bootstrapUser();
if (!currentUser) throw new Error(); // redirect in progress
const myClientId = crypto.randomUUID();
```

Show the username in the header: `👤 Alice` with a "Log out" link that clears `lens_user_id` and redirects to `/login.html`.

---

## Step 1: `src/db.ts`

**Schema migration** — after existing `CREATE TABLE IF NOT EXISTS` calls, add:
```ts
try {
  db.exec(`ALTER TABLE messages ADD COLUMN user_name TEXT DEFAULT 'User'`);
} catch { /* column already exists — safe to ignore */ }
```

**Update `Message` interface** — add `user_name: string` field.

**Update `messages.add`** — add optional `userName?: string` param (defaults to `'User'`):
```ts
add(sessionId: string, role: "user" | "assistant", content: string, userName = 'User'): void
// INSERT includes user_name column
```

**New session lookup**:
```ts
sessions.findActiveByBugId(bugId: string): Session | undefined
// SELECT * FROM sessions WHERE bug_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1
```

**Update `messages.buildSummary`** — use `m.user_name` instead of generic "User" for role=user rows.

---

## Step 2: `src/broadcast.ts` (new file)

```ts
interface ListenClient {
  clientId: string;   // uuid per /listen connection
  userName: string;
  sessionId: string;
  res: Response;
}

const rooms = new Map<string, ListenClient[]>();
```

**Exports:**
- `addClient(sessionId, client)` — adds to rooms map, sends `presence:snapshot` to new joiner, broadcasts `presence:join` to existing clients
- `removeClient(sessionId, clientId)` — removes from map, broadcasts `presence:leave`
- `broadcast(sessionId, event, excludeClientId?)` — writes `data: JSON\n\n` to all clients except excluded one
- `getPresence(sessionId)` — returns `[{clientId, userName}]` for all connected clients

**Heartbeat** — `setInterval` every 25s writes `: ping\n\n` to all connections (keeps proxies from closing idle SSE streams).

**SSE event protocol:**

| Event type | Shape | Direction |
|---|---|---|
| `presence:snapshot` | `{type, users:[{clientId,userName}]}` | server → new joiner only |
| `presence:join` | `{type, clientId, userName}` | server → existing clients |
| `presence:leave` | `{type, clientId, userName}` | server → remaining clients |
| `analyzing` | `{type, user, clientId}` | broadcast from /analyze start |
| `user_message` | `{type, content, user, clientId}` | broadcast from /analyze |
| `text` | `{type, content, user, clientId}` | broadcast from /analyze |
| `status` | `{type, content, user, clientId}` | broadcast from /analyze |
| `done` | `{type, user, clientId}` | broadcast from /analyze |
| `error` | `{type, content, user, clientId}` | broadcast from /analyze |

Include `clientId` in broadcast events so the frontend can key remote streaming bubbles by clientId rather than userName (avoids collision if two users share a name).

---

## Step 3: `src/app.ts`

**Imports:**
```ts
import { addClient, removeClient, broadcast } from "./broadcast.js";
import { randomUUID } from "crypto";
```

**`POST /session` — make idempotent:**
```ts
const existing = sessions.findActiveByBugId(bugId);
if (existing) {
  const bug = await tracker.getBug(bugId);
  return res.json({ session: existing, bug });
}
// ... existing create path unchanged
```

**New `GET /session/:id/listen?userId=UUID&clientId=UUID`:**
```ts
app.get("/session/:id/listen", (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) return res.status(404).json({ error: "session not found" });

  const user = users.get(req.query.userId as string);
  if (!user) return res.status(400).json({ error: "invalid userId" });
  const clientId = (req.query.clientId as string) || randomUUID();

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  addClient(req.params.id, { clientId, userName: user.name, sessionId: req.params.id, res });
  req.on("close", () => removeClient(req.params.id, clientId));
  // no res.end() — connection stays open
});
```

**`GET /session/:id/analyze` — add userId, broadcast:**
- Read `userId` and `clientId` from query params; resolve name via `users.get(userId)`
- Pass resolved `userName` to `messages.add` calls
- Before the agent loop: `broadcast(sessionId, {type:"analyzing", user, clientId}, clientId)` and `broadcast(sessionId, {type:"user_message", content:question, user, clientId}, clientId)`
- In event loop: add `broadcast(sessionId, payload, clientId)` alongside each `res.write()`

---

## Step 4: `static/index.html`

**Display name** — handled entirely by `bootstrapUser()` in Step 0. By the time the rest of the UI runs, `currentUser` is available with `id` and `name`.

**Presence bar** (between `#header` and `#bug-info`):
```html
<div id="presence-bar" style="display:none; background:#f0f9ff; border-bottom:1px solid #bae6fd;
  padding:6px 24px; font-size:12px; color:#0369a1;">
  <span style="font-weight:600;">Also here:</span>
  <span id="presence-names"></span>
</div>
```

**`connectListen(sessionId)`** — opens `/session/:id/listen?userId=...&clientId=...` EventSource:
- `presence:snapshot` → `renderPresence(data.users)`
- `presence:join` / `presence:leave` → update presence list
- `analyzing` → `appendMessage('status', '${data.user} is analyzing...')`
- `user_message` → `appendMessage('user', data.content, false, data.user)`
- `text` → create or append to a remote streaming bubble keyed by `data.clientId`
- `done` → finalize remote bubble, remove from map
- `error` → show error, remove from map

Call `connectListen` at the end of both `resumeSession()` and the load-bug success handler.

**Update `sendQuestion`** — append `&userId=${currentUser.id}&clientId=${myClientId}` to the `/analyze` URL.

**Update `appendMessage(role, content, streaming, userName)`** — add optional `userName` param; render a small attribution label above content when provided.

**Historical messages on resume** — pass `m.user_name` to `appendMessage` in the resume message loop.

**Presence helpers:**
```js
let presenceUsers = [];
function renderPresence(users) {
  presenceUsers = users;
  document.getElementById('presence-names').textContent = users.map(u => u.userName).join(', ');
  document.getElementById('presence-bar').style.display = users.length ? 'block' : 'none';
}
function addPresenceUser(u)      { renderPresence([...presenceUsers, u]); }
function removePresenceUser(cid) { renderPresence(presenceUsers.filter(u => u.clientId !== cid)); }
```

---

## Concurrent Analysis

Two users analyzing simultaneously works without extra logic:
- Each has their own `/analyze` SSE stream back to the requester
- Both broadcast with their own `clientId` — the frontend keys remote bubbles by `clientId`, so two parallel streams render as two separate message threads
- The `analyzing` event fires before the loop, so peers see "Alice is analyzing..." immediately

---

## Verification

1. `npm run dev` — open two browser tabs
2. Both enter the same bug ID → both get the same session ID (check network tab, `session.id` matches)
3. Tab 1 shows Tab 2 in the presence bar and vice versa
4. Tab 2 asks a question → Tab 1 sees the question message and the agent streaming response appear in real time
5. Both tabs close → presence bar clears
6. Restart server → presence clears (in-memory only, expected)
7. Check DB: `SELECT * FROM messages WHERE session_id = '...'` — messages have correct `user_name` values
8. Resume session in a new tab → historical messages show attribution labels
