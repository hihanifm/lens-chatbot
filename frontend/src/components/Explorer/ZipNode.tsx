import { useState } from "react";
import { cn } from "../../utils/cn";
import { useZipContents, useExtractFile } from "../../api/queries";
import { Spinner } from "../ui/Spinner";
import { DownloadButton } from "./DownloadButton";

interface ZipNodeProps {
  sessionId: string;
  attId: string;
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
  attId,
  name,
  zipPath,
  downloaded,
  selected,
  onToggle,
}: ZipNodeProps) {
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useZipContents(sessionId, open ? zipPath ?? null : null);
  const extract = useExtractFile(sessionId);

  // A zip that isn't downloaded yet can't be listed — offer a Download action.
  if (!downloaded || !zipPath) {
    return (
      <div className="flex items-center gap-2 px-2 py-1 text-sm">
        <DownloadButton sessionId={sessionId} attId={attId} attName={name} />
        <span className="truncate text-gray-500 dark:text-slate-400">🗜 {name}</span>
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-2 py-1 text-sm w-full text-left
          text-gray-700 dark:text-slate-200"
      >
        <span className={cn("transition-transform text-[10px]", open && "rotate-90")}>▶</span>
        🗜 {name}
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
