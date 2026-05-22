import { create } from "zustand";

export interface WikiEntryRef {
  moduleSlug: string;
  filename: string;
  title: string;
}

export interface WikiSynthesis {
  sessionId: string;
  module: string;
  phase: "running" | "done" | "error";
  entry?: WikiEntryRef;
  message?: string;
}

interface WikiState {
  active: WikiSynthesis | null;
  /** Kicks off background synthesis over SSE; banner reflects progress. */
  start: (args: { sessionId: string; module: string; title?: string }) => void;
  clear: () => void;
}

// The EventSource is owned here (not by the modal) so synthesis survives the
// modal closing and session navigation. Held module-level so clear() can close it.
let es: EventSource | null = null;

export const useWiki = create<WikiState>((set, get) => ({
  active: null,
  clear: () => {
    es?.close();
    es = null;
    set({ active: null });
  },
  start: ({ sessionId, module, title }) => {
    if (get().active?.phase === "running") {
      throw new Error("A wiki synthesis is already in progress");
    }
    es?.close();

    set({ active: { sessionId, module, phase: "running" } });

    const params = new URLSearchParams({ module });
    if (title) params.set("title", title);
    es = new EventSource(`/session/${sessionId}/wiki/synthesize?${params.toString()}`);

    es.onmessage = (e) => {
      let msg: { type: string; content?: string; entry?: WikiEntryRef };
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      if (msg.type === "done") {
        es?.close();
        es = null;
        set((s) => (s.active ? { active: { ...s.active, phase: "done", entry: msg.entry } } : s));
      } else if (msg.type === "error") {
        es?.close();
        es = null;
        set((s) =>
          s.active ? { active: { ...s.active, phase: "error", message: msg.content } } : s
        );
      }
      // type "status" — synthesis still running; banner already shows it
    };

    es.onerror = () => {
      // EventSource also fires onerror when the server ends the stream normally;
      // only treat it as failure if we never reached a terminal event.
      if (get().active?.phase === "running") {
        es?.close();
        es = null;
        set((s) =>
          s.active
            ? { active: { ...s.active, phase: "error", message: "Connection lost during synthesis" } }
            : s
        );
      }
    };
  },
}));
