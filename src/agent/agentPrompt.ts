import fs from "node:fs/promises";
import path from "node:path";
import { loadSkills, type LoadedSkill } from "./skillsLoader.js";
import { getWikiRoot } from "../services/wikiService.js";
import { settings } from "../db.js";
import { composePrompt, loadFragment } from "../prompts/promptLoader.js";

export async function loadAgentSkills(): Promise<LoadedSkill[]> {
  const skillsDirs = settings.getSkillsDirs();
  return loadSkills(skillsDirs);
}

export async function getWikiRootIndexPath(): Promise<string | null> {
  const indexPath = path.join(getWikiRoot(), "index.md");
  try {
    await fs.access(indexPath);
    return indexPath;
  } catch {
    return null;
  }
}

/**
 * Domain rules — joined into ClineCore's {{CLINE_RULES}} slot at session start.
 * Stable per session; does not depend on per-turn state.
 */
export async function buildSystemRules(): Promise<string> {
  return composePrompt([
    { fragment: "rules/role" },
    { fragment: "rules/citation-format" },
    { fragment: "rules/budget" },
    { fragment: "rules/path-policy" },
    { fragment: "rules/no-modify" },
  ]);
}

function renderFileList(
  files: string[],
  workspacePath: string,
  fileComments?: Record<string, string>,
): string {
  return files
    .map((f) => {
      const rel = path.relative(workspacePath, f);
      const comment = fileComments?.[f];
      return comment ? `- ${rel}\n  Comment: "${comment}"` : `- ${rel}`;
    })
    .join("\n");
}

function renderSkills(skills: LoadedSkill[]): string {
  return skills.map((s) => `  - ${s.filePath}  (${s.name})`).join("\n");
}

function renderReports(reports: string[], workspacePath: string): string {
  return reports.map((p) => `  ${path.relative(workspacePath, p)}`).join("\n");
}

export async function buildPrompt(input: {
  workspacePath: string;
  files: string[];
  question: string;
  skills: LoadedSkill[];
  wikiRootIndex: string | null;
  environmentContext: string;
  fileComments?: Record<string, string>;
  priorReports?: string[];
}): Promise<string> {
  const fileList = input.files.length
    ? renderFileList(input.files, input.workspacePath, input.fileComments)
    : await loadFragment("user/no-files-downloaded");

  return composePrompt([
    input.environmentContext,
    "",
    { fragment: "user/workspace-header", vars: { workspace: input.workspacePath } },
    { fragment: "user/files-header", vars: { fileList } },
    input.files.length
      ? { fragment: "user/files-present" }
      : { fragment: "user/files-empty", vars: { workspace: input.workspacePath } },
    input.skills.length > 0 && {
      fragment: "user/skills-hint",
      vars: { skills: renderSkills(input.skills) },
    },
    input.wikiRootIndex && {
      fragment: "user/wiki-hint",
      vars: { wikiPath: input.wikiRootIndex },
    },
    input.priorReports?.length && {
      fragment: "user/prior-reports",
      vars: { reports: renderReports(input.priorReports, input.workspacePath) },
    },
    { fragment: "user/question", vars: { question: input.question } },
  ]);
}

export async function buildFollowUpPrompt(input: {
  workspacePath: string;
  files: string[];
  question: string;
  fileComments?: Record<string, string>;
}): Promise<string> {
  const fileList = input.files.length
    ? renderFileList(input.files, input.workspacePath, input.fileComments)
    : await loadFragment("user/no-files-downloaded");

  return composePrompt([
    { fragment: "user/followup-files", vars: { fileList } },
    { fragment: "user/question", vars: { question: input.question } },
  ]);
}
