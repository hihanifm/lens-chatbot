---
name: ANR Triage
description: Investigate Application Not Responding (ANR) events on Android — identify the blocked thread, the lock holder, and the root cause
triggers: [anr, not responding, application not responding, hang, frozen, stuck, ui thread blocked, main thread blocked, am_anr]
---

# ANR Triage

Use when user reports: "app hung", "ANR dialog", "UI frozen", "not
responding", or asks why an ANR fired.

## Files to open (in order)

1. `bugreport*/FS/data/anr/traces.txt` — primary. Full thread dump captured
   at the moment the ANR fired. If multiple ANRs, file may contain multiple
   `----- pid <PID> at <timestamp> -----` blocks.
2. ANR section of `bugreport-*.txt`
   (`rg '^------ ANR' bugreport-*.txt`).
3. `main_log` / system log — for the `ANR in <pkg>: <reason>` line and
   surrounding context (broadcast / service / input timeout).

## Key ripgrep patterns

```bash
# Find every ANR event and its reason
rg -n 'ANR in |am_anr|Subject:|Reason:' "$WORKSPACE"/attachments/

# Locate the right trace block in traces.txt
rg -n '^----- pid' "$WORKSPACE"/attachments/**/anr/traces.txt

# Find main thread within a process dump
rg -n -A 50 '"main"' "$WORKSPACE"/attachments/**/anr/traces.txt

# Look for held/waiting locks
rg -n 'held by thread|waiting on|waiting to lock|- locked' "$WORKSPACE"/attachments/**/anr/traces.txt
```

## ANR reason → meaning

| Reason text | Trigger |
|---|---|
| `Input dispatching timed out` | Touch/key event not consumed in 5 s |
| `Broadcast of Intent ...` | Foreground broadcast not finished in 10 s (background: 60 s) |
| `executing service ...` | Service `onCreate` / `onStartCommand` > 20 s |
| `ContentProvider not responding` | Provider call hung |
| `Job execution timed out` | JobScheduler job ran past deadline |

## Investigation flow

1. Read the `ANR in <pkg>: <reason>` line — note PID, package, reason.
2. Jump to that PID's block in `traces.txt`.
3. Find the `"main"` thread. Look at the top 5–10 frames of its stack.
4. If main is in `Object.wait` / `park` / `nativePollOnce` waiting on a
   lock → search for `held by thread <N>` and inspect that thread's stack.
5. If main is in I/O (`FileInputStream.read`, `SQLiteConnection.nativeExecute`,
   `Binder.transactNative`) → check binder transactions and disk
   pressure.
6. If main looks idle (`nativePollOnce`) → the work probably never reached
   the main thread; check the `Looper` / message queue for backlog or look
   for other threads (e.g. background thread) holding a lock the main
   thread tried to grab right after.

## Common root-cause patterns

- **Binder deadlock**: main waiting on `Binder.transactNative` → system_server
  thread waiting back on app. Look for cycle.
- **SQLite contention**: main thread blocked on
  `SQLiteConnection.nativeExecute` while a background thread holds the
  write lock.
- **Locked monitor**: main thread `waiting to lock <0x...>` held by a
  background thread doing slow work (network on UI? IO?).
- **Slow broadcast receiver**: receiver doing heavy work in `onReceive`
  synchronously.

## Output

Use the `android-rca-report` template. Cite:
- The `ANR in ...` line.
- The top 3 frames of the blocked main thread.
- The lock holder's top 3 frames (if applicable).
- The "Next debug steps" should name concrete `dumpsys` / `systrace` calls
  to confirm the hypothesis.
