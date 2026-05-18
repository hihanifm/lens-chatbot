import fs from "node:fs/promises";
import path from "node:path";
import { loadSkills, type LoadedSkill } from "./skillsLoader.js";
import { getWikiRoot } from "../services/wikiService.js";
import { settings } from "../db.js";

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

/** Shown when no workspace paths passed verification (exist on disk). */
export const NO_FILES_DOWNLOADED_LINE =
  "(none downloaded — use Files panel to download attachments, then add to context)";

export function buildPrompt(input: {
  workspacePath: string;
  files: string[];
  question: string;
  skills: LoadedSkill[];
  wikiRootIndex: string | null;
  taskContext: string;
  environmentContext: string;
  fileComments?: Record<string, string>;
  priorReports?: string[];
}): string {
  const fileList = input.files.length
    ? input.files.map((f) => {
        const rel = path.relative(input.workspacePath, f);
        const comment = input.fileComments?.[f];
        return comment ? `- ${rel}\n  Comment: "${comment}"` : `- ${rel}`;
      }).join("\n")
    : NO_FILES_DOWNLOADED_LINE;
  const skillsHint = input.skills.length > 0
    ? `Available skills - read the relevant ones before starting:\n${input.skills.map((s) => `  - ${s.filePath}  (${s.name})`).join("\n")}\n\n`
    : "";
  const wikiHint = input.wikiRootIndex
    ? `IMPORTANT: Before starting analysis, you MUST read the troubleshooting wiki index:\n` +
      `  ${input.wikiRootIndex}\n` +
      `Navigate in order:\n` +
      `  1. Read the root index above — find which module(s) match this bug\n` +
      `  2. Read <module>/index.md — pick the 1–2 entries most relevant to this bug\n` +
      `  3. Read those entry files — use their root cause and log patterns to shortcut investigation\n` +
      `Do not skip this step. Confirmed resolutions from past bugs are more reliable than re-deriving from scratch.\n\n`
    : "";
  const priorReportsHint = (input.priorReports?.length)
    ? `Prior analysis reports for this bug (most recent first):\n` +
      input.priorReports.map((p) => `  ${path.relative(input.workspacePath, p)}`).join("\n") + "\n" +
      `Read the most recent report first — reuse its root cause and evidence rather than re-deriving from scratch if the same files are present.\n\n`
    : "";
  return [
    input.taskContext,
    ``,
    input.environmentContext,
    ``,
    `WORKSPACE=${input.workspacePath}`,
    `Selected files to analyze (relative to WORKSPACE — join with WORKSPACE before reading):\n${fileList}`,
    ``,
    `If the user says "this", "attached log", "current log", or "analyze this", inspect the selected files first.`,
    `If the user asks to list files or explore the workspace, inspect WORKSPACE with tools instead of answering from memory.`,
    ``,
    skillsHint,
    wikiHint,
    priorReportsHint,
    `New question:\n${input.question}`,
  ].join("\n");
}

export function buildFollowUpPrompt(input: {
  workspacePath: string;
  files: string[];
  question: string;
  fileComments?: Record<string, string>;
}): string {
  const parts: string[] = [];
  if (input.files.length) {
    const fileList = input.files
      .map((f) => {
        const rel = path.relative(input.workspacePath, f);
        const comment = input.fileComments?.[f];
        return comment ? `- ${rel}\n  Comment: "${comment}"` : `- ${rel}`;
      })
      .join("\n");
    parts.push(`Selected files (relative to WORKSPACE):\n${fileList}`);
  } else {
    parts.push(`Selected files (relative to WORKSPACE):\n${NO_FILES_DOWNLOADED_LINE}`);
  }
  parts.push(`New question:\n${input.question}`);
  return parts.join("\n\n");
}
