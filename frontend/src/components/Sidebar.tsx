import { Link, useParams } from "react-router-dom";
import { cn } from "../utils/cn";
import { useSessions } from "../api/queries";
import { useSeenSessions } from "../state/sessions";

export function Sidebar({
  collapsed = false,
  onToggle,
}: {
  collapsed?: boolean;
  onToggle?: () => void;
}) {
  const { id: activeId } = useParams<{ id: string }>();
  const ids = useSeenSessions((s) => s.ids);
  const { data: sessions = [] } = useSessions(ids);

  if (collapsed) {
    return (
      <aside
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onToggle?.()}
        title="Show sessions"
        className="w-9 shrink-0 border-r border-gray-200 dark:border-slate-800
          bg-white dark:bg-slate-900 flex flex-col items-center py-3
          cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-800/60 transition-colors"
      >
        <span className="text-sm px-1.5 py-1 text-gray-500 dark:text-slate-400">
          ☰
        </span>
      </aside>
    );
  }

  return (
    <aside className="w-60 shrink-0 border-r border-gray-200 dark:border-slate-800
      bg-white dark:bg-slate-900 flex flex-col">
      <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
          Sessions
        </span>
        <div className="flex items-center gap-1">
          <Link
            to="/"
            className="text-xs px-2 py-1 rounded-md text-blue-600 hover:bg-blue-50
              dark:text-blue-400 dark:hover:bg-slate-800 transition-colors"
          >
            + New
          </Link>
          <button
            type="button"
            onClick={onToggle}
            title="Collapse sidebar"
            className="text-xs px-1.5 py-1 rounded-md text-gray-500 hover:bg-gray-100
              dark:text-slate-400 dark:hover:bg-slate-800 transition-colors"
          >
            «
          </button>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {sessions.length === 0 && (
          <p className="text-xs text-gray-400 dark:text-slate-500 px-2 py-3">
            No sessions yet.
          </p>
        )}
        {sessions.map((s) => (
          <Link
            key={s.id}
            to={`/session/${s.id}`}
            className={cn(
              "block px-2.5 py-2 rounded-lg text-sm truncate transition-colors",
              s.id === activeId
                ? "bg-blue-100 text-blue-800 font-medium dark:bg-blue-900/50 dark:text-blue-200"
                : "text-gray-600 hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-slate-800"
            )}
            title={s.bug_id}
          >
            {s.bug_id}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
