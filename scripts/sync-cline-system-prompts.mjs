#!/usr/bin/env node
/**
 * Reads @cline/shared dist/prompt/system.d.ts and syncs or checks
 * docs/reference/cline-shared-system-prompts.md.
 *
 * Usage:
 *   node scripts/sync-cline-system-prompts.mjs           # write if changed
 *   node scripts/sync-cline-system-prompts.mjs --check   # exit 1 if drift
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SYSTEM_DTS = path.join(
  ROOT,
  "node_modules/@cline/shared/dist/prompt/system.d.ts",
);
const OUT = path.join(
  ROOT,
  "docs/reference/cline-shared-system-prompts.md",
);
const PKG_SHARED = path.join(
  ROOT,
  "node_modules/@cline/shared/package.json",
);

const NAMES = [
  "DEFAULT_CLINE_SYSTEM_PROMPT",
  "YOLO_CLINE_SYSTEM_PROMPT",
];

/** Parse a double-quoted TS/JS string literal body (one line in .d.ts). */
function unescapeDtsStringBody(rawFromFirstQuote, constName) {
  let i = 0;
  let out = "";
  while (i < rawFromFirstQuote.length) {
    const c = rawFromFirstQuote[i];
    if (c === '"') {
      break;
    }
    if (c === "\\" && i + 1 < rawFromFirstQuote.length) {
      const n = rawFromFirstQuote[i + 1];
      if (n === "n") {
        out += "\n";
        i += 2;
        continue;
      }
      if (n === "r") {
        out += "\r";
        i += 2;
        continue;
      }
      if (n === "t") {
        out += "\t";
        i += 2;
        continue;
      }
      if (n === "\\") {
        out += "\\";
        i += 2;
        continue;
      }
      if (n === '"') {
        out += '"';
        i += 2;
        continue;
      }
      if (
        n === "u" &&
        i + 5 < rawFromFirstQuote.length &&
        /^[0-9a-fA-F]{4}$/.test(rawFromFirstQuote.slice(i + 2, i + 6))
      ) {
        out += String.fromCodePoint(
          parseInt(rawFromFirstQuote.slice(i + 2, i + 6), 16),
        );
        i += 6;
        continue;
      }
      out += n;
      i += 2;
      continue;
    }
    out += c;
    i++;
  }
  if (rawFromFirstQuote[i] !== '"') {
    throw new Error(`Unterminated string literal for ${constName}`);
  }
  return out;
}

function extractConst(source, constName) {
  const prefix = `export declare const ${constName} = "`;
  const start = source.indexOf(prefix);
  if (start === -1) {
    throw new Error(`Missing ${prefix.slice(0, -1)}..." in ${SYSTEM_DTS}`);
  }
  const bodyStart = start + prefix.length;
  return unescapeDtsStringBody(source.slice(bodyStart), constName);
}

function readSharedVersion() {
  const j = JSON.parse(fs.readFileSync(PKG_SHARED, "utf8"));
  return j.version;
}

function extractFence(md, exportName) {
  const esc = exportName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `## \\\`${esc}\\\`\\s*\\n+\`\`\`\\n([\\s\\S]*?)\\n\`\`\``,
    "m",
  );
  const m = md.match(re);
  return m ? m[1] : null;
}

function extractCapturedDate(md) {
  const m = md.match(/\|\s*Captured\s*\|\s*([^|]+)\|/);
  return m ? m[1].trim() : null;
}

function buildDoc({ version, captured, defaultPrompt, yoloPrompt }) {
  return `# \`@cline/shared\` system prompts (reference snapshot)

## Provenance

| Field | Value |
|-------|-------|
| Package | \`@cline/shared@${version}\` |
| Source file in package | \`dist/prompt/system.d.ts\` |
| Captured | ${captured} |

These strings are exported as \`const\` literals from the published typings. Regenerate this file with \`npm run prompts:sync-cline-system\` after upgrading \`@cline/shared\`, or run \`npm run prompts:check-cline-system\` in CI to detect drift.

## Placeholders

The prompts contain the following substitution tokens (rendered at runtime by Cline):

- \`{{PLATFORM_NAME}}\`
- \`{{CURRENT_DATE}}\`
- \`{{IDE_NAME}}\`
- \`{{CWD}}\`
- \`{{CLINE_RULES}}\`
- \`{{CLINE_METADATA}}\`

---

## \`DEFAULT_CLINE_SYSTEM_PROMPT\`

\`\`\`
${defaultPrompt}
\`\`\`

---

## \`YOLO_CLINE_SYSTEM_PROMPT\`

\`\`\`
${yoloPrompt}
\`\`\`
`;
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

const CHECK = process.argv.includes("--check");

if (!fs.existsSync(SYSTEM_DTS)) {
  console.error(`Missing ${path.relative(ROOT, SYSTEM_DTS)} — run npm install.`);
  process.exit(1);
}
if (!fs.existsSync(PKG_SHARED)) {
  console.error(`Missing ${path.relative(ROOT, PKG_SHARED)} — run npm install.`);
  process.exit(1);
}

const dts = fs.readFileSync(SYSTEM_DTS, "utf8");
const defaultPrompt = extractConst(dts, NAMES[0]);
const yoloPrompt = extractConst(dts, NAMES[1]);
const version = readSharedVersion();

let captured = todayIsoDate();
if (fs.existsSync(OUT)) {
  const prev = fs.readFileSync(OUT, "utf8");
  const oldDefault = extractFence(prev, "DEFAULT_CLINE_SYSTEM_PROMPT");
  const oldYolo = extractFence(prev, "YOLO_CLINE_SYSTEM_PROMPT");
  const oldCap = extractCapturedDate(prev);
  const versionOk = prev.includes(`@cline/shared@${version}`);
  if (
    oldDefault !== null &&
    oldYolo !== null &&
    oldDefault === defaultPrompt &&
    oldYolo === yoloPrompt &&
    versionOk &&
    oldCap
  ) {
    captured = oldCap;
  }
}

const doc = buildDoc({
  version,
  captured,
  defaultPrompt,
  yoloPrompt,
});

if (CHECK) {
  if (!fs.existsSync(OUT)) {
    console.error(`Missing ${path.relative(ROOT, OUT)} — run npm run prompts:sync-cline-system`);
    process.exit(1);
  }
  const onDisk = fs.readFileSync(OUT, "utf8");
  if (onDisk !== doc) {
    console.error(
      `Drift: ${path.relative(ROOT, OUT)} does not match ${path.relative(ROOT, SYSTEM_DTS)}.`,
    );
    console.error("Run: npm run prompts:sync-cline-system");
    process.exit(1);
  }
  console.log("@cline/shared system prompt snapshot matches installed package.");
  process.exit(0);
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
const prev = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8") : "";
if (prev === doc) {
  console.log(`Up to date: ${path.relative(ROOT, OUT)}`);
  process.exit(0);
}
fs.writeFileSync(OUT, doc, "utf8");
console.log(`Wrote ${path.relative(ROOT, OUT)} (from @cline/shared@${version})`);
