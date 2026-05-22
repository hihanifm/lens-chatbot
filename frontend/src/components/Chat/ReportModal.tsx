import { useEffect, useState } from "react";
import { Modal } from "../ui/Modal";
import { Spinner } from "../ui/Spinner";
import { Markdown } from "../ui/Markdown";
import { api } from "../../api/client";
import type { ReportRef } from "./types";

export function ReportModal({
  open,
  onClose,
  sessionId,
  report,
}: {
  open: boolean;
  onClose: () => void;
  sessionId: string;
  report: ReportRef | null;
}) {
  const [md, setMd] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !report) return;
    setMd(null);
    setErr(null);
    const url = `/session/${sessionId}/workspace/file?filePath=${encodeURIComponent(report.relativePath)}`;
    api<string>(url)
      .then((text) => setMd(typeof text === "string" ? text : String(text)))
      .catch((e) => setErr(e?.message ?? "Failed to load report"));
  }, [open, report, sessionId]);

  if (!report) return null;
  const isMd = report.relativePath.endsWith(".md");
  const browserUrl = `/session/${sessionId}/report?filePath=${encodeURIComponent(report.relativePath)}`;

  return (
    <Modal open={open} onClose={onClose} title={report.name} width="max-w-3xl">
      {isMd && (
        <div className="flex justify-end mb-2">
          <a
            href={browserUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
          >
            Open in browser ↗
          </a>
        </div>
      )}
      {err && <div className="text-sm text-red-600 dark:text-red-400">{err}</div>}
      {!err && md === null && (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      )}
      {!err && md !== null && <Markdown>{md}</Markdown>}
    </Modal>
  );
}
