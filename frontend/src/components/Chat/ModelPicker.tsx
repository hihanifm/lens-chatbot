import { useEffect, useRef, useState } from "react";
import {
  useAvailableModels,
  useLlmSettings,
  useSetUserPreferredModel,
  useUserPreferredModel,
} from "../../api/queries";

/**
 * Per-user model picker chip. Sits in the Composer's context bar next to
 * skill chips. Shows the user's preferred model (falling back to the global
 * default); click to open a dropdown of available models from the provider.
 *
 * Backend persists via PUT /settings/user/model — `/analyze` reads
 * `users.getPreferredModel(user.id)` directly, so no per-turn param is needed.
 */
export function ModelPicker({ userId }: { userId: string }) {
  const { data: llm } = useLlmSettings();
  const { data: pref } = useUserPreferredModel(userId);
  const { data: avail, isError: availError } = useAvailableModels();
  const setPref = useSetUserPreferredModel();

  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close the dropdown on outside click / escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const effective = pref?.model ?? llm?.model ?? "(default)";
  const models = avail?.models ?? [];
  const disabled = availError || models.length === 0;

  const pick = (m: string | null) => {
    setPref.mutate({ userId, model: m });
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled}
        title={
          disabled
            ? "Model list unavailable — check provider connection"
            : "Pick the model for your next turns"
        }
        className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full
          bg-sky-100 text-sky-700 hover:bg-sky-200
          dark:bg-sky-900/40 dark:text-sky-200 dark:hover:bg-sky-900/60
          disabled:opacity-60 disabled:cursor-not-allowed"
      >
        <span aria-hidden>🤖</span>
        <span className="max-w-[14rem] truncate">{effective}</span>
        {!disabled && <span aria-hidden className="text-sky-500">▾</span>}
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute z-20 bottom-full mb-1 left-0 min-w-[16rem] max-h-72 overflow-auto
            border border-gray-200 rounded-lg shadow-lg
            bg-white dark:bg-slate-900 dark:border-slate-700"
        >
          {pref?.model && (
            <button
              type="button"
              onClick={() => pick(null)}
              className="w-full text-left px-3 py-1.5 text-xs italic text-gray-500 hover:bg-gray-100
                dark:text-slate-400 dark:hover:bg-slate-800 border-b border-gray-100 dark:border-slate-800"
            >
              Use global default ({llm?.model ?? "—"})
            </button>
          )}
          {models.map((m) => {
            const active = m === effective;
            return (
              <button
                key={m}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => pick(m)}
                className={
                  "w-full text-left px-3 py-1.5 text-xs font-mono " +
                  (active
                    ? "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200"
                    : "text-gray-700 hover:bg-gray-100 dark:text-slate-200 dark:hover:bg-slate-800")
                }
              >
                {m}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
