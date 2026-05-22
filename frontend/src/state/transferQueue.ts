import { create } from "zustand";

interface TransferQueueState {
  /** Tasks waiting to start (does not count the one currently running). */
  queued: number;
  running: boolean;
  /** Runs `task` after all previously enqueued transfers settle. */
  enqueue: <T>(task: () => Promise<T>) => Promise<T>;
}

// Single FIFO chain shared by uploads and downloads — transfers run fully
// serial so we never put concurrent load on the server.
let tail: Promise<unknown> = Promise.resolve();

export const useTransferQueue = create<TransferQueueState>((set) => ({
  queued: 0,
  running: false,
  enqueue: <T>(task: () => Promise<T>): Promise<T> => {
    set((s) => ({ queued: s.queued + 1 }));
    const run = tail.then(async () => {
      set((s) => ({ queued: s.queued - 1, running: true }));
      try {
        return await task();
      } finally {
        set({ running: false });
      }
    });
    // Keep the chain alive even if a transfer rejects.
    tail = run.catch(() => {});
    return run as Promise<T>;
  },
}));
