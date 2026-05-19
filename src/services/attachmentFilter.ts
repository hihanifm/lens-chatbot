import fs from "node:fs/promises";
import path from "node:path";
import { settings } from "../db.js";

export type FilterRules = {
  critical: string[];
  priority: string[];
  useful: string[];
  skip: string[];
  size_cap_mb: number;
};

export type FileClass = "critical" | "priority" | "useful" | "skip" | "oversize" | "other";

const DEFAULT_RULES: FilterRules = {
  critical: [],
  priority: [],
  useful: ["**/*.log", "**/*.txt", "**/*.json"],
  skip: ["**/*.png", "**/*.jpg", "**/*.mp4", "**/*.bin", "**/*.so", "**/*.dex"],
  size_cap_mb: 200,
};

const FILTER_SKILL_FILENAME = "attachment-filter.md";

let cached: { rules: FilterRules; matchers: CompiledMatchers; loadedAt: number } | null = null;
const CACHE_TTL_MS = 30_000;

type CompiledMatchers = {
  critical: RegExp[];
  priority: RegExp[];
  useful: RegExp[];
  skip: RegExp[];
};

/**
 * Tiny glob → regex. Supports `*` (no slash), `**` (any incl. slash), `?` (one char).
 * Other chars are escaped literally. Anchored full-string match.
 */
function globToRegex(glob: string): RegExp {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*" && glob[i + 1] === "*") {
      re += ".*";
      i++;
      // swallow optional trailing slash so `**/x` matches `x` at root too
      if (glob[i + 1] === "/") i++;
    } else if (c === "*") {
      re += "[^/]*";
    } else if (c === "?") {
      re += "[^/]";
    } else if (/[.+^${}()|[\]\\]/.test(c)) {
      re += "\\" + c;
    } else {
      re += c;
    }
  }
  return new RegExp("^" + re + "$");
}

function compile(rules: FilterRules): CompiledMatchers {
  return {
    critical: rules.critical.map(globToRegex),
    priority: rules.priority.map(globToRegex),
    useful: rules.useful.map(globToRegex),
    skip: rules.skip.map(globToRegex),
  };
}

async function findFilterSkillPath(): Promise<string | null> {
  const dirs = settings.getSkillsDirs();
  for (const dir of dirs) {
    const p = path.join(dir, FILTER_SKILL_FILENAME);
    try {
      await fs.access(p);
      return p;
    } catch { /* keep looking */ }
  }
  return null;
}

export function extractFirstJsonBlock(md: string): unknown | null {
  const m = md.match(/```json\s*\n([\s\S]*?)\n```/);
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}

export function coerceRules(parsed: unknown): FilterRules {
  const p = (parsed ?? {}) as Partial<FilterRules>;
  const arr = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  return {
    critical: arr(p.critical),
    priority: arr(p.priority),
    useful: arr(p.useful),
    skip: arr(p.skip),
    size_cap_mb: typeof p.size_cap_mb === "number" ? p.size_cap_mb : DEFAULT_RULES.size_cap_mb,
  };
}

export async function loadAttachmentFilter(): Promise<{
  rules: FilterRules;
  matchers: CompiledMatchers;
}> {
  const now = Date.now();
  if (cached && now - cached.loadedAt < CACHE_TTL_MS) return cached;
  const skillPath = await findFilterSkillPath();
  let rules = DEFAULT_RULES;
  if (skillPath) {
    try {
      const md = await fs.readFile(skillPath, "utf8");
      const parsed = extractFirstJsonBlock(md);
      if (parsed) rules = coerceRules(parsed);
    } catch { /* fall back to defaults */ }
  }
  cached = { rules, matchers: compile(rules), loadedAt: now };
  return cached;
}

/** Clear the cache — for tests or post-skill-edit refresh. */
export function clearAttachmentFilterCache(): void {
  cached = null;
}

/**
 * Classify one file. `relPath` is workspace-relative (forward slashes).
 * Precedence: skip > critical > priority > useful > other. Size cap returns
 * "oversize" for anything over the cap that wasn't already skipped.
 */
export function classify(
  relPath: string,
  sizeBytes: number | undefined,
  matchers: CompiledMatchers,
  rules: FilterRules,
): FileClass {
  const p = relPath.replace(/\\/g, "/");
  if (matchers.skip.some((r) => r.test(p))) return "skip";
  if (sizeBytes !== undefined && sizeBytes > rules.size_cap_mb * 1024 * 1024) return "oversize";
  if (matchers.critical.some((r) => r.test(p))) return "critical";
  if (matchers.priority.some((r) => r.test(p))) return "priority";
  if (matchers.useful.some((r) => r.test(p))) return "useful";
  return "other";
}

/** True if the file should be auto-selected into the agent context (chat/upload paths). */
export function shouldAutoSelect(c: FileClass): boolean {
  return c === "critical" || c === "priority" || c === "useful";
}

/** True if the file is critical — Lucky uses this to pick its minimal file set. */
export function isCritical(c: FileClass): boolean {
  return c === "critical";
}

/**
 * Convenience: classify a batch of absolute paths against `workspacePath`,
 * stat'ing each to get its size. Errors on individual files become "other".
 */
export async function classifyBatch(
  absPaths: string[],
  workspacePath: string,
): Promise<Array<{ absPath: string; relPath: string; sizeBytes: number; classification: FileClass }>> {
  const { rules, matchers } = await loadAttachmentFilter();
  const out: Array<{ absPath: string; relPath: string; sizeBytes: number; classification: FileClass }> = [];
  for (const abs of absPaths) {
    let size = 0;
    try {
      const st = await fs.stat(abs);
      size = st.size;
    } catch { /* missing file → size 0 */ }
    const rel = path.relative(workspacePath, abs).split(path.sep).join("/");
    out.push({ absPath: abs, relPath: rel, sizeBytes: size, classification: classify(rel, size, matchers, rules) });
  }
  return out;
}

/** Summarize a batch for status logging. */
export function summarizeBatch(
  classified: Array<{ classification: FileClass }>,
): { critical: number; priority: number; useful: number; skip: number; oversize: number; other: number; kept: number } {
  const counts = { critical: 0, priority: 0, useful: 0, skip: 0, oversize: 0, other: 0 };
  for (const c of classified) counts[c.classification]++;
  return { ...counts, kept: counts.critical + counts.priority + counts.useful };
}
