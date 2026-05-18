import fs from "node:fs/promises";
import path from "node:path";

const BUNDLED_PROMPTS_DIR = path.resolve(import.meta.dirname);

function promptsDir(): string {
  return process.env.PROMPTS_DIR ?? BUNDLED_PROMPTS_DIR;
}

type CacheEntry = { content: string; mtimeMs: number };
const cache = new Map<string, CacheEntry>();

async function readWithCache(absPath: string): Promise<string> {
  const stat = await fs.stat(absPath);
  const cached = cache.get(absPath);
  if (cached && cached.mtimeMs === stat.mtimeMs) return cached.content;
  const content = (await fs.readFile(absPath, "utf8")).trim();
  cache.set(absPath, { content, mtimeMs: stat.mtimeMs });
  return content;
}

export async function loadPrompt(name: string): Promise<string> {
  return readWithCache(path.join(promptsDir(), `${name}.md`));
}

export async function loadFragment(name: string): Promise<string> {
  return readWithCache(path.join(promptsDir(), "fragments", `${name}.md`));
}

export function renderPrompt(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

export type PromptPart =
  | string
  | null
  | undefined
  | false
  | 0
  | { fragment: string; vars?: Record<string, string> }
  | { raw: string };

export async function composePrompt(parts: PromptPart[]): Promise<string> {
  const rendered: string[] = [];
  for (const part of parts) {
    if (!part) continue;
    if (typeof part === "string") {
      rendered.push(part);
      continue;
    }
    if ("raw" in part) {
      rendered.push(part.raw);
      continue;
    }
    const template = await loadFragment(part.fragment);
    rendered.push(part.vars ? renderPrompt(template, part.vars) : template);
  }
  return rendered.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
