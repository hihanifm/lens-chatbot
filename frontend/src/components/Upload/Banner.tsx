import { useUpload } from "../../state/upload";

function mb(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(1);
}

// Global upload progress strip, shown below the header. Survives drawer toggles
// and session switches (the legacy #upload-banner behaviour).
export function UploadBanner() {
  const active = useUpload((s) => s.active);
  const clear = useUpload((s) => s.clear);
  if (!active) return null;

  const pct = active.total > 0 ? Math.round((active.loaded / active.total) * 100) : 0;
  const phaseLabel =
    active.phase === "uploading"
      ? `Uploading ${mb(active.loaded)} / ${mb(active.total)} MB`
      : active.phase === "saving"
        ? "Saving on server…"
        : active.phase === "done"
          ? "Upload complete"
          : active.message ?? "Upload failed";
  const isError = active.phase === "error";
  const isDone = active.phase === "done";

  return (
    <div
      id="upload-banner"
      className={
        "border-b px-6 py-2 text-sm flex items-center gap-3 " +
        (isError
          ? "bg-red-50 border-red-200 text-red-700 dark:bg-red-900/30 dark:border-red-800 dark:text-red-300"
          : "bg-blue-50 border-blue-200 text-blue-800 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200")
      }
    >
      <span className="font-mono text-xs">{active.bugId}</span>
      <span className="truncate flex-1" id="upload-banner-text">
        {active.fileName} — {phaseLabel}
      </span>
      {active.phase === "uploading" && (
        <div className="w-32 h-1.5 rounded-full bg-blue-200 dark:bg-slate-700 overflow-hidden">
          <div className="h-full bg-blue-600 transition-all" style={{ width: `${pct}%` }} />
        </div>
      )}
      {(isDone || isError) && (
        <button
          type="button"
          onClick={clear}
          className="text-xs px-2 py-0.5 rounded hover:bg-black/5 dark:hover:bg-white/10"
        >
          Dismiss
        </button>
      )}
    </div>
  );
}
