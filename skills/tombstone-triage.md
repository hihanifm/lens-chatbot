---
name: Tombstone Triage
description: Investigate native crashes on Android — parse tombstones, identify the faulting signal, decode the stack, and locate the offending library
triggers: [tombstone, native crash, sigsegv, sigabrt, sigbus, sigill, signal 11, signal 6, fault addr, abort, segfault, jni crash, ndk crash]
---

# Tombstone Triage

Use when user reports: native crash, "app crashed with no Java stack",
SIGSEGV / SIGABRT, JNI crash, NDK library issue, "fault addr 0x...".

## Files to open (in order)

1. `bugreport*/FS/data/tombstones/` — one file per crash, named
   `tombstone_00`, `tombstone_01`, … Newest = highest number (rotated).
   Read the **most recent** unless user asks for a specific PID.
2. Tombstone section of `bugreport-*.txt`
   (`rg '^------ TOMBSTONE' bugreport-*.txt`) — fallback if dir absent.
3. `main_log` — for the `tombstone_dumped` event and any pre-crash
   warnings from the process.

## Key ripgrep patterns

```bash
# List all tombstones with timestamps
ls -lt "$WORKSPACE"/attachments/**/tombstones/ 2>/dev/null

# Find the crash signal + faulting address in one file
rg -n 'signal |fault addr|Abort message|>>> .* <<<' "$WORKSPACE"/attachments/**/tombstones/tombstone_*

# Locate the offending library across all tombstones
rg -n '#00 pc' "$WORKSPACE"/attachments/**/tombstones/

# Find pre-crash log events (libc fortify, JNI errors, etc.)
rg -n 'FORTIFY|JNI ERROR|art    .*JNI|libc    .*' "$WORKSPACE"/attachments/main_log
```

## Tombstone anatomy

A tombstone starts with the header:

```
*** *** *** *** *** *** *** *** *** *** *** *** *** *** *** ***
Build fingerprint: '...'
ABI: 'arm64'
Timestamp: 2025-...
pid: <PID>, tid: <TID>, name: <thread>  >>> <package> <<<
uid: <UID>
signal 11 (SIGSEGV), code 1 (SEGV_MAPERR), fault addr 0x0
Abort message: '...'           ← present only for SIGABRT
```

Followed by registers, then the backtrace (`#00 pc … library.so`),
then memory near registers, then memory map, then open files.

## Signal cheatsheet

| Signal | Code | Meaning | Typical cause |
|---|---|---|---|
| SIGSEGV (11) | SEGV_MAPERR | Address not mapped | Null deref, use-after-free, bad pointer arithmetic |
| SIGSEGV (11) | SEGV_ACCERR | Access not permitted | Wrong permission (write to read-only page), executable stack |
| SIGABRT (6) | — | `abort()` called | FORTIFY, JNI check, C++ exception, assertion, `__android_log_assert` |
| SIGBUS (7) | BUS_ADRALN | Unaligned access | ARM atomic on unaligned addr; mmap past EOF |
| SIGILL (4) | ILL_ILLOPC | Illegal instruction | Code corruption, wrong CPU feature, JIT bug |

## Investigation flow

1. Read the header. Note: signal, fault addr, package, thread name,
   `Abort message` if any.
2. Read the backtrace from `#00` upward. The crashing function is
   `#00`; the call chain rises through `#01`, `#02`, …
3. Identify the **first non-system frame**. Frames in `libc.so`,
   `libart.so`, `libbase.so`, `linker64` are usually the messenger, not
   the cause. The first frame in app/vendor code (`libfoo.so` you
   recognize) is usually where to look.
4. Fault addr clues:
   - `0x0` or low (< 0x1000) → null pointer deref.
   - High canonical (e.g. `0xdeadbaad`) → libc abort marker.
   - Looks like a freed pointer pattern → use-after-free; check with
     malloc debug / hwasan if available.
5. `Abort message` is gold for SIGABRT — it usually names the exact
   check that failed (FORTIFY buffer overrun, JNI bad ref, etc.).

## Common root-cause patterns

- **Null deref in JNI bridge**: `#00` in a `Java_…` function, fault addr
  `0x0`. Java side passed null where C++ assumed non-null.
- **Use-after-free**: `#00` in destructor or vtable call, fault addr
  looks like garbage; preceding events show the object freed earlier.
- **FORTIFY abort**: SIGABRT + abort message starting with `FORTIFY:` —
  buffer overrun caught at runtime; the message names the function
  (`memcpy`, `strcpy`, …).
- **JNI check failure**: SIGABRT + `JNI DETECTED ERROR IN APPLICATION` in
  `main_log` just before — usually a local ref used after frame pop or a
  wrong-type arg.

## Output

Use the `android-rca-report` template. Cite:
- The signal line and fault addr.
- `Abort message` if present.
- The first 3 backtrace frames (`#00`–`#02`) including library and pc.
- Suspected component should name the library (`libfoo.so`) when known.
- "Next debug steps" should mention `ndk-stack` / `addr2line` against the
  matching unstripped library, or `llvm-symbolizer` for clang builds.
