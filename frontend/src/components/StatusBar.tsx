import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { useLlmSettings, useSkillsSettings, useVersion } from "../api/queries";
import { useAuth } from "../state/auth";

/** Single source of truth for the bar height — imported by App.tsx for padding. */
export const STATUS_BAR_HEIGHT = 26; // px

function formatUptime(startedAt: string, nowMs: number): string {
  const startedMs = Date.parse(startedAt);
  if (Number.isNaN(startedMs)) return "unknown";
  const totalSeconds = Math.max(0, Math.floor((nowMs - startedMs) / 1000));
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatStartedAt(iso: string): string {
  const value = Date.parse(iso);
  if (Number.isNaN(value)) return iso;
  return new Date(value).toLocaleString();
}

export function StatusBar() {
  const location = useLocation();
  const onLogin = location.pathname === "/login";
  const { data: version } = useVersion();
  const { data: llm } = useLlmSettings();
  const { data: skills } = useSkillsSettings();
  const userName = useAuth((s) => s.userName) ?? "unknown";
  const [expanded, setExpanded] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const uptime = useMemo(
    () => (version?.startedAt ? formatUptime(version.startedAt, nowMs) : "unknown"),
    [version?.startedAt, nowMs],
  );

  if (onLogin) return null;

  const env = version?.env ?? "unknown";
  const envClass =
    env === "production"
      ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
      : env === "development"
        ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
        : "bg-gray-100 text-gray-700 dark:bg-slate-700 dark:text-slate-200";

  const sha = (version?.gitSha || version?.build || "dev").slice(0, 7);
  const model = llm?.model ?? "unknown";
  const engine = llm?.engine ?? "unknown";
  const repoUrl = version?.repoUrl ?? "";
  const baseUrl = llm?.baseUrl ?? "—";
  const skillDirCount = skills?.configured?.length ?? 0;

  return (
    <>
      {expanded && (
        <div
          className="fixed inset-x-0 z-40 border-t border-gray-300 dark:border-slate-700
            bg-gray-50 dark:bg-slate-900/95 px-4 py-3 text-[11px] sm:text-xs font-mono text-gray-700 dark:text-slate-200"
          style={{ bottom: STATUS_BAR_HEIGHT }}
        >
          <div className="w-full max-w-6xl mx-auto grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
            <div>version: {version?.appVersion ?? "unknown"}</div>
            <div>gitSha: {version?.gitSha ?? version?.build ?? "dev"}</div>
            <div>env: {env}</div>
            <div>model: {model}</div>
            <div>engine: {engine}</div>
            <div>uptime: {uptime}</div>
            <div>nodeVersion: {version?.nodeVersion ?? "unknown"}</div>
            <div>startedAt: {version?.startedAt ? formatStartedAt(version.startedAt) : "unknown"}</div>
            <div>baseUrl: {baseUrl}</div>
            <div>userName: {userName}</div>
            <div>skillDirsConfigured: {skillDirCount}</div>
          </div>
        </div>
      )}
      <div
        className="fixed bottom-0 inset-x-0 z-40 border-t border-gray-300 dark:border-slate-700
          bg-gray-100 dark:bg-slate-900 text-[11px] font-mono text-gray-700 dark:text-slate-200"
        style={{ height: STATUS_BAR_HEIGHT }}
      >
        <div className="w-full max-w-6xl mx-auto h-full px-3 flex items-center justify-between gap-3">
          <div className="min-w-0 truncate">
            v{version?.appVersion ?? "unknown"} · {sha} ·{" "}
            <span className={`inline-flex items-center rounded px-1 ${envClass}`}>{env}</span> · {model} · {engine} · up {uptime}
          </div>
          <div className="shrink-0 flex items-center gap-3">
            {repoUrl ? (
              <a href={repoUrl} target="_blank" rel="noreferrer" className="hover:underline">
                GitHub
              </a>
            ) : (
              <span className="opacity-60">GitHub</span>
            )}
            <a href="/docs" target="_blank" rel="noreferrer" className="hover:underline">
              Docs
            </a>
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="hover:underline"
              aria-label={expanded ? "Collapse status bar details" : "Expand status bar details"}
              aria-expanded={expanded}
            >
              {expanded ? "▼" : "▲"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
