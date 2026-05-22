// User messages may be prefixed with `[skill:A,B]\n` — one or more comma-joined
// skill names. The chips are rendered separately from the body.
export function parseSkillTag(content: string): { skills: string[]; text: string } {
  const m = /^\[skill:([^\]]+)\]\n?/.exec(content || "");
  if (!m) return { skills: [], text: content };
  const skills = m[1]
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return { skills, text: content.slice(m[0].length) };
}
