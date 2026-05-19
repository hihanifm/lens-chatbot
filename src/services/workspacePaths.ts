import path from "path";

function isUnderWorkspace(workspacePath: string, resolved: string): boolean {
  const root = path.resolve(workspacePath);
  const rootWithSep = root + path.sep;
  return resolved === root || resolved.startsWith(rootWithSep);
}

/** Normalize client path input (POSIX or Windows separators). */
function normalizeInput(input: string): string {
  return input.replace(/\\/g, "/");
}

/**
 * Resolve a workspace file path from an absolute path or a path relative to the workspace root.
 * Returns null if the result escapes the workspace.
 */
export function resolveWorkspaceFilePath(workspacePath: string, input: string): string | null {
  const trimmed = normalizeInput(String(input ?? "").trim());
  if (!trimmed) return null;

  const root = path.resolve(workspacePath);
  const resolved = path.isAbsolute(trimmed)
    ? path.resolve(trimmed)
    : path.resolve(root, trimmed);

  if (!isUnderWorkspace(workspacePath, resolved)) return null;
  return resolved;
}
