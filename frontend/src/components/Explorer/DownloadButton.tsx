import { useQueryClient } from "@tanstack/react-query";
import { useDownload } from "../../state/download";
import { useTransferQueue } from "../../state/transferQueue";
import { Spinner } from "../ui/Spinner";

function refresh(qc: ReturnType<typeof useQueryClient>, sessionId: string) {
  qc.invalidateQueries({ queryKey: ["workspace-files", sessionId] });
  qc.invalidateQueries({ queryKey: ["session", sessionId] });
}

// Downloads a single not-yet-downloaded attachment into the workspace.
// Progress is shown in the global DownloadBanner.
export function DownloadButton({
  sessionId,
  attId,
  attName,
}: {
  sessionId: string;
  attId: string;
  attName: string;
}) {
  const qc = useQueryClient();
  const start = useDownload((s) => s.start);
  const busy = useDownload((s) => s.active?.phase === "downloading");
  // Disable while any transfer is running or queued — transfers are serial.
  const transferBusy = useTransferQueue((s) => s.running || s.queued > 0);
  return (
    <button
      type="button"
      disabled={busy || transferBusy}
      onClick={async () => {
        await start({ sessionId, items: [{ attId, attName }] });
        refresh(qc, sessionId);
      }}
      className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded border
        border-blue-300 text-blue-700 hover:bg-blue-50
        dark:border-blue-700/60 dark:text-blue-300 dark:hover:bg-slate-800
        disabled:opacity-50 transition-colors"
    >
      {busy && <Spinner className="h-3 w-3" />}
      {busy ? "Downloading…" : "⬇ Download"}
    </button>
  );
}

// Bulk "Download all" for a section's pending attachments.
export function DownloadAllButton({
  pendingCount,
  busy,
  onClick,
}: {
  pendingCount: number;
  busy: boolean;
  onClick: () => void;
}) {
  const transferBusy = useTransferQueue((s) => s.running || s.queued > 0);
  return (
    <button
      type="button"
      disabled={pendingCount === 0 || busy || transferBusy}
      onClick={onClick}
      title={pendingCount === 0 ? "All downloaded" : `Download ${pendingCount} attachment(s)`}
      className="text-[11px] px-2 py-0.5 rounded-md border
        border-gray-300 text-gray-600 hover:bg-gray-100
        dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800
        disabled:opacity-40 transition-colors"
    >
      {busy ? "Downloading…" : "Download all"}
    </button>
  );
}
