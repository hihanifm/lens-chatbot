# Logging Improvements

## Context

Server logs currently lack stack traces, SSE lifecycle events, and level filtering. Silent catches swallow errors with no trace. Agent tool calls are only visible in SSE (browser), not server logs. `sessionId` is already logged in most places and serves as a natural correlation key. Goal: full end-to-end observability for faster troubleshooting.

## Scope

- Add `LOG_LEVEL` env var (`debug|info|warn|error`), default `info`
- Add stack traces to all catch blocks
- Log SSE client connect/disconnect
- Fix silent error suppression (catch blocks with no log)
- Log agent tool events server-side at debug level
- Ensure `sessionId` is present in all relevant log calls
- No DB logging (too noisy)
- Zero new dependencies, no interface changes

## Files to Modify

| File | Changes |
|------|---------|
| `src/logger.ts` | Add LOG_LEVEL gating with numeric threshold |
| `src/agent/clineCoreAgentRunner.ts` | Stack traces, tool event logs (debug) |
| `src/services/attachmentService.ts` | Fix silent catch in listZipContents |
| `src/broadcast.ts` | Log addClient/removeClient |
| `src/app.ts` | SSE lifecycle logs, fix silent catches, add stack traces |
| `src/index.ts` | Use log.info for startup banner instead of console.log |
| `.env.example` | Document LOG_LEVEL |

---

## Step-by-Step Changes

### 1. `src/logger.ts` — Log level gating

Add a numeric level map and threshold computed once at module load. Each method gets an early-return guard before calling `console.*`. Existing call signatures are unchanged.

```typescript
const LEVELS: Record<string, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const threshold = LEVELS[(process.env.LOG_LEVEL ?? "info").toLowerCase()] ?? 1;
const shouldLog = (level: number) => level >= threshold;

// In each method, add at the top:
// if (!shouldLog(LEVELS["debug"])) return;   ← for log.debug()
// if (!shouldLog(LEVELS["info"])) return;    ← for log.info()
// etc.
```

---

### 2. `src/agent/clineCoreAgentRunner.ts` — 3 changes

**a) Fix silent catch in `buildFileCommentMap`:**
```typescript
// Before:
} catch {}

// After:
} catch (err: any) {
  log.debug("agent:bug-json-missing", { workspacePath, error: err.message, stack: err.stack });
}
```

**b) Add server-side tool event logs (debug level):**
Before the existing `push({ type: "status" })` calls for `tool-started` and `tool-finished` events, add:
```typescript
log.debug("agent:tool-start", { tool: event.toolName, sessionId });
log.debug("agent:tool-done", { tool: event.toolName, sessionId });
```
Debug only — these fire on every tool call. Already visible to engineers via browser SSE; this enables offline log analysis (`make logs | grep tool-start`).

**c) Add stack trace to `agent:run-error`:**
```typescript
// Before:
log.error("agent:run-error", { error: err.message });

// After:
log.error("agent:run-error", { error: err.message, stack: err instanceof Error ? err.stack : undefined });
```

---

### 3. `src/services/attachmentService.ts` — Fix silent catch

In `listZipContents`, the access check silently swallows failures:
```typescript
// Before:
try { await fs.access(resolved); } catch {}

// After:
try { await fs.access(resolved); } catch (err: any) {
  log.debug("zip:entry-not-extracted", { resolved, error: err.message });
}
```
Debug level — an unextracted entry is expected state until the user clicks to extract it.

---

### 4. `src/broadcast.ts` — SSE presence logging

Add `import { log } from "./logger.js"` at the top.

In `addClient()`, after updating the rooms map:
```typescript
log.info("sse:client-added", { sessionId, clientId: client.clientId, userName: client.userName, total: rooms.get(sessionId)!.length });
```

In `removeClient()`, after the rooms mutation:
```typescript
log.info("sse:client-removed", { sessionId, clientId, remaining: (rooms.get(sessionId) ?? []).length });
```

**Do NOT log inside `broadcast()`** — fires on every text delta, too noisy.  
**Do NOT log the 25s heartbeat ping** — write failures here mean the client already disconnected; `removeClient` will have already fired.

---

### 5. `src/app.ts` — 10 changes

**a) Fix 2 silent catches in `GET /session/:id`** (~lines 107–117):
```typescript
// Before:
} catch { /* bug.json missing or unreadable — omit gracefully */ }

// After:
} catch (err: any) {
  log.debug("session:bug-json-missing", { sessionId: req.params.id, error: err.message, stack: err.stack });
}
```
Both catches get this treatment. Debug level — known soft-fail branch.

**b) Add stack to `bug:refresh-error`** (~line 134):
```typescript
log.error("bug:refresh-error", { error: err.message, stack: err instanceof Error ? err.stack : undefined });
```

**c) Add stack to `extract-file:error`** (~line 173):
Same pattern as above.

**d) SSE connect log** in `/session/:id/listen`, after the session/user guard and before `addClient()`:
```typescript
log.info("sse:connect", { sessionId: req.params.id, clientId, userName: user.name });
```

**e) SSE disconnect log** — update the close handler:
```typescript
req.on("close", () => {
  log.info("sse:disconnect", { sessionId: req.params.id, clientId });
  removeClient(req.params.id, clientId);
});
```

**f) Add `log.error` to abort/stop catch blocks** (~lines 249, 263):
Both currently call `res.status(500)` silently. Add before each:
```typescript
log.error("session:abort-error", { sessionId: req.params.id, error: err.message, stack: err instanceof Error ? err.stack : undefined });
```

**g) Add stack to `analyze:exception`** (~line 327):
```typescript
log.error("analyze:exception", { error: err.message, stack: err instanceof Error ? err.stack : undefined });
```

**h) Fix silent catch in wiki bug-comments read** (~line 357):
```typescript
// Before:
} catch { /* bug.json missing or unreadable — continue without comments */ }

// After:
} catch (err: any) {
  log.debug("wiki:bug-comments-missing", { sessionId, error: err.message, stack: err.stack });
}
```

**i) Add stack to wiki error logs** (~lines 381, 411):
```typescript
log.error("wiki:llm-unreachable", { error: err.message, stack: err instanceof Error ? err.stack : undefined });
log.error("wiki:write-error", { error: err.message, stack: err instanceof Error ? err.stack : undefined });
```

**j) Ensure `sessionId` is present in `analyze:start` and `analyze:done`:**
Check both existing log calls include `sessionId` in the data object — add it if missing.

---

### 6. `src/index.ts` — Startup banner

```typescript
// Add import:
import { log } from "./logger.js";

// Before:
app.listen(port, () => console.log(`Lens chatbot listening on port ${port} → ${publicUrl}`));

// After:
app.listen(port, () => log.info("server:listening", { port, publicUrl }));
```

---

### 7. `.env.example` — Document LOG_LEVEL

Add after the existing PORT/host config block:
```
# Log level — controls server verbosity (debug|info|warn|error), default: info
# Use debug to trace SSE lifecycle, agent tool calls, and zip extraction state
LOG_LEVEL=info
```

---

## Log Level Assignment Rules

| Level | When to use |
|-------|-------------|
| `info` | Lifecycle: server start, SSE connect/disconnect, agent start/done, session created, attachment saved |
| `debug` | Per-iteration: tool calls, soft-fail reads, zip access checks |
| `warn` | Recoverable failures: agent session fallback, model fetch errors |
| `error` | All caught exceptions — always include `stack` field |

---

## Verification

| Test | How | Expected |
|------|-----|----------|
| Default level | Start with no `LOG_LEVEL`, make a request | DEBUG lines absent, INFO lines present |
| Debug level | `LOG_LEVEL=debug`, trigger analyze | `agent:tool-start` / `agent:tool-done` appear in server logs |
| Error level | `LOG_LEVEL=error`, normal request | No INFO or DEBUG output |
| SSE lifecycle | Connect then disconnect a listen client | `sse:client-added` then `sse:client-removed` in logs |
| Stack traces | Force bad LLM URL, trigger analyze | `agent:run-error` log line contains a `stack` field |
| TypeScript | `npx tsc --noEmit` | Zero errors |
| E2E tests | `npm run test:e2e` | All tests pass |
