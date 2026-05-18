import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeForLlm, isLlmSanitizeEnabled } from "./llmSanitize.js";

test("isLlmSanitizeEnabled is true when unset", () => {
  delete process.env.LLM_SANITIZE;
  assert.equal(isLlmSanitizeEnabled(), true);
});

test("sanitizeForLlm is no-op when LLM_SANITIZE explicitly off", () => {
  process.env.LLM_SANITIZE = "0";
  const input =
    "IMEI=123456789012345 user@example.com +1555123456789 tel:+81-3-1234-5678";
  const { text, replacementCount } = sanitizeForLlm(input);
  assert.equal(replacementCount, 0);
  assert.equal(text, input);
  delete process.env.LLM_SANITIZE;
});

test("redacts email, E.164, tel URI, MAC when enabled", () => {
  delete process.env.LLM_SANITIZE;
  delete process.env.LLM_SANITIZE_STRICT;
  delete process.env.LLM_SANITIZE_JWT;
  const { text, replacementCount } = sanitizeForLlm(
    "mailto dev@company.test WiFi AA:BB:cc:dd:ee:ff call +442079460958 then tel:+1-650-253-0000",
  );
  assert.ok(replacementCount >= 4);
  assert.match(text, /\[REDACTED_EMAIL\]/);
  assert.match(text, /\[REDACTED_MAC\]/);
  assert.ok(!text.includes("company.test"));
  assert.ok(!text.includes("AA:BB"));
});

test("synthetic Android / RIL-style lines", () => {
  delete process.env.LLM_SANITIZE;
  delete process.env.LLM_SANITIZE_STRICT;
  delete process.env.LLM_SANITIZE_JWT;
  const line =
    "RIL: IMSI=310260123456789 iccid=89012601234567890123 imei=354543210987654 android_id=af024670bcd1ef22 " +
    "advertisingId=8f1e2f3c-4b5a-6978-90ab-cdef12345678 " +
    "phoneNumber=4085551212";
  const { text, replacementCount } = sanitizeForLlm(line);
  assert.ok(replacementCount >= 6);
  assert.ok(!text.includes("310260123456789"));
  assert.ok(!text.includes("89012601234567890123"));
  assert.ok(!text.includes("354543210987654"));
  assert.ok(!text.includes("af024670bcd1ef22"));
  assert.ok(!text.includes("8f1e2f3c-4b5a-6978-90ab-cdef12345678"));
  assert.ok(!text.includes("4085551212"));
});

test("ICCID grouped and 89-prefix strip", () => {
  delete process.env.LLM_SANITIZE;
  delete process.env.LLM_SANITIZE_STRICT;
  delete process.env.LLM_SANITIZE_JWT;
  const { text } = sanitizeForLlm("SIM shows 8901-2345-6789-0123-45 on label");
  assert.ok(text.includes("[REDACTED_ICCID]"));
});

test("bare 15-digit redacted by default", () => {
  delete process.env.LLM_SANITIZE;
  delete process.env.LLM_SANITIZE_STRICT;
  delete process.env.LLM_SANITIZE_JWT;
  const { text, replacementCount } = sanitizeForLlm("payload 001010123456789 trail");
  assert.ok(replacementCount >= 1);
  assert.ok(text.includes("[REDACTED_TELECOM_NUMERIC]"));
});

test("bare 15-digit preserved when LLM_SANITIZE_STRICT off", () => {
  delete process.env.LLM_SANITIZE;
  delete process.env.LLM_SANITIZE_JWT;
  process.env.LLM_SANITIZE_STRICT = "0";
  const { text } = sanitizeForLlm("payload 001010123456789 trail");
  assert.ok(text.includes("001010123456789"));
  delete process.env.LLM_SANITIZE_STRICT;
});

test("JWT redacted by default", () => {
  delete process.env.LLM_SANITIZE;
  delete process.env.LLM_SANITIZE_STRICT;
  delete process.env.LLM_SANITIZE_JWT;
  const token =
    "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.dGVzdC1zaWduYXR1cmU";
  const { text } = sanitizeForLlm(`Bearer ${token}`);
  assert.ok(text.includes("[REDACTED_JWT]"));
  assert.ok(!text.includes("eyJhbGciOiJIUzI1NiJ9"));
});

test("JWT preserved when LLM_SANITIZE_JWT off", () => {
  delete process.env.LLM_SANITIZE;
  delete process.env.LLM_SANITIZE_STRICT;
  process.env.LLM_SANITIZE_JWT = "0";
  const token =
    "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.dGVzdC1zaWduYXR1cmU";
  const { text } = sanitizeForLlm(`Bearer ${token}`);
  assert.ok(text.includes(token));
  delete process.env.LLM_SANITIZE_JWT;
});
