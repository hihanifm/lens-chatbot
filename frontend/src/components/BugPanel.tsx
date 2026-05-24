import type { Bug } from "../api/types";
import { StatusBadge } from "./ui/StatusBadge";
import { fmtDate } from "../utils/time";

function MetaGrid({ bug }: { bug: Bug }) {
  const rows: Array<[string, string | undefined]> = [
    ["Author", bug.author],
    ["Owner", bug.owner],
    ["Module", bug.module],
    ["State", bug.state],
    ["Created", bug.created_at ? fmtDate(bug.created_at) : undefined],
    ["Updated", bug.updated_at ? fmtDate(bug.updated_at) : undefined],
  ];
  const present = rows.filter(([, v]) => v);
  if (present.length === 0) return null;
  return (
    <dl className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1.5">
      {present.map(([label, value]) => (
        <div key={label} className="flex flex-col">
          <dt className="text-[11px] uppercase tracking-wide text-gray-400 dark:text-slate-500">
            {label}
          </dt>
          <dd className="text-sm text-gray-700 dark:text-slate-200">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function MetaLine({ bug }: { bug: Bug }) {
  const items: Array<[string, string | undefined]> = [
    ["Owner", bug.owner],
    ["Module", bug.module],
    ["State", bug.state],
    ["Updated", bug.updated_at ? fmtDate(bug.updated_at) : undefined],
  ];
  const present = items.filter(([, v]) => v);
  if (present.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1">
      {present.map(([label, value]) => (
        <span key={label} className="text-xs text-gray-500 dark:text-slate-400">
          <span className="uppercase tracking-wide text-gray-400 dark:text-slate-500">
            {label}
          </span>{" "}
          <span className="text-gray-700 dark:text-slate-200">{value}</span>
        </span>
      ))}
    </div>
  );
}

function CommentThread({ bug }: { bug: Bug }) {
  const comments = bug.comments ?? [];
  if (comments.length === 0) return null;
  return (
    <div className="mt-4">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400 mb-2">
        Comments ({comments.length})
      </h2>
      <div className="flex flex-col gap-2">
        {comments.map((c) => (
          <div
            key={c.id}
            className="rounded-lg border border-gray-200 dark:border-slate-800
              bg-gray-50 dark:bg-slate-800/50 px-3 py-2 border-l-2 border-l-blue-300
              dark:border-l-blue-500/60"
          >
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-800 dark:text-slate-100">
                {c.author}
              </span>
              <span className="text-[11px] text-gray-400 dark:text-slate-500">
                {fmtDate(c.created_at)}
              </span>
            </div>
            <p className="text-sm text-gray-600 dark:text-slate-300 mt-1 whitespace-pre-wrap">
              {c.body}
            </p>
            {c.attachments && c.attachments.length > 0 && (
              <p className="text-[11px] text-gray-400 dark:text-slate-500 mt-1.5">
                📎 {c.attachments.length} attachment
                {c.attachments.length === 1 ? "" : "s"} — open the Files drawer to download
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function BugPanel({
  bug,
  bugId,
  explorerOpen,
  onToggleExplorer,
  detailsOpen,
  onToggleDetails,
  actions,
}: {
  bug: Bug | null;
  bugId: string;
  explorerOpen: boolean;
  onToggleExplorer: () => void;
  detailsOpen: boolean;
  onToggleDetails: () => void;
  actions?: React.ReactNode;
}) {
  const expanded = detailsOpen;
  const title = bug?.title ?? bugId;
  const description = bug?.description?.trim();
  // The expansion has content whenever there's a description, meta, or comments.
  const hasDetails =
    !!description ||
    !!bug?.author ||
    !!bug?.owner ||
    !!bug?.module ||
    (bug?.comments?.length ?? 0) > 0;
  const detailsLabel = expanded
    ? "Hide details"
    : bug?.comments?.length
      ? `Show details · ${bug.comments.length} comment${bug.comments.length === 1 ? "" : "s"}`
      : "Show details";

  return (
    <div className="border-b border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-6 py-4">
      <div
        className={
          "flex items-start justify-between gap-4 " +
          (hasDetails ? "cursor-pointer select-none" : "")
        }
        onClick={hasDetails ? onToggleDetails : undefined}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-gray-400 dark:text-slate-500">{bugId}</span>
            {bug?.status && <StatusBadge status={bug.status} />}
          </div>
          <h1 className="font-semibold text-gray-900 dark:text-slate-100 mt-0.5 truncate">
            {title}
          </h1>
          {bug && <MetaLine bug={bug} />}
        </div>
        <div
          className="shrink-0 flex items-center gap-2"
          onClick={(e) => e.stopPropagation()}
        >
          {hasDetails && (
            <span className="text-xs text-blue-600 dark:text-blue-400 mr-1">{detailsLabel}</span>
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
      {expanded && bug && (
        <div className="max-h-72 overflow-y-auto">
          {description && (
            <p className="mt-3 text-sm text-gray-600 dark:text-slate-300 whitespace-pre-wrap">
              {description}
            </p>
          )}
          <MetaGrid bug={bug} />
          <CommentThread bug={bug} />
        </div>
      )}
    </div>
  );
}
