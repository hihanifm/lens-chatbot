import path from "node:path";
import { loadSkills, type LoadedSkill } from "./skillsLoader.js";

const AGENTS_MD = path.resolve(import.meta.dirname, "./environment.md");

export const SYSTEM_PROMPT = `You are a bug analysis assistant for engineers.
You have access to a workspace containing bug details, logs, and attachments.
Use only files in this workspace. Do not modify files. Do not invent facts.

Respond directly to what the user is asking:
- Simple questions (priority, assignee, status) -> answer concisely in 1-2 sentences.
- Requests for analysis or root cause -> read the relevant files, cite exact log lines
  or snippets, and structure your answer as: observed facts, likely root cause,
  evidence, next debugging steps, and confidence level.
- Conversational follow-ups -> answer naturally without repeating the full structure.

Always ground your answer in the workspace files. If the answer is not in the files,
say so clearly.

IMPORTANT: Before answering any question, you MUST read every file listed under "Selected files to analyze" using your file reading tools. Never answer from memory or make assumptions about file contents.`;

export async function loadAgentSkills(): Promise<LoadedSkill[]> {
  const skillsDirs = (process.env.SKILLS_DIR ?? "").split(":").filter(Boolean);
  return loadSkills(skillsDirs);
}

export function buildPrompt(input: {
  workspacePath: string;
  files: string[];
  question: string;
  skills: LoadedSkill[];
  fileComments?: Record<string, string>;
}): string {
  const fileList = input.files.length
    ? input.files.map((f) => {
        const comment = input.fileComments?.[f];
        return comment ? `- ${f}\n  Comment: "${comment}"` : `- ${f}`;
      }).join("\n")
    : "(none selected)";
  const skillsHint = input.skills.length > 0
    ? `Available skills - read the relevant ones before starting:\n${input.skills.map((s) => `  - ${s.filePath}  (${s.name})`).join("\n")}\n\n`
    : "";
  return [
    `Read ${AGENTS_MD} for environment context and available tools.`,
    ``,
    `WORKSPACE=${input.workspacePath}`,
    `Selected files to analyze:\n${fileList}`,
    ``,
    `If the user says "this", "attached log", "current log", or "analyze this", inspect the selected files first.`,
    `If the user asks to list files or explore the workspace, inspect WORKSPACE with tools instead of answering from memory.`,
    ``,
    skillsHint,
    `New question:\n${input.question}`,
  ].join("\n");
}
