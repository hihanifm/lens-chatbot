# Agent Environment

## Available tools

- **bash / sh** — shell execution
- **python3** — available at `python3`
- **rg** (ripgrep) — fast file content search, prefer over grep
- **jq** — JSON processing
- **grep, awk, sed, find, cut, sort, unzip** — standard Unix tools

## Workspace layout

```
<workspacePath>/
  bug.json          ← raw bug tracker data
  bug_summary.md    ← formatted bug summary (read first for context)
  attachments/      ← downloaded log and attachment files
  agent_notes/      ← persist your findings here across turns
```

## Android file → topic reference

Map the user's question topic to the file(s) most likely to contain the answer.
Most named files live **inside** `bugreport-*.zip` after extraction.

| Topic | Where to look | Pattern hints (rg) |
|---|---|---|
| IMS / VoLTE / VoWiFi / SIP | `radio_log`, `bugreport*/FS/data/misc/radio/`, radio section of `bugreport*.txt` | `INVITE\|REGISTER\|SUBSCRIBE\|IMS_\|>>>>> IMS\|SipService` |
| Telephony / RIL / modem | `radio_log`, `bugreport*/FS/data/misc/radio/`, modem dumps | `RIL\[\|RILJ\|onRequest\|UNSOL_` |
| App crash (Java) | `main_log`, `logcat`, system log section of `bugreport*.txt` | `FATAL EXCEPTION\|AndroidRuntime\|am_crash` |
| ANR (App Not Responding) | `bugreport*/FS/data/anr/traces.txt`, ANR section of `bugreport*.txt` | `ANR in \|am_anr\|Subject:` |
| Native crash / tombstone | `bugreport*/FS/data/tombstones/`, tombstone section of `bugreport*.txt` | `signal \|>>> .* <<<\|fault addr` |
| Kernel panic / OOM | `dmesg`, `kernel_log`, kernel section of `bugreport*.txt` | `lowmemorykiller\|Out of memory\|Kernel panic\|Unable to handle kernel` |
| Watchdog / SystemServer hang | `bugreport*.txt`, `main_log` | `Watchdog\|WATCHDOG\|system_server\|HANG ` |
| Battery / power / wakelocks | `bugreport*.txt` | `dumpsys batterystats\|HISTORY\|wakelock` |
| Connectivity / Wi-Fi / BT | `main_log`, `bugreport*.txt` | `ConnectivityService\|NetworkAgent\|wlan\|wpa_supplicant\|BluetoothAdapterService` |
| Build / device info | first ~200 lines of `bugreport*.txt`, `bug.json` | `Build fingerprint\|ro.build\|ro.product` |

## bugreport-*.zip layout

```
bugreport-*.zip
├── bugreport-*.txt           ← full system dump; locate sections first
├── dumpstate_board.txt       ← board-specific dumps
└── FS/
    └── data/
        ├── anr/traces.txt    ← ANR traces
        ├── tombstones/       ← native crash dumps
        └── misc/radio/       ← radio / IMS logs
```

Extract zips once before searching:

```bash
for z in "$WORKSPACE"/attachments/*.zip; do
  unzip -n -q "$z" -d "$WORKSPACE/attachments/$(basename "$z" .zip)"
done
```

Major sections inside `bugreport-*.txt` are marked with lines like
`------ SYSTEM LOG (logcat) ------`, `------ DUMPSYS ------`,
`------ ANR (/data/anr/traces.txt) ------`. Locate the right section first
(`rg '^------' bugreport-*.txt`) before scanning the full file.

## Citation format

Cite evidence as: `<file>:<line> — MM-DD HH:MM:SS.mmm PID TID L TAG: message`.
Always include the timestamp and PID/TID when present — they anchor the event in
time and process. For multi-line stack traces, cite the FATAL line plus the first
2–3 stack frames.

## Notes

- Do not modify files outside the workspace.
- Prefer `rg` over `grep` for searching large log files — significantly faster.
- Write findings to `agent_notes/` so they persist across conversation turns.
- When skills are listed in the task prompt, read the relevant ones before starting.

## Troubleshooting Wiki

A growing knowledge base of synthesized insights from resolved bug investigations:
  - `WIKI_DIR/index.md`              ← module directory
  - `WIKI_DIR/<module>/index.md`     ← bug catalog per module
  - `WIKI_DIR/<module>/YYYYMMDD-BUGID-slug.md` ← full entry

IMPORTANT: If the task prompt provides a wiki index path, you MUST read it before
doing anything else. Confirmed root causes from past bugs shortcut investigation —
do not re-derive what is already documented. Navigate: root index → module index →
entry file(s).
