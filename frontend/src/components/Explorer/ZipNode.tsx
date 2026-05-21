import { useState } from "react";
import { cn } from "../../utils/cn";
import { useZipContents, useExtractFile } from "../../api/queries";
import { Spinner } from "../ui/Spinner";

interface ZipNodeProps {
  sessionId: string;
  name: string;
  zipPath?: string;
  downloaded: boolean;
  selected: Set<string>;
  onToggle: (filePath: string, selected: boolean) => void;
}

// A zip attachment — contents are listed lazily on expand, individual entries
// extracted on demand, then added to context like any other file.
export function ZipNode({
  sessionId,
  name,
  zipPath,
  downloaded,
  selected,
  onToggle,
}: ZipNodeProps) {
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useZipContents(sessionId, open ? zipPath ?? null : null);
  const extract = useExtractFile(sessionId);

  return (
    <div>
      <button
        type="button"
        disabled={!downloaded || !zipPath}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-1.5 px-2 py-1 text-sm w-full text-left",
          downloaded
            ? "text-gray-700 dark:text-slate-200"
            : "text-gray-400 dark:text-slate-500"
        )}
      >
        <span className={cn("transition-transform text-[10px]", open && "rotate-90")}>▶</span>
        🗜 {name}
        {!downloaded && (
          <span className="text-[11px] text-gray-400">not downloaded</span>
        )}
      </button>
      {open && (
        <div className="pl-5">
          {isLoading && (
            <div className="flex items-center gap-2 text-xs text-gray-400 px-2 py-1">
              <Spinner className="h-3 w-3" /> Reading zip…
            </div>
          )}
          {data?.entries.map((entry) => {
            const isOn = !!entry.filePath && selected.has(entry.filePath);
            return (
              <div
                key={entry.innerPath}
                className="flex items-center gap-2 px-2 py-1 text-sm"
              >
                {entry.extracted && entry.filePath ? (
                  <input
                    type="checkbox"
                    className="accent-blue-600 shrink-0"
                    checked={isOn}
                    onChange={(e) => onToggle(entry.filePath!, e.target.checked)}
                  />
                ) : (
                  <button
                    type="button"
                    disabled={extract.isPending}
                    onClick={() =>
                      zipPath &&
                      extract.mutate({ zipPath, innerPath: entry.innerPath })
                    }
                    className="text-xs px-1.5 py-0.5 rounded border border-gray-300
                      dark:border-slate-700 hover:bg-gray-100 dark:hover:bg-slate-800"
                  >
                    Extract
                  </button>
                )}
                <span className="truncate text-gray-700 dark:text-slate-200">
                  {entry.innerPath}
                </span>
              </div>
            );
          })}
          {data && data.entries.length === 0 && (
            <p className="text-xs text-gray-400 px-2 py-1">Empty zip.</p>
          )}
        </div>
      )}
    </div>
  );
}
