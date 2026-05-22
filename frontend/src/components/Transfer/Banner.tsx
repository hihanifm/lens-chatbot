import { useUpload } from "../../state/upload";
import { useDownload } from "../../state/download";
import { useTransferQueue } from "../../state/transferQueue";

function mb(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(1);
}

// Single global status bar for uploads and downloads, shown below the header.
// Transfers run fully serial (see transferQueue), so at most one is active;
// any others waiting show as a "· N queued" suffix. Survives drawer toggles
// and session switches.
export function TransferBanner() {
  const upload = useUpload((s) => s.active);
  const clearUpload = useUpload((s) => s.clear);
  const download = useDownload((s) => s.active);
  const clearDownload = useDownload((s) => s.clear);
  const queued = useTransferQueue((s) => s.queued);

  if (!upload && !download) return null;

  const isUpload = !!upload;
  const clear = isUpload ? clearUpload : clearDownload;
  const phase = isUpload ? upload!.phase : download!.phase;
  const loaded = isUpload ? upload!.loaded : download!.loaded;
  const total = isUpload ? upload!.total : download!.total;
  const isError = phase === "error";
  const isDone = phase === "done";

  const queuedSuffix = queued > 0 ? ` · ${queued} queued` : "";

  let title: string;
  let phaseLabel: string;
  let showBar: boolean;

  if (isUpload) {
    const u = upload!;
    title = `${u.bugId}  ${u.fileName}`;
    phaseLabel =
      u.phase === "uploading"
        ? `Uploading ${mb(u.loaded)} / ${mb(u.total)} MB`
        : u.phase === "saving"
          ? "Saving on server…"
          : u.phase === "done"
            ? "Upload complete"
            : u.message ?? "Upload failed";
    showBar = u.phase === "uploading";
  } else {
    const d = download!;
    const counter = d.count > 1 ? ` (${d.index}/${d.count})` : "";
    title = d.label;
    phaseLabel =
      d.phase === "downloading"
        ? d.total > 0
          ? `Downloading ${mb(d.loaded)} / ${mb(d.total)} MB${counter}`
          : `Downloading…${counter}`
        : d.phase === "done"
          ? "Download complete"
          : d.message ?? "Download failed";
    showBar = d.phase === "downloading" && d.total > 0;
  }

  const pct = total > 0 ? Math.round((loaded / total) * 100) : 0;

  return (
    <div
      id="transfer-banner"
      className={
        "border-b px-6 py-2 text-sm flex items-center gap-3 " +
        (isError
          ? "bg-red-50 border-red-200 text-red-700 dark:bg-red-900/30 dark:border-red-800 dark:text-red-300"
          : "bg-blue-50 border-blue-200 text-blue-800 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200")
      }
    >
      <span className="truncate flex-1" id="transfer-banner-text">
        {title} — {phaseLabel}
        {queuedSuffix}
      </span>
      {showBar && (
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
