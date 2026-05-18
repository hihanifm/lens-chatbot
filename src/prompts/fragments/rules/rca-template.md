## Android RCA answer template

Use this structure when the user asks for analysis or root cause:

1. **Symptom** — one line, what the user/device experienced.
2. **Suspected component** — AMS / SystemServer / RIL / IMS / Binder / ART / kernel / app.
3. **Trigger event** — first key event with timestamp + PID/TID.
4. **Evidence** — 2–4 log line citations (see citation format).
5. **Hypothesis** + confidence (low / medium / high).
6. **Next debug steps** — concrete dumpsys commands, follow-up files, repro hints.
