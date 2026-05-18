/**
 * Best-effort PII / telecom identifier redaction for text sent to upstream LLMs.
 * Regex-only; does not understand free-form names/addresses.
 * LLM_SANITIZE, LLM_SANITIZE_STRICT, and LLM_SANITIZE_JWT default on; set any to 0 (or false/no/off) to disable that piece. LLM_SANITIZE=0 disables all rules.
 */

const EMAIL = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const E164 = /\+[1-9]\d{7,14}(?!\d)/g;
const TEL_URI = /tel:[^\s\])'"]+/gi;
const SIP_URI = /sip:[^\s\])'"]+/gi;
const MAC = /\b(?:[0-9A-Fa-f]{2}[:-]){5}(?:[0-9A-Fa-f]{2})\b/g;
/** Common ICCID issuer prefix; 18–20 decimal digits total. */
const ICCID_89 = /\b89\d{17,19}\b/g;
/** Four groups of four digits + final group (SIM numbers often printed grouped). */
const ICCID_GROUPED = /\b\d{4}[-\s]\d{4}[-\s]\d{4}[-\s]\d{4}[-\s]\d{2,6}\b/g;
const JWT = /\b[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;

const ICCID_LABELED = /\biccid\s*[=:]\s*([\d\s-]{18,40}\d)/gi;
const IMEI_LABELED = /\b(?:imei|imeisv)\s*[=:]\s*([\d\s.\-]{14,40}\d)/gi;
const IMSI_LABELED =
  /\b(?:imsi|subscriberid|subscriber_id|subscriptionid)\s*[=:]\s*(\d{14,16})\b/gi;
const EID_LABELED = /\beid\s*[=:]\s*([0-9a-f]{32})\b/gi;
const ANDROID_ID_LABELED =
  /\b(?:android[_ ]?id|settings\.secure\.android_id)\s*[=:]\s*([a-f0-9]{16})\b/gi;
const GAID_LABELED =
  /\b(?:advertisingid|advertising_id|gaid|ad_id|advertising\s+id)\s*[=:]\s*([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/gi;
const PHONE_KEYED =
  /\b(?:phonenumber|line1number|msisdn|android\.telephony\.gsm\.msisdn)\s*[=:]\s*([\d+.\-\s()]{9,24}\d)/gi;
const SERIAL_LABELED =
  /\b(?:ro\.serialno|build\.serial|serialno)\s*[=:]\s*([A-Za-z0-9._+/\-:,]{4,48})/gi;

/** Bare 15-digit IMSI/IMEI-shaped numbers — off when LLM_SANITIZE_STRICT=0 (default is on). */
const DIGITS_15 = /\b\d{15}\b/g;

function envExplicitlyDisabled(name: string): boolean {
  const v = (process.env[name] ?? "").toLowerCase().trim();
  return v === "0" || v === "false" || v === "no" || v === "off";
}

/** Master switch: off only when LLM_SANITIZE is 0/false/no/off. */
export function isLlmSanitizeEnabled(): boolean {
  return !envExplicitlyDisabled("LLM_SANITIZE");
}

/** Bare 15-digit telecom-shaped runs: on by default; off when LLM_SANITIZE_STRICT is disabled. Ignored if LLM_SANITIZE is off. */
function isStrict(): boolean {
  return !envExplicitlyDisabled("LLM_SANITIZE_STRICT");
}

/** JWT-shaped tokens: on by default; off when LLM_SANITIZE_JWT is disabled. Ignored if LLM_SANITIZE is off. */
function isJwtRedactEnabled(): boolean {
  return !envExplicitlyDisabled("LLM_SANITIZE_JWT");
}

function applyRule(text: string, pattern: RegExp, placeholder: string): { text: string; n: number } {
  pattern.lastIndex = 0;
  let n = 0;
  const out = text.replace(pattern, () => {
    n++;
    return placeholder;
  });
  return { text: out, n };
}

function buildRuleList(): Array<{ pattern: RegExp; placeholder: string }> {
  const rules: Array<{ pattern: RegExp; placeholder: string }> = [
    // URIs first so inner +/digits are fully removed.
    { pattern: TEL_URI, placeholder: "[REDACTED_URI]" },
    { pattern: SIP_URI, placeholder: "[REDACTED_URI]" },
  ];
  if (isJwtRedactEnabled()) {
    rules.push({ pattern: JWT, placeholder: "[REDACTED_JWT]" });
  }
  rules.push(
    { pattern: EMAIL, placeholder: "[REDACTED_EMAIL]" },
    { pattern: GAID_LABELED, placeholder: "[REDACTED_GAID]" },
    { pattern: EID_LABELED, placeholder: "[REDACTED_EID]" },
    { pattern: ICCID_LABELED, placeholder: "[REDACTED_ICCID]" },
    { pattern: IMEI_LABELED, placeholder: "[REDACTED_IMEI]" },
    { pattern: IMSI_LABELED, placeholder: "[REDACTED_IMSI]" },
    { pattern: ICCID_89, placeholder: "[REDACTED_ICCID]" },
    { pattern: ICCID_GROUPED, placeholder: "[REDACTED_ICCID]" },
    { pattern: ANDROID_ID_LABELED, placeholder: "[REDACTED_ANDROID_ID]" },
    { pattern: SERIAL_LABELED, placeholder: "[REDACTED_DEVICE_SERIAL]" },
    { pattern: PHONE_KEYED, placeholder: "[REDACTED_PHONE]" },
    { pattern: E164, placeholder: "[REDACTED_PHONE]" },
    { pattern: MAC, placeholder: "[REDACTED_MAC]" },
  );
  if (isStrict()) {
    rules.push({ pattern: DIGITS_15, placeholder: "[REDACTED_TELECOM_NUMERIC]" });
  }
  return rules;
}

/**
 * When sanitization is disabled (LLM_SANITIZE=0), returns the input unchanged and replacementCount 0.
 */
export function sanitizeForLlm(text: string): { text: string; replacementCount: number } {
  if (!isLlmSanitizeEnabled() || !text) {
    return { text, replacementCount: 0 };
  }
  let replacementCount = 0;
  let out = text;
  for (const { pattern, placeholder } of buildRuleList()) {
    const { text: next, n } = applyRule(out, pattern, placeholder);
    out = next;
    replacementCount += n;
  }
  return { text: out, replacementCount };
}
