#!/usr/bin/env node
// Fails if prompt-like multi-line template literals exist outside src/prompts/.
// Catches drift before it ships.
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SRC = path.join(ROOT, "src");
const ALLOWED = path.join(SRC, "prompts");
const MARKERS = [
  "IMPORTANT:",
  "MUST read",
  "Before answering",
  "WORKSPACE=",
  "Selected files",
  "If the user says",
  "Available skills",
  "troubleshooting wiki",
  "Prior analysis reports",
];

async function walk(dir, out = []) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || full.startsWith(ALLOWED)) continue;
      await walk(full, out);
    } else if (entry.name.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

const files = await walk(SRC);
let bad = [];
for (const f of files) {
  const content = await fs.readFile(f, "utf8");
  const lines = content.split("\n");
  let inTpl = false;
  let tplStart = 0;
  let tpl = "";
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!inTpl) {
      const start = line.indexOf("`");
      if (start === -1) continue;
      const rest = line.slice(start + 1);
      const end = rest.indexOf("`");
      if (end !== -1) continue; // single-line literal — ignore
      inTpl = true;
      tplStart = i + 1;
      tpl = rest + "\n";
    } else {
      const end = line.indexOf("`");
      if (end === -1) {
        tpl += line + "\n";
        continue;
      }
      tpl += line.slice(0, end);
      const hit = MARKERS.find((m) => tpl.includes(m));
      if (hit) {
        bad.push(`${path.relative(ROOT, f)}:${tplStart} contains "${hit}"`);
      }
      inTpl = false;
      tpl = "";
    }
  }
}

if (bad.length) {
  console.error("Prompt-drift check failed — prompt content found outside src/prompts/:");
  for (const b of bad) console.error("  " + b);
  console.error("\nMove the offending text into src/prompts/fragments/ and load via composePrompt.");
  process.exit(1);
}
console.log("Prompt-drift check passed (no prompt literals outside src/prompts/).");

// ---------------------------------------------------------------------------
// Skill data validation: skills/attachment-filter.md JSON block must parse and
// have the expected shape. Backend tolerates missing/malformed (falls back to
// DEFAULT), but CI should fail loudly so bad edits don't ship silently.
// ---------------------------------------------------------------------------

const FILTER_SKILL = path.join(ROOT, "skills", "attachment-filter.md");
const filterErrors = [];

try {
  const md = await fs.readFile(FILTER_SKILL, "utf8");
  const m = md.match(/```json\s*\n([\s\S]*?)\n```/);
  if (!m) {
    filterErrors.push("no ```json``` fenced block found");
  } else {
    let parsed;
    try {
      parsed = JSON.parse(m[1]);
    } catch (err) {
      filterErrors.push(`JSON.parse failed: ${err.message}`);
    }
    if (parsed) {
      const isStringArray = (v) => Array.isArray(v) && v.every((x) => typeof x === "string");
      for (const field of ["critical", "priority", "useful", "skip"]) {
        if (!isStringArray(parsed[field])) {
          filterErrors.push(`field "${field}" must be an array of strings`);
        }
      }
      if (typeof parsed.size_cap_mb !== "number" || parsed.size_cap_mb <= 0) {
        filterErrors.push(`field "size_cap_mb" must be a positive number`);
      }
    }
  }
} catch (err) {
  if (err.code !== "ENOENT") {
    filterErrors.push(`read failed: ${err.message}`);
  }
  // ENOENT is fine — backend falls back to DEFAULT_RULES; nothing to validate.
}

if (filterErrors.length) {
  console.error("\nAttachment-filter skill validation failed (skills/attachment-filter.md):");
  for (const e of filterErrors) console.error("  " + e);
  console.error('\nRequired schema: { critical: string[], priority: string[], useful: string[], skip: string[], size_cap_mb: number }');
  process.exit(1);
}
console.log("Attachment-filter skill validation passed.");
