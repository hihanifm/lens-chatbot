import { useDownloadAttachment } from "../../api/queries";
import { Spinner } from "../ui/Spinner";

// Downloads a single not-yet-downloaded attachment into the workspace.
export function DownloadButton({
  sessionId,
  attId,
  attName,
}: {
  sessionId: string;
  attId: string;
  attName: string;
}) {
  const download = useDownloadAttachment(sessionId);
  return (
    <button
      type="button"
      disabled={download.isPending}
      onClick={() => download.mutate({ attId, attName })}
      className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded border
        border-blue-300 text-blue-700 hover:bg-blue-50
        dark:border-blue-700/60 dark:text-blue-300 dark:hover:bg-slate-800
        disabled:opacity-50 transition-colors"
    >
      {download.isPending && <Spinner className="h-3 w-3" />}
      {download.isPending ? "Downloading…" : "⬇ Download"}
    </button>
  );
}

// Bulk "Download all" for a section's pending attachments.
export function DownloadAllButton({
  pendingCount,
  busy,
  progress,
  onClick,
}: {
  pendingCount: number;
  busy: boolean;
  progress: { done: number; total: number } | null;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={pendingCount === 0 || busy}
      onClick={onClick}
      title={pendingCount === 0 ? "All downloaded" : `Download ${pendingCount} attachment(s)`}
      className="text-[11px] px-2 py-0.5 rounded-md border
        border-gray-300 text-gray-600 hover:bg-gray-100
        dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800
        disabled:opacity-40 transition-colors"
    >
      {busy && progress
        ? `Downloading ${progress.done}/${progress.total}…`
        : "Download all"}
    </button>
  );
}
