---
name: Android Log File Map
description: Map a bug topic (IMS, ANR, tombstone, kernel, watchdog, wakelock, connectivity, etc.) to the Android log files and ripgrep patterns most likely to contain the answer
triggers: [ims, volte, vowifi, sip, anr, not responding, tombstone, native crash, sigsegv, crash, fatal, kernel, oom, lowmemorykiller, watchdog, hang, wakelock, battery, ril, modem, telephony, connectivity, wifi, bluetooth, build, fingerprint, device info]
---

# Android Log File Map

Use this skill when the user's question is about a specific Android subsystem
and you need to decide which file(s) to open first. Most named files live
**inside** `bugreport-*.zip` — extract zips first (see the
`explore-workspace` skill).

## Topic → file → grep pattern

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

## How to use it

1. Pick the row that matches the user's topic.
2. Confirm the file exists in the workspace (`ls "$WORKSPACE"/attachments/...`).
   If it's inside a `bugreport-*.zip` and you haven't extracted yet, do that
   first.
3. Run the suggested `rg` pattern against that file, with `-C 5` for context.
4. If nothing matches, broaden: try a sibling file in the same row, or
   `bugreport-*.txt` as the fallback.

## Tips

- Inside `bugreport-*.txt`, large dumps are split by `------ SECTION ------`
  markers. Run `rg '^------' bugreport-*.txt` first to jump to the right
  section instead of scanning the whole file.
- Radio/IMS logs are often in their own file (`radio_log`) **and** repeated
  inside the bugreport txt — prefer the standalone file when available; it's
  smaller.
- Tombstones are individual files; list them (`ls bugreport*/FS/data/tombstones/`)
  before grepping.
