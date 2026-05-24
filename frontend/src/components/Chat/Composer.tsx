import { useRef, useState, useMemo } from "react";
import { Button } from "../ui/Button";
import { Spinner } from "../ui/Spinner";
import { SkillPicker, filterSkills } from "./SkillPicker";
import { SkillChip } from "./SkillChip";
import { ModelPicker } from "./ModelPicker";
import { useSkills, type SkillInfo } from "../../api/queries";

interface ComposerProps {
  streaming: boolean;
  onSend: (question: string, skills: string[]) => void;
  onAbort: () => void;
  onFocus?: () => void;
  disabled?: boolean;
  selectedFiles?: string[];
  onRemoveFile?: (path: string) => void;
  /** Logged-in user — drives the per-user model picker. Picker is hidden when null. */
  userId?: string | null;
}

export function Composer({ streaming, onSend, onAbort, onFocus, disabled, selectedFiles = [], onRemoveFile, userId }: ComposerProps) {
  const [value, setValue] = useState("");
  const [selectedSkills, setSelectedSkills] = useState<SkillInfo[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const { data: skills = [] } = useSkills();

  const filteredSkills = useMemo(
    () => (pickerOpen ? filterSkills(skills, value.slice(1)) : []),
    [pickerOpen, skills, value]
  );

  const submit = () => {
    const q = value.trim();
    if (!q || streaming || disabled) return;
    onSend(q, selectedSkills.map((s) => s.name));
    setValue("");
    setSelectedSkills([]);
    if (taRef.current) taRef.current.style.height = "auto";
  };

  const pickSkill = (s: SkillInfo) => {
    setSelectedSkills((prev) =>
      prev.some((x) => x.name === s.name) ? prev : [...prev, s]
    );
    setPickerOpen(false);
    setActiveIndex(0);
    // Drop the "/filter" text the user typed to open the picker.
    setValue((v) => (v.startsWith("/") ? "" : v));
    taRef.current?.focus();
  };

  const removeSkill = (name: string) => {
    setSelectedSkills((prev) => prev.filter((s) => s.name !== name));
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (pickerOpen) {
      if (e.key === "Escape") {
        e.preventDefault();
        setPickerOpen(false);
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % filteredSkills.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + filteredSkills.length) % filteredSkills.length);
        return;
      }
      if (e.key === "Tab" && filteredSkills.length > 0) {
        e.preventDefault();
        pickSkill(filteredSkills[activeIndex]);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const autoGrow = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    setValue(v);
    // Open the skill picker the moment the input starts with "/".
    const open = v.startsWith("/") && skills.length > 0;
    setPickerOpen(open);
    if (open) setActiveIndex(0);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  };

  return (
    <div className="border-t border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-6 py-3">
      {(userId || selectedSkills.length > 0 || selectedFiles.length > 0) && (
        <div className="mb-2 flex flex-wrap items-center gap-1.5" id="context-bar">
          {userId && <ModelPicker userId={userId} />}
          {selectedSkills.map((s) => (
            <SkillChip key={s.name} name={s.name} onRemove={() => removeSkill(s.name)} />
          ))}
          {selectedFiles.map((path) => {
            const name = path.split("/").pop() ?? path;
            return (
              <span
                key={path}
                title={path}
                className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full
                  bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200"
              >
                <span aria-hidden>📎</span> {name}
                {onRemoveFile && (
                  <button
                    type="button"
                    onClick={() => onRemoveFile(path)}
                    className="ml-0.5 text-emerald-600 hover:text-emerald-800 dark:text-emerald-300 dark:hover:text-emerald-100"
                    aria-label={`Remove ${name}`}
                  >
                    ×
                  </button>
                )}
              </span>
            );
          })}
        </div>
      )}
      {selectedSkills.length > 2 && (
        <p
          id="skill-token-warning"
          className="mb-2 text-[11px] text-amber-600 dark:text-amber-400 px-1"
        >
          ⚠ {selectedSkills.length} skills selected — each one's full body is added
          to the prompt, which increases token cost.
        </p>
      )}
      <div className="relative flex items-end gap-2">
        {pickerOpen && (
          <SkillPicker
            skills={skills}
            filter={value.slice(1)}
            activeIndex={activeIndex}
            onPick={pickSkill}
            onHover={setActiveIndex}
            onClose={() => setPickerOpen(false)}
          />
        )}
        <textarea
          id="question-input"
          ref={taRef}
          value={value}
          onChange={autoGrow}
          onKeyDown={onKeyDown}
          onFocus={onFocus}
          rows={1}
          placeholder={
            disabled ? "Loading session…" : "Ask a question…  ( / for skills )"
          }
          disabled={disabled}
          className="flex-1 resize-none border border-gray-200 rounded-lg px-3 py-2 text-sm
            bg-white text-gray-900 placeholder:text-gray-400 max-h-[200px]
            focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20
            dark:bg-slate-950 dark:border-slate-700 dark:text-slate-100
            dark:placeholder:text-slate-500 disabled:opacity-50"
        />
        {streaming ? (
          <Button id="abort-btn" variant="danger" size="lg" onClick={onAbort}>
            <Spinner className="h-3.5 w-3.5" /> Stop
          </Button>
        ) : (
          <Button
            id="send-btn"
            variant="primary"
            size="lg"
            onClick={submit}
            disabled={disabled || !value.trim()}
          >
            Send
          </Button>
        )}
      </div>
      <p className="text-[11px] text-gray-400 dark:text-slate-600 mt-1 px-1">
        Enter to send · Shift+Enter for a new line · type / to attach a skill
      </p>
    </div>
  );
}
