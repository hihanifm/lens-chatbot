import { useEffect, useMemo, useRef } from "react";
import type { SkillInfo } from "../../api/queries";

// Shared filtering so the Composer's key handler and the dropdown agree.
export function filterSkills(skills: SkillInfo[], filter: string): SkillInfo[] {
  const f = filter.trim().toLowerCase();
  if (!f) return skills;
  return skills.filter(
    (s) =>
      s.name.toLowerCase().includes(f) ||
      s.description.toLowerCase().includes(f)
  );
}

// Dropdown of available skills, opened by typing "/" in the composer.
export function SkillPicker({
  skills,
  filter,
  activeIndex,
  onPick,
  onHover,
  onClose,
}: {
  skills: SkillInfo[];
  filter: string;
  activeIndex: number;
  onPick: (skill: SkillInfo) => void;
  onHover: (index: number) => void;
  onClose: () => void;
}) {
  const matches = useMemo(() => filterSkills(skills, filter), [skills, filter]);
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

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
      {matches.map((s, i) => {
        const active = i === activeIndex;
        return (
          <button
            key={s.name}
            ref={active ? activeRef : null}
            type="button"
            aria-selected={active}
            onClick={() => onPick(s)}
            onMouseEnter={() => onHover(i)}
            className={`block w-full text-left px-3 py-2 transition-colors ${
              active
                ? "bg-violet-50 dark:bg-slate-800"
                : "hover:bg-violet-50 dark:hover:bg-slate-800"
            }`}
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
        );
      })}
    </div>
  );
}
