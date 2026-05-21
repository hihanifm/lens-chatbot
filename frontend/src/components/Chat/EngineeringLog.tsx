import { useState } from "react";
import { cn } from "../../utils/cn";
import type { LogLine } from "./types";

const lineColor: Record<LogLine["kind"], string> = {
  status: "text-gray-400 dark:text-slate-500",
  error: "text-red-600 dark:text-red-400",
  "cmd-ok": "text-emerald-600 dark:text-emerald-400",
  "cmd-error": "text-red-600 dark:text-red-400",
};

// Collapsible per-turn agent trace (status events + tool commands/errors).
export function EngineeringLog({
  lines,
  streaming,
}: {
  lines: LogLine[];
  streaming?: boolean;
}) {
  // Auto-expand while streaming so the user watches progress; collapsible after.
  const [open, setOpen] = useState(true);
  if (lines.length === 0 && !streaming) return null;

  const failures = lines.filter((l) => l.kind === "error" || l.kind === "cmd-error").length;
  const summary = streaming
    ? "running…"
    : `${lines.length} step${lines.length === 1 ? "" : "s"}`;

  return (
    <div className="self-start max-w-full w-full">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-1.5 w-full text-left px-1.5 py-1 rounded-md
          font-mono text-[11px] text-gray-400 dark:text-slate-500
          hover:bg-blue-50 dark:hover:bg-slate-800 transition-colors"
      >
        <span className={cn("transition-transform", open && "rotate-90")}>▶</span>
        <span className="font-semibold text-gray-500 dark:text-slate-400">
          Engineering log
        </span>
        <span>· {summary}</span>
        {failures > 0 && (
          <span className="text-red-500 font-semibold">· {failures} failed</span>
        )}
      </button>
      {open && lines.length > 0 && (
        <div className="flex flex-col gap-px pl-5 pr-1.5 pb-1 font-mono text-[11px]">
          {lines.map((l, i) => (
            <div key={i} className={cn("whitespace-pre-wrap break-words", lineColor[l.kind])}>
              {l.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
