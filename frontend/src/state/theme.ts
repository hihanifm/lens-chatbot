import { useEffect } from "react";
import { create } from "zustand";

export type ThemeMode = "light" | "dark" | "system";

const STORAGE_KEY = "lens-chatbot:theme";

function readStored(): ThemeMode {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "light" || raw === "dark" || raw === "system") return raw;
  } catch {}
  return "light"; // default = light, regardless of OS preference
}

function systemPrefersDark(): boolean {
  return typeof window !== "undefined"
    && window.matchMedia?.("(prefers-color-scheme: dark)").matches === true;
}

function resolve(mode: ThemeMode): "light" | "dark" {
  if (mode === "system") return systemPrefersDark() ? "dark" : "light";
  return mode;
}

function applyToDom(resolved: "light" | "dark") {
  const root = document.documentElement;
  if (resolved === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
}

interface ThemeState {
  mode: ThemeMode;
  resolved: "light" | "dark";
  setMode: (mode: ThemeMode) => void;
  cycle: () => void;
  /** Recompute resolved from current mode (used when system preference flips). */
  syncSystem: () => void;
}

export const useTheme = create<ThemeState>((set, get) => {
  const initial = readStored();
  return {
    mode: initial,
    resolved: resolve(initial),
    setMode: (mode) => {
      try { localStorage.setItem(STORAGE_KEY, mode); } catch {}
      const resolved = resolve(mode);
      applyToDom(resolved);
      set({ mode, resolved });
    },
    cycle: () => {
      const order: ThemeMode[] = ["light", "dark", "system"];
      const next = order[(order.indexOf(get().mode) + 1) % order.length];
      get().setMode(next);
    },
    syncSystem: () => {
      const resolved = resolve(get().mode);
      applyToDom(resolved);
      set({ resolved });
    },
  };
});

/** Wire React to the theme store: apply on mount, watch system changes. */
export function useThemeBootstrap() {
  const mode = useTheme((s) => s.mode);
  const syncSystem = useTheme((s) => s.syncSystem);

  useEffect(() => {
    // The inline script in index.html already applied light/dark before
    // React mounted, but make sure the DOM reflects the store on hydration.
    applyToDom(resolve(mode));
  }, [mode]);

  useEffect(() => {
    if (mode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => syncSystem();
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, [mode, syncSystem]);
}
