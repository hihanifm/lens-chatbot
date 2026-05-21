import { useMemo } from "react";
import type { SkillInfo } from "../../api/queries";

// Dropdown of available skills, opened by typing "/" in the composer.
export function SkillPicker({
  skills,
  filter,
  onPick,
  onClose,
}: {
  skills: SkillInfo[];
  filter: string;
  onPick: (skill: SkillInfo) => void;
  onClose: () => void;
}) {
  const matches = useMemo(() => {
    const f = filter.trim().toLowerCase();
    if (!f) return skills;
    return skills.filter(
      (s) =>
        s.name.toLowerCase().includes(f) ||
        s.description.toLowerCase().includes(f)
    );
  }, [skills, filter]);

  if (matches.length === 0) return null;

  return (
    <div
      id="skill-picker"
      className="absolute bottom-full mb-2 left-0 w-80 max-h-64 overflow-y-auto
        bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700
        rounded-lg shadow-lg z-20"
    >
      <div className="flex items-center justify-between px-3 py-1.5 border-b
        border-gray-100 dark:border-slate-800">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
          Skills
        </span>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-gray-400 hover:text-gray-700 dark:hover:text-slate-200"
        >
          esc
        </button>
      </div>
      {matches.map((s) => (
        <button
          key={s.name}
          type="button"
          onClick={() => onPick(s)}
          className="block w-full text-left px-3 py-2 hover:bg-violet-50 dark:hover:bg-slate-800
            transition-colors"
        >
          <div className="text-sm font-medium text-gray-800 dark:text-slate-100">
            🧩 {s.name}
          </div>
          {s.description && (
            <div className="text-xs text-gray-400 dark:text-slate-500 lens-clamp-2">
              {s.description}
            </div>
          )}
        </button>
      ))}
    </div>
  );
}
