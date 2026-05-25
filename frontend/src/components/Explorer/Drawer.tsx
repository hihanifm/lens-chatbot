import { useCallback, useEffect, useRef, useState } from "react";
import { Tree } from "./Tree";
import { UploadPanel } from "./UploadPanel";
import { Spinner } from "../ui/Spinner";
import { useWorkspaceFiles, useToggleFile } from "../../api/queries";

const WIDTH_KEY = "lens-chatbot:drawer-width";
const MIN = 260;

function readWidth(): number {
  const n = Number(localStorage.getItem(WIDTH_KEY));
  return Number.isFinite(n) && n >= MIN ? n : 320;
}

export function ExplorerDrawer({
  open,
  sessionId,
  bugId,
  selectedFiles,
  onClose,
}: {
  open: boolean;
  sessionId: string;
  bugId: string;
  selectedFiles: string[];
  onClose: () => void;
}) {
  const [width, setWidth] = useState(readWidth);
  const dragging = useRef(false);
  const { data: tree, isLoading } = useWorkspaceFiles(sessionId, open);
  const toggle = useToggleFile(sessionId);
  const selected = new Set(selectedFiles);

  const onToggle = useCallback(
    (filePath: string, isSelected: boolean) => {
      toggle.mutate({ filePath, selected: isSelected });
    },
    [toggle]
  );

  const onOpen = useCallback((filePath: string) => {
    const url = `/session/${sessionId}/workspace/download?filePath=${encodeURIComponent(filePath)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }, [sessionId]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      // Drawer is anchored to the right edge.
      const next = Math.min(window.innerWidth, Math.max(MIN, window.innerWidth - e.clientX));
      setWidth(next);
    };
    const onUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      localStorage.setItem(WIDTH_KEY, String(width));
      document.body.style.cursor = "";
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [width]);

  if (!open) return null;

  return (
    <aside
      id="explorer-drawer"
      style={{ width }}
      className="relative shrink-0 border-l border-gray-200 dark:border-slate-800
        bg-white dark:bg-slate-900 flex flex-col min-h-0"
    >
      <div
        onMouseDown={() => {
          dragging.current = true;
          document.body.style.cursor = "col-resize";
        }}
        className="absolute left-0 top-0 h-full w-1.5 -ml-0.5 cursor-col-resize
          hover:bg-blue-400/40"
      />
      <div className="flex items-center justify-between px-3 py-2.5 border-b
        border-gray-100 dark:border-slate-800">
        <span className="text-sm font-semibold text-gray-700 dark:text-slate-200">
          🗂 Files
        </span>
        <button
          type="button"
          onClick={onClose}
          className="text-xs px-2 py-1 rounded-md text-gray-500 hover:bg-gray-100
            dark:text-slate-400 dark:hover:bg-slate-800"
        >
          Close
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2 min-h-0">
        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-gray-400 px-2 py-4">
            <Spinner /> Loading files…
          </div>
        )}
        {tree && (
          <Tree
            tree={tree}
            sessionId={sessionId}
            selected={selected}
            onToggle={onToggle}
            onOpen={onOpen}
          />
        )}
      </div>
      <UploadPanel sessionId={sessionId} bugId={bugId} />
    </aside>
  );
}
