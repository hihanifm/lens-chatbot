import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiJson } from "../api/client";

export interface DownloadItem {
  attId: string;
  attName: string;
}

interface Progress {
  done: number;
  total: number;
}

/**
 * Sequentially downloads a batch of bug/comment attachments (legacy
 * downloadAttachmentsBatch behaviour). Returns a `downloadMany` trigger plus
 * live progress so a "Download all" button can show `Downloading n/N…`.
 */
export function useDownloadAttachments(sessionId: string | undefined) {
  const qc = useQueryClient();
  const [progress, setProgress] = useState<Progress | null>(null);

  const downloadMany = useCallback(
    async (items: DownloadItem[]) => {
      if (!sessionId || items.length === 0) return;
      setProgress({ done: 0, total: items.length });
      try {
        for (let i = 0; i < items.length; i++) {
          try {
            await apiJson(
              `/session/${sessionId}/attachment/${items[i].attId}`,
              { attName: items[i].attName }
            );
          } catch {
            /* skip a failed item; the tree refresh still reflects the rest */
          }
          setProgress({ done: i + 1, total: items.length });
        }
      } finally {
        setProgress(null);
        qc.invalidateQueries({ queryKey: ["workspace-files", sessionId] });
        qc.invalidateQueries({ queryKey: ["session", sessionId] });
      }
    },
    [sessionId, qc]
  );

  return { downloadMany, progress };
}
