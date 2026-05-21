import { create } from "zustand";

// Preserves the same localStorage key used by the legacy static/index.html UI
// so existing users keep their session list across the migration.
const SEEN_KEY = "warroom_seen_sessions";

function read(): string[] {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function write(ids: string[]) {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify(ids)); } catch {}
}

interface SeenState {
  ids: string[];
  add: (id: string) => void;
  remove: (id: string) => void;
}

export const useSeenSessions = create<SeenState>((set, get) => ({
  ids: read(),
  add: (id) => {
    if (get().ids.includes(id)) return;
    const next = [id, ...get().ids];
    write(next);
    set({ ids: next });
  },
  remove: (id) => {
    const next = get().ids.filter((x) => x !== id);
    write(next);
    set({ ids: next });
  },
}));
