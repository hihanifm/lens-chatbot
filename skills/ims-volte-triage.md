---
name: IMS / VoLTE / VoWiFi Triage
description: Investigate IMS registration failures, VoLTE/VoWiFi call drops, SIP errors, and IMS PDN issues on Android
triggers: [ims, volte, vowifi, sip, call drop, call failure, registration failed, ims pdn, sip 4xx, sip 5xx, sip 6xx, ims_, ims service, imsservice, mmtel, rcs]
---

# IMS / VoLTE / VoWiFi Triage

Use when user reports: IMS registration failure, dropped VoLTE/VoWiFi call,
"can't make calls on Wi-Fi", SIP error codes, IMS PDN issues, RCS messaging
failures.

## Files to open (in order)

1. `radio_log` (standalone) — primary source. Smaller and richer than the
   radio section of the bugreport txt.
2. `bugreport*/FS/data/misc/radio/` — radio FS dumps (modem stats, IMS state).
3. Radio section of `bugreport-*.txt` — fallback if standalone missing
   (`rg '^------ RADIO LOG' bugreport-*.txt`).
4. `main_log` — for the framework side (ImsService, MmTelFeature, Telecom).

## Key ripgrep patterns

```bash
# SIP signalling — registration, calls, messaging
rg -n 'INVITE\b|REGISTER\b|SUBSCRIBE\b|NOTIFY\b|BYE\b|CANCEL\b|MESSAGE\b' "$WORKSPACE"/attachments/

# SIP response codes — group failures
rg -n 'SIP/2\.0 [4-6][0-9]{2}' "$WORKSPACE"/attachments/ | sort | uniq -c | sort -rn

# IMS service state transitions
rg -n 'ImsService|MmTelFeature|ImsManager|>>>>> IMS' "$WORKSPACE"/attachments/

# IMS registration result
rg -n 'onRegistered|onUnregistered|onRegistering|onSubscriberAssociated' "$WORKSPACE"/attachments/

# IMS PDN / APN
rg -n 'IMS PDN|ims apn|EmergencyService|EPDG|ePDG' "$WORKSPACE"/attachments/
```

## SIP response code cheatsheet

| Code | Meaning | Likely cause |
|---|---|---|
| 401 / 407 | Auth challenge (normal first leg) | Expected — second REGISTER should succeed. If looping, ISIM/AKA failure |
| 403 Forbidden | Operator rejected | Subscription/entitlement, wrong APN, roaming policy |
| 408 Timeout | No response from P-CSCF | Transport issue (EPDG tunnel down, modem stuck, IPsec failure) |
| 480 / 486 / 487 | Call leg specific | Callee unavailable / busy / cancelled — usually not a bug |
| 500 / 503 | Server side | Network-side issue; correlate with neighbor reports |
| 603 Decline | Callee rejected | Not a bug; user action |

## Common root-cause patterns

- **Registration loop**: 401 → REGISTER → 401 → … → 403/timeout. Look for
  AKA / ISIM auth response logging in modem; SIM swap / wrong IMSI on
  multi-SIM common cause.
- **VoWiFi handover failure**: ePDG tunnel established but registration
  fails. Check `EPDG`, `IPsec SA`, `IKE` logs.
- **Mid-call drop**: BYE from network side immediately after media setup —
  usually QoS / bearer issue. Correlate with RIL `UNSOL_DATA_CALL_LIST`
  changes.
- **No VoLTE indicator**: `MmTelFeature` never reaches `STATE_READY`. Check
  carrier config (`CarrierConfigManager`) and IMS feature tags.

## Output

Use the `android-rca-report` template. Cite SIP signalling lines verbatim
(method, response code, Call-ID if visible) — they anchor the root cause.
