import { useRef, useState } from "react";
import { Button } from "../ui/Button";
import { Spinner } from "../ui/Spinner";
import { SkillPicker } from "./SkillPicker";
import { SkillChip } from "./SkillChip";
import { useSkills, type SkillInfo } from "../../api/queries";

interface ComposerProps {
  streaming: boolean;
  onSend: (question: string, skill: string | null) => void;
  onAbort: () => void;
  disabled?: boolean;
}

export function Composer({ streaming, onSend, onAbort, disabled }: ComposerProps) {
  const [value, setValue] = useState("");
  const [skill, setSkill] = useState<SkillInfo | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const { data: skills = [] } = useSkills();

  const submit = () => {
    const q = value.trim();
    if (!q || streaming || disabled) return;
    onSend(q, skill?.name ?? null);
    setValue("");
    setSkill(null);
    if (taRef.current) taRef.current.style.height = "auto";
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (pickerOpen && e.key === "Escape") {
      e.preventDefault();
      setPickerOpen(false);
      return;
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
    setPickerOpen(v.startsWith("/") && skills.length > 0);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  };

  const pickSkill = (s: SkillInfo) => {
    setSkill(s);
    setPickerOpen(false);
    // Drop the "/filter" text the user typed to open the picker.
    setValue((v) => (v.startsWith("/") ? "" : v));
    taRef.current?.focus();
  };

  return (
    <div className="border-t border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-6 py-3">
      {skill && (
        <div className="mb-2" id="context-bar">
          <SkillChip name={skill.name} onRemove={() => setSkill(null)} />
        </div>
      )}
      <div className="relative flex items-end gap-2">
        {pickerOpen && (
          <SkillPicker
            skills={skills}
            filter={value.slice(1)}
            onPick={pickSkill}
            onClose={() => setPickerOpen(false)}
          />
        )}
        <textarea
          id="question-input"
          ref={taRef}
          value={value}
          onChange={autoGrow}
          onKeyDown={onKeyDown}
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
