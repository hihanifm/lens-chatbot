#!/usr/bin/env node
// Lint + breaking-change guard for docs/openapi.yaml.
//
// - Structural checks: valid YAML, required top-level keys, every $ref resolves.
// - Breaking-change diff vs docs/openapi.previous.yaml: removed paths,
//   removed/renamed required properties, dropped operationIds. Fails unless
//   the major version was bumped.
//
// Run: npm run openapi:check

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

const repoRoot = path.resolve(fileURLToPath(import.meta.url), "../..");
const CURRENT = path.join(repoRoot, "docs/openapi.yaml");
const PREVIOUS = path.join(repoRoot, "docs/openapi.previous.yaml");

function load(p) {
  if (!fs.existsSync(p)) return null;
  return yaml.load(fs.readFileSync(p, "utf8"));
}

function fail(msg) { console.error(`✗ ${msg}`); process.exitCode = 1; }
function ok(msg)   { console.log(`✓ ${msg}`); }

function parseSemver(v) {
  const m = String(v ?? "").match(/^(\d+)\.(\d+)\.(\d+)/);
  return m ? { major: +m[1], minor: +m[2], patch: +m[3] } : null;
}

function walkRefs(node, visit, where = "$") {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    node.forEach((x, i) => walkRefs(x, visit, `${where}[${i}]`));
    return;
  }
  for (const [k, v] of Object.entries(node)) {
    if (k === "$ref" && typeof v === "string") visit(v, where);
    else walkRefs(v, visit, `${where}.${k}`);
  }
}

function resolveRef(doc, ref) {
  if (!ref.startsWith("#/")) return undefined;
  return ref.slice(2).split("/").reduce((acc, seg) => acc?.[seg], doc);
}

function collectOperations(spec) {
  const out = new Map();
  for (const [p, pathItem] of Object.entries(spec.paths ?? {})) {
    for (const method of ["get", "put", "post", "delete", "patch", "head", "options"]) {
      const op = pathItem?.[method];
      if (op) out.set(`${method.toUpperCase()} ${p}`, op);
    }
  }
  return out;
}

function collectRequired(schema, doc, seen = new Set()) {
  if (!schema || typeof schema !== "object") return new Set();
  if (schema.$ref) {
    if (seen.has(schema.$ref)) return new Set();
    seen.add(schema.$ref);
    return collectRequired(resolveRef(doc, schema.$ref), doc, seen);
  }
  return new Set(schema.required ?? []);
}

const current = load(CURRENT);
if (!current) {
  fail(`missing ${path.relative(repoRoot, CURRENT)}`);
  process.exit(1);
}

// 1. Structural checks
if (!current.openapi?.startsWith("3.")) fail("openapi must start with '3.'");
else ok(`openapi ${current.openapi}`);
if (!current.info?.version) fail("info.version missing");
else ok(`info.version ${current.info.version}`);
if (!current.paths || !Object.keys(current.paths).length) fail("paths block is empty");
else ok(`${Object.keys(current.paths).length} paths`);

// 2. $ref resolution
let refCount = 0, badRefs = 0;
walkRefs(current, (ref, where) => {
  refCount++;
  if (!resolveRef(current, ref)) {
    badRefs++;
    fail(`unresolved $ref ${ref} at ${where}`);
  }
});
if (!badRefs) ok(`${refCount} $refs resolve`);

// 3. Breaking-change diff
const previous = load(PREVIOUS);
if (!previous) {
  console.log("ℹ no previous snapshot — skipping diff guard");
} else {
  const cur = parseSemver(current.info?.version);
  const prev = parseSemver(previous.info?.version);
  if (!cur || !prev) fail("info.version must be SemVer (X.Y.Z)");
  const majorBumped = cur && prev && cur.major > prev.major;

  const prevOps = collectOperations(previous);
  const curOps = collectOperations(current);
  const breaking = [];

  for (const opKey of prevOps.keys()) {
    if (!curOps.has(opKey)) breaking.push(`route removed: ${opKey}`);
  }
  for (const [opKey, prevOp] of prevOps) {
    const curOp = curOps.get(opKey);
    if (!curOp) continue;
    if (prevOp.operationId && curOp.operationId && prevOp.operationId !== curOp.operationId)
      breaking.push(`${opKey}: operationId renamed ${prevOp.operationId} → ${curOp.operationId}`);
  }

  for (const [name, prevSchema] of Object.entries(previous.components?.schemas ?? {})) {
    const curSchema = current.components?.schemas?.[name];
    if (!curSchema) { breaking.push(`schema removed: ${name}`); continue; }
    const prevReq = collectRequired(prevSchema, previous);
    const curReq = collectRequired(curSchema, current);
    for (const r of prevReq) {
      if (!curReq.has(r)) breaking.push(`schema ${name}: required property '${r}' removed`);
    }
  }

  if (breaking.length === 0) {
    ok("no breaking changes vs snapshot");
  } else if (majorBumped) {
    console.log(`ℹ ${breaking.length} breaking change(s) accepted (major bumped ${prev.major} → ${cur.major}):`);
    for (const b of breaking) console.log(`  - ${b}`);
  } else {
    for (const b of breaking) fail(`breaking change without major bump — ${b}`);
    console.error("\nFix: either revert the breaking change, or bump info.version's major and update docs/openapi.previous.yaml + docs/openapi-CHANGELOG.md.");
  }
}

if (process.exitCode) process.exit(process.exitCode);
console.log("\nopenapi:check passed.");
