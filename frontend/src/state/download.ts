import { create } from "zustand";
import { useTransferQueue } from "./transferQueue";
import { useUpload } from "./upload";

export interface DownloadProgress {
  sessionId: string;
  label: string;
  index: number;
  count: number;
  loaded: number;
  total: number;
  phase: "downloading" | "done" | "error";
  message?: string;
}

export interface DownloadItem {
  attId: string;
  attName: string;
}

interface DownloadState {
  active: DownloadProgress | null;
  /** Sequentially downloads a batch; resolves once every item settles. */
  start: (args: { sessionId: string; items: DownloadItem[] }) => Promise<void>;
  clear: () => void;
}

// Streams one attachment download over SSE, resolving when the server ends it.
function downloadOne(
  sessionId: string,
  item: DownloadItem,
  onProgress: (loaded: number, total: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const url = `/session/${sessionId}/attachment/${item.attId}/stream?attName=${encodeURIComponent(item.attName)}`;
    const es = new EventSource(url);
    es.onmessage = (e) => {
      let msg: { type: string; loaded?: number; total?: number; content?: string };
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      if (msg.type === "progress") {
        onProgress(msg.loaded ?? 0, msg.total ?? 0);
      } else if (msg.type === "done") {
        es.close();
        resolve();
      } else if (msg.type === "error") {
        es.close();
        reject(new Error(msg.content ?? "Download failed"));
      }
    };
    es.onerror = () => {
      es.close();
      reject(new Error("Network error during download"));
    };
  });
}

export const useDownload = create<DownloadState>((set) => ({
  active: null,
  clear: () => set({ active: null }),
  start: ({ sessionId, items }) => {
    if (items.length === 0) return Promise.resolve();
    // Serialized behind the shared transfer queue; the whole batch runs as
    // one queued task so it never overlaps an upload or another download.
    return useTransferQueue.getState().enqueue(async () => {
      // Reuse the single status bar — drop any finished upload banner.
      useUpload.getState().clear();
      let failed = 0;
      for (let i = 0; i < items.length; i++) {
      set({
        active: {
          sessionId,
          label: items[i].attName,
          index: i + 1,
          count: items.length,
          loaded: 0,
          total: 0,
          phase: "downloading",
        },
      });
      try {
        await downloadOne(sessionId, items[i], (loaded, total) =>
          set((s) => (s.active ? { active: { ...s.active, loaded, total } } : s))
        );
      } catch {
        failed++;
      }
    }
    set((s) =>
      s.active
        ? {
            active: {
              ...s.active,
              phase: failed === items.length ? "error" : "done",
              message:
                failed > 0 ? `${failed} of ${items.length} download(s) failed` : undefined,
            },
          }
        : s
    );
    });
  },
}));
