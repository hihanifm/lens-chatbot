// Mirrors parseSkillTag from the legacy static/index.html. User messages may be
// prefixed with `[skill:Name]\n` — the chip is rendered separately from the body.
export function parseSkillTag(content: string): { skill: string | null; text: string } {
  const m = /^\[skill:([^\]]+)\]\n?/.exec(content || "");
  if (!m) return { skill: null, text: content };
  return { skill: m[1], text: content.slice(m[0].length) };
}
