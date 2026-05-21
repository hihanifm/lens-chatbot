import { cn } from "../../utils/cn";

type Tone = "ready" | "running" | "pending" | "error" | "info";

const tones: Record<Tone, string> = {
  ready:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200",
  running:
    "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200",
  pending:
    "bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-slate-300",
  error:
    "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200",
  info:
    "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-200",
};

const labelMap: Record<string, Tone> = {
  ready: "ready",
  done: "ready",
  ok: "ready",
  active: "running",
  running: "running",
  analyzing: "running",
  ingesting: "running",
  pending: "pending",
  idle: "pending",
  error: "error",
  failed: "error",
  aborted: "error",
};

export function StatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const tone: Tone = labelMap[status.toLowerCase()] ?? "info";
  const isRunning = tone === "running";
  return (
    <span
      className={cn(
        "text-xs font-medium px-2.5 py-1 rounded-full inline-flex items-center gap-1.5",
        tones[tone],
        className
      )}
    >
      {isRunning && (
        <svg className="animate-spin h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      )}
      {status}
    </span>
  );
}
