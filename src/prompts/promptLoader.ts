import fs from "node:fs/promises";
import path from "node:path";

const BUNDLED_PROMPTS_DIR = path.resolve(import.meta.dirname);

function promptsDir(): string {
  return process.env.PROMPTS_DIR ?? BUNDLED_PROMPTS_DIR;
}

export async function loadPrompt(name: string): Promise<string> {
  const filePath = path.join(promptsDir(), `${name}.md`);
  return (await fs.readFile(filePath, "utf8")).trim();
}

export function renderPrompt(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce(
    (t, [k, v]) => t.replaceAll(`{{${k}}}`, v),
    template
  );
}
