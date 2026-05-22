/**
 * Extract workspace-relative file paths mentioned in agent reply text.
 * Matches paths in backticks, quotes, or bare — anchored to known workspace dirs.
 */

const KNOWN_PREFIXES = ["agent_notes/", "attachments/"];
const PATH_CHARS = "[^\\s`'\"()\\[\\]<>{}]+";

// Backtick-wrapped: `agent_notes/foo.txt`
const BACKTICK_RE = new RegExp("`(" + PATH_CHARS + ")`", "g");
// Quoted: "agent_notes/foo.txt" or 'agent_notes/foo.txt'
const QUOTED_RE = new RegExp(`["']((agent_notes|attachments)/${PATH_CHARS})["']`, "g");
// Bare word at a word boundary: agent_notes/foo.txt
const BARE_RE = new RegExp(`\\b((agent_notes|attachments)/${PATH_CHARS})`, "g");

function isWorkspacePath(p: string): boolean {
  return KNOWN_PREFIXES.some((prefix) => p.startsWith(prefix));
}

export function extractWorkspacePaths(text: string): string[] {
  const seen = new Set<string>();
  const add = (p: string) => {
    if (isWorkspacePath(p)) seen.add(p);
  };

  for (const m of text.matchAll(BACKTICK_RE)) add(m[1]);
  for (const m of text.matchAll(QUOTED_RE)) add(m[1]);
  for (const m of text.matchAll(BARE_RE)) add(m[1]);

  return [...seen];
}
