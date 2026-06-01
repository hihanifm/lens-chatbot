import path from "path";
import fs from "node:fs/promises";

export interface AgentReportFile {
  relativePath: string;
  name: string;
  size: number;
}

function isUnderWorkspace(workspacePath: string, resolved: string): boolean {
  const root = path.resolve(workspacePath) + path.sep;
  return resolved === path.resolve(workspacePath) || resolved.startsWith(root);
}

async function collectAgentNoteMdPaths(
  workspacePath: string,
  relativeDir: string,
): Promise<string[]> {
  const absDir = path.resolve(workspacePath, relativeDir);
  if (!isUnderWorkspace(workspacePath, absDir)) return [];

  let entries: import("fs").Dirent[];
  try {
    entries = await fs.readdir(absDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const paths: string[] = [];
  for (const entry of entries) {
    const rel = path.join(relativeDir, entry.name);
    const abs = path.resolve(workspacePath, rel);
    if (!isUnderWorkspace(workspacePath, abs)) continue;

    if (entry.isFile() && entry.name.endsWith(".md")) {
      paths.push(rel.split(path.sep).join("/"));
    } else if (entry.isDirectory()) {
      paths.push(...(await collectAgentNoteMdPaths(workspacePath, rel)));
    }
  }
  return paths;
}

export async function snapshotAgentReportPaths(workspacePath: string): Promise<Set<string>> {
  const paths = await collectAgentNoteMdPaths(workspacePath, "reports");
  return new Set(paths);
}

export async function listNewAgentReports(
  workspacePath: string,
  before: Set<string>,
): Promise<AgentReportFile[]> {
  const paths = await collectAgentNoteMdPaths(workspacePath, "reports");
  const reports: AgentReportFile[] = [];

  for (const relativePath of paths) {
    if (before.has(relativePath)) continue;
    const abs = path.resolve(workspacePath, relativePath);
    if (!isUnderWorkspace(workspacePath, abs)) continue;
    try {
      const stat = await fs.stat(abs);
      if (!stat.isFile()) continue;
      reports.push({
        relativePath,
        name: path.basename(relativePath),
        size: stat.size,
      });
    } catch {
      /* file removed between list and stat */
    }
  }

  reports.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return reports;
}

export function toAgentReportFile(relativePath: string, size: number): AgentReportFile {
  return {
    relativePath: relativePath.split(path.sep).join("/"),
    name: path.basename(relativePath),
    size,
  };
}
