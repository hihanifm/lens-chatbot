import fs from "node:fs/promises";
import path from "node:path";
import { loadPrompt, renderPrompt } from "../prompts/promptLoader.js";

export interface WikiEntry {
  path: string;
  module: string;
  moduleSlug: string;
  filename: string;
  title: string;
  bugId: string;
  date: string;
  tags: string[];
  content?: string;
}

export function getWikiRoot(): string {
  return process.env.WIKI_DIR ?? path.join(process.env.DATA_DIR ?? "data/local", "wiki");
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

function parseWikiFrontmatter(content: string): Record<string, string> {
  const m = content.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return {};
  return Object.fromEntries(
    m[1]
      .split("\n")
      .map((line) => line.match(/^([\w_-]+):\s*(.*)$/))
      .filter((x): x is RegExpMatchArray => x !== null)
      .map(([, k, v]) => [k!, v!.trim()])
  );
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const SCHEMA_CONTENT = `# Troubleshooting Wiki — Schema

This wiki contains synthesized insights from resolved bug investigations.

## Navigation (read in this order)
1. \`index.md\` (this directory) — module directory; lists what each module covers and how many entries it has
2. \`<module>/index.md\` — bug catalog for that module; one line per entry with title and one-sentence summary
3. \`<module>/YYYYMMDD-BUGID-slug.md\` — full entry: root cause, evidence, resolution, log patterns

## Root index format
Each module section: name, coverage tags (derived from entry tags), entry count, last updated date.

## Module index format
One line per entry: \`- [title](filename) — one-sentence summary [date]\`

## Entry format
YAML frontmatter (bug_id, module, date, title, tags) + five sections:
Problem · Root Cause · Evidence · Resolution · Key Log Patterns

## How to use
- Read root \`index.md\` to identify which module(s) are relevant to the current bug
- Read that module's \`index.md\` to pick 1–2 entries most likely to apply
- Read those entries for confirmed root causes and log patterns
- Do not re-derive what is already documented here
`;

async function upsertRootIndex(
  wikiRoot: string,
  moduleSlug: string,
  moduleName: string,
  date: string
): Promise<void> {
  const rootIndexPath = path.join(wikiRoot, "index.md");
  const moduleDir = path.join(wikiRoot, moduleSlug);

  // Collect all tags from this module's entries to build coverage summary
  const allTags: string[] = [];
  let entryCount = 0;
  try {
    const files = await fs.readdir(moduleDir);
    for (const f of files) {
      if (!f.endsWith(".md") || f === "index.md") continue;
      try {
        const content = await fs.readFile(path.join(moduleDir, f), "utf8");
        const fm = parseWikiFrontmatter(content);
        if (fm.bug_id) {
          entryCount++;
          const tags = (fm.tags ?? "").split(",").map((t) => t.trim()).filter(Boolean);
          allTags.push(...tags);
        }
      } catch { /* skip unreadable files */ }
    }
  } catch { /* module dir may not exist yet */ }

  const uniqueTags = [...new Set(allTags)].sort();
  const moduleSection =
    `## ${moduleName}\n` +
    `**Covers:** ${uniqueTags.length ? uniqueTags.join(", ") : "(no tags yet)"}\n` +
    `**Entries:** ${entryCount} · Last updated: ${date}\n` +
    `→ [${moduleSlug}/index.md](${moduleSlug}/index.md)\n`;

  let existing = "";
  try { existing = await fs.readFile(rootIndexPath, "utf8"); } catch { /* fresh wiki */ }

  if (!existing) {
    await fs.writeFile(rootIndexPath, `# Troubleshooting Wiki\n\n${moduleSection}`, "utf8");
    return;
  }

  // Replace existing section for this module, or append
  const sectionRegex = new RegExp(
    `## (?:${escapeRegex(moduleName)}|${escapeRegex(moduleSlug)})[^\n]*\n(?:(?!## )[^\n]*\n)*`,
    "i"
  );

  if (sectionRegex.test(existing)) {
    await fs.writeFile(rootIndexPath, existing.replace(sectionRegex, moduleSection), "utf8");
  } else {
    await fs.writeFile(rootIndexPath, existing.trimEnd() + "\n\n" + moduleSection, "utf8");
  }
}

export async function createWikiEntry(opts: {
  module: string;
  title: string;
  bugId: string;
  tags: string[];
  body: string;
  oneLiner: string;
}): Promise<WikiEntry> {
  const wikiRoot = getWikiRoot();
  const moduleSlug = slugify(opts.module);
  const titleSlug = slugify(opts.title);
  const date = new Date().toISOString().slice(0, 10);
  const dateCompact = date.replace(/-/g, "");
  const moduleDir = path.join(wikiRoot, moduleSlug);

  await fs.mkdir(moduleDir, { recursive: true });

  // Handle filename collisions
  let filename = `${dateCompact}-${opts.bugId}-${titleSlug}.md`;
  let filePath = path.join(moduleDir, filename);
  for (let i = 2; i <= 9; i++) {
    try {
      await fs.access(filePath);
      // file exists — try next suffix
      filename = `${dateCompact}-${opts.bugId}-${titleSlug}-${i}.md`;
      filePath = path.join(moduleDir, filename);
    } catch {
      break; // file doesn't exist — use this name
    }
  }

  // Strip the trailing summary: block before writing the entry file
  const cleanBody = opts.body.replace(/\n---\nsummary:.*$/ms, "").trimEnd() + "\n";
  await fs.writeFile(filePath, cleanBody, "utf8");

  // Append to module index
  const moduleIndexPath = path.join(moduleDir, "index.md");
  let moduleIndexExists = true;
  try { await fs.access(moduleIndexPath); } catch { moduleIndexExists = false; }

  const moduleIndexLine = `- [${opts.title}](${filename}) — ${opts.oneLiner} [${date}]\n`;
  if (!moduleIndexExists) {
    await fs.writeFile(
      moduleIndexPath,
      `# ${opts.module} — Bug Index\n\n${moduleIndexLine}`,
      "utf8"
    );
  } else {
    await fs.appendFile(moduleIndexPath, moduleIndexLine, "utf8");
  }

  // Upsert root index module section
  await upsertRootIndex(wikiRoot, moduleSlug, opts.module, date);

  // Append to log.md
  const logPath = path.join(wikiRoot, "log.md");
  await fs.appendFile(
    logPath,
    `## [${date}] ingest | ${opts.bugId} | ${opts.module} | ${opts.title}\n`,
    "utf8"
  );

  // Write SCHEMA.md on first use
  const schemaPath = path.join(wikiRoot, "SCHEMA.md");
  try { await fs.access(schemaPath); } catch {
    await fs.writeFile(schemaPath, SCHEMA_CONTENT, "utf8");
  }

  return { path: filePath, module: opts.module, moduleSlug, filename, title: opts.title, bugId: opts.bugId, date, tags: opts.tags };
}

export async function listWikiEntries(): Promise<WikiEntry[]> {
  const wikiRoot = getWikiRoot();
  const results: WikiEntry[] = [];

  let dirs: string[];
  try {
    const entries = await fs.readdir(wikiRoot, { withFileTypes: true });
    dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }

  for (const moduleSlug of dirs) {
    const moduleDir = path.join(wikiRoot, moduleSlug);
    let files: string[];
    try { files = await fs.readdir(moduleDir); } catch { continue; }

    for (const filename of files) {
      if (!filename.endsWith(".md") || filename === "index.md") continue;
      try {
        const filePath = path.join(moduleDir, filename);
        const content = await fs.readFile(filePath, "utf8");
        const fm = parseWikiFrontmatter(content);
        if (!fm.bug_id) continue;
        results.push({
          path: filePath,
          module: fm.module ?? moduleSlug,
          moduleSlug,
          filename,
          title: fm.title ?? filename,
          bugId: fm.bug_id,
          date: fm.date ?? "",
          tags: (fm.tags ?? "").split(",").map((t) => t.trim()).filter(Boolean),
        });
      } catch { /* skip */ }
    }
  }

  return results.sort((a, b) => b.date.localeCompare(a.date));
}

export async function readWikiEntry(moduleSlug: string, filename: string): Promise<string> {
  if (!filename.endsWith(".md")) {
    throw Object.assign(new Error("filename must end in .md"), { code: "EINVAL" });
  }
  const wikiRoot = getWikiRoot();
  const resolved = path.resolve(wikiRoot, moduleSlug, filename);
  if (!resolved.startsWith(path.resolve(wikiRoot) + path.sep)) {
    throw Object.assign(new Error("path traversal detected"), { code: "EACCES" });
  }
  return fs.readFile(resolved, "utf8");
}

export async function buildWikiSynthesisPrompt(
  transcript: string,
  bugComments: string,
  bugId: string,
  module: string
): Promise<string> {
  const today = new Date().toISOString().slice(0, 10);
  const template = await loadPrompt("wiki-synthesis");
  return renderPrompt(template, { bugId, module, today, bugComments, transcript });
}
