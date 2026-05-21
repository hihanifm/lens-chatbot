import { useTheme, type ThemeMode } from "../state/theme";

const icon: Record<ThemeMode, string> = {
  light: "☀️",
  dark: "🌙",
  system: "🖥️",
};

const nextLabel: Record<ThemeMode, string> = {
  light: "Switch to dark",
  dark: "Switch to system",
  system: "Switch to light",
};

export function ThemeToggle() {
  const mode = useTheme((s) => s.mode);
  const cycle = useTheme((s) => s.cycle);
  return (
    <button
      type="button"
      onClick={cycle}
      title={`Theme: ${mode} — ${nextLabel[mode]}`}
      aria-label={`Theme: ${mode}. ${nextLabel[mode]}`}
      className="inline-flex items-center justify-center h-9 w-9 rounded-lg text-base
        bg-blue-500/30 hover:bg-blue-500/50 transition-colors
        focus-visible:ring-2 focus-visible:ring-white/50 outline-none"
    >
      <span aria-hidden>{icon[mode]}</span>
    </button>
  );
}
