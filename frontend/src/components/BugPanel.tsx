import { useState } from "react";
import type { Bug } from "../api/types";
import { StatusBadge } from "./ui/StatusBadge";

export function BugPanel({
  bug,
  bugId,
  explorerOpen,
  onToggleExplorer,
  actions,
}: {
  bug: Bug | null;
  bugId: string;
  explorerOpen: boolean;
  onToggleExplorer: () => void;
  actions?: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const title = bug?.title ?? bugId;
  const description = bug?.description?.trim();

  return (
    <div className="border-b border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-6 py-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-gray-400 dark:text-slate-500">{bugId}</span>
            {bug?.status && <StatusBadge status={bug.status} />}
          </div>
          <h1 className="font-semibold text-gray-900 dark:text-slate-100 mt-0.5 truncate">
            {title}
          </h1>
        </div>
        <div className="shrink-0 flex items-center gap-2">
          {description && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline mr-1"
            >
              {expanded ? "Hide details" : "Show details"}
            </button>
          )}
          {actions}
          <button
            type="button"
            onClick={onToggleExplorer}
            className={
              "text-xs px-2.5 py-1 rounded-lg border transition-colors " +
              (explorerOpen
                ? "bg-blue-600 text-white border-blue-600"
                : "border-gray-300 text-gray-600 hover:bg-gray-50 " +
                  "dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800")
            }
          >
            🗂 Files
          </button>
        </div>
      </div>
      {expanded && description && (
        <p className="mt-3 text-sm text-gray-600 dark:text-slate-300 whitespace-pre-wrap
          max-h-48 overflow-y-auto">
          {description}
        </p>
      )}
    </div>
  );
}
