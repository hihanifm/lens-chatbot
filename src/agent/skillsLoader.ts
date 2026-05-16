import { parseSkillConfigFromMarkdown } from "@cline/sdk";
import { readdir, readFile } from "node:fs/promises";
import { join, basename } from "node:path";
import type { SkillConfig } from "@cline/sdk";

export type LoadedSkill = SkillConfig & { filePath: string };

export async function loadSkills(skillsDirs: string[]): Promise<LoadedSkill[]> {
  const all: LoadedSkill[] = [];
  for (const dir of skillsDirs) {
    try {
      const files = (await readdir(dir)).filter((f) => f.endsWith(".md"));
      for (const file of files) {
        const filePath = join(dir, file);
        const content = await readFile(filePath, "utf-8");
        const skill = parseSkillConfigFromMarkdown(content, basename(file, ".md"));
        if (!skill.disabled) all.push({ ...skill, filePath });
      }
    } catch (err: any) {
      if (err.code !== "ENOENT") throw err;
    }
  }
  return all;
}
