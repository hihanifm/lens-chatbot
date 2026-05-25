import { useState } from "react";
import type {
  AttachmentNode,
  InternalFolderNode,
  InternalRoots,
  VirtualTree,
} from "../../api/types";
import { cn } from "../../utils/cn";
import { ZipNode } from "./ZipNode";
import { useQueryClient } from "@tanstack/react-query";
import { DownloadButton, DownloadAllButton } from "./DownloadButton";
import { useDownload, type DownloadItem } from "../../state/download";

interface TreeProps {
  tree: VirtualTree;
  sessionId: string;
  selected: Set<string>;
  onToggle: (filePath: string, selected: boolean) => void;
  onOpen?: (filePath: string) => void;
}

type ToggleFn = (filePath: string, selected: boolean) => void;
type OpenFn = (filePath: string) => void;

function pendingItems(nodes: AttachmentNode[]): DownloadItem[] {
  return nodes
    .filter((n) => !n.downloaded)
    .map((n) => ({ attId: n.attId, attName: n.name }));
}

export function FileRow({
  name,
  filePath,
  selected,
  onToggle,
  onOpen,
  hint,
}: {
  name: string;
  filePath: string;
  selected: Set<string>;
  onToggle: ToggleFn;
  onOpen?: OpenFn;
  hint?: string;
}) {
  const isOn = selected.has(filePath);
  return (
    <label
      className="flex items-center gap-2 px-2 py-1 rounded-md text-sm cursor-pointer
        hover:bg-gray-100 dark:hover:bg-slate-800"
    >
      <input
        type="checkbox"
        className="accent-blue-600 shrink-0"
        checked={isOn}
        onChange={(e) => onToggle(filePath, e.target.checked)}
      />
      <button
        type="button"
        onClick={(e) => e.preventDefault()}
        onDoubleClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onOpen?.(filePath);
        }}
        className="truncate text-left text-gray-700 dark:text-slate-200 hover:underline"
        title="Double-click to open"
      >
        {name}
      </button>
      {hint && (
        <span className="text-[11px] text-gray-400 dark:text-slate-500 truncate">{hint}</span>
      )}
    </label>
  );
}

function AttachmentRow({
  node,
  sessionId,
  selected,
  onToggle,
  onOpen,
}: {
  node: AttachmentNode;
  sessionId: string;
  selected: Set<string>;
  onToggle: ToggleFn;
  onOpen?: OpenFn;
}) {
  if (node.isZip) {
    return (
      <ZipNode
        sessionId={sessionId}
        attId={node.attId}
        name={node.name}
        zipPath={node.filePath}
        downloaded={node.downloaded}
        selected={selected}
        onToggle={onToggle}
        onOpen={onOpen}
      />
    );
  }
  // Not yet downloaded — offer a Download action instead of a dead checkbox.
  if (!node.downloaded || !node.filePath) {
    return (
      <div className="flex items-center gap-2 px-2 py-1 text-sm">
        <DownloadButton sessionId={sessionId} attId={node.attId} attName={node.name} />
        <span className="truncate text-gray-500 dark:text-slate-400">{node.name}</span>
      </div>
    );
  }
  return (
    <FileRow
      name={node.name}
      filePath={node.filePath}
      selected={selected}
      onToggle={onToggle}
      onOpen={onOpen}
    />
  );
}

function Section({
  title,
  count,
  action,
  children,
  defaultOpen = true,
}: {
  title: string;
  count?: number;
  action?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mb-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1.5 flex-1 px-1 py-1 text-xs font-semibold
            uppercase tracking-wide text-gray-500 dark:text-slate-400"
        >
          <span className={cn("transition-transform text-[10px]", open && "rotate-90")}>▶</span>
          {title}
          {count != null && <span className="text-gray-400 dark:text-slate-500">({count})</span>}
        </button>
        {action}
      </div>
      {open && <div className="pl-1">{children}</div>}
    </div>
  );
}

// A section of bug/comment attachments with its own "Download all" control.
function AttachmentSection({
  title,
  nodes,
  sessionId,
  selected,
  onToggle,
  onOpen,
}: {
  title: string;
  nodes: AttachmentNode[];
  sessionId: string;
  selected: Set<string>;
  onToggle: ToggleFn;
  onOpen?: OpenFn;
}) {
  const qc = useQueryClient();
  const start = useDownload((s) => s.start);
  const busy = useDownload((s) => s.active?.phase === "downloading");
  const pending = pendingItems(nodes);
  return (
    <Section
      title={title}
      count={nodes.length}
      action={
        <DownloadAllButton
          pendingCount={pending.length}
          busy={busy}
          onClick={async () => {
            await start({ sessionId, items: pending });
            qc.invalidateQueries({ queryKey: ["workspace-files", sessionId] });
            qc.invalidateQueries({ queryKey: ["session", sessionId] });
          }}
        />
      }
    >
      {nodes.map((n) => (
        <AttachmentRow
          key={n.attId}
          node={n}
          sessionId={sessionId}
          selected={selected}
          onToggle={onToggle}
          onOpen={onOpen}
        />
      ))}
    </Section>
  );
}

function InternalFolder({
  folder,
  selected,
  onToggle,
  onOpen,
}: {
  folder: InternalFolderNode;
  selected: Set<string>;
  onToggle: ToggleFn;
  onOpen?: OpenFn;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-2 py-1 text-sm text-gray-600 dark:text-slate-300"
      >
        <span className={cn("transition-transform text-[10px]", open && "rotate-90")}>▶</span>
        📁 {folder.name}
      </button>
      {open && (
        <div className="pl-4">
          {folder.folders.map((f) => (
            <InternalFolder
              key={f.relativePath}
              folder={f}
              selected={selected}
              onToggle={onToggle}
              onOpen={onOpen}
            />
          ))}
          {folder.files.map((f) => (
            <FileRow
              key={f.filePath}
              name={f.name}
              filePath={f.filePath}
              selected={selected}
              onToggle={onToggle}
              onOpen={onOpen}
              hint={f.description}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function InternalSection({
  roots,
  count,
  selected,
  onToggle,
  onOpen,
}: {
  roots: InternalRoots;
  count: number;
  selected: Set<string>;
  onToggle: ToggleFn;
  onOpen?: OpenFn;
}) {
  if (count === 0) return null;
  return (
    <Section title="Workspace Internals" count={count} defaultOpen={false}>
      {roots.folders.map((f) => (
        <InternalFolder
          key={f.relativePath}
          folder={f}
          selected={selected}
          onToggle={onToggle}
          onOpen={onOpen}
        />
      ))}
      {roots.files.map((f) => (
        <FileRow
          key={f.filePath}
          name={f.name}
          filePath={f.filePath}
          selected={selected}
          onToggle={onToggle}
          onOpen={onOpen}
          hint={f.description}
        />
      ))}
    </Section>
  );
}

export function Tree({ tree, sessionId, selected, onToggle, onOpen }: TreeProps) {
  const hasAny =
    tree.bugAttachments.length > 0 ||
    tree.comments.length > 0 ||
    tree.internalFileCount > 0;

  if (!hasAny) {
    return (
      <p className="text-sm text-gray-400 dark:text-slate-500 px-2 py-4">
        No files in this workspace yet — upload logs below.
      </p>
    );
  }

  return (
    <div>
      {tree.bugAttachments.length > 0 && (
        <AttachmentSection
          title="Bug Attachments"
          nodes={tree.bugAttachments}
          sessionId={sessionId}
          selected={selected}
          onToggle={onToggle}
          onOpen={onOpen}
        />
      )}
      {tree.comments.map((c) => (
        <AttachmentSection
          key={c.commentId}
          title={`Comment · ${c.author}`}
          nodes={c.nodes}
          sessionId={sessionId}
          selected={selected}
          onToggle={onToggle}
          onOpen={onOpen}
        />
      ))}
      <InternalSection
        roots={tree.internalRoots}
        count={tree.internalFileCount}
        selected={selected}
        onToggle={onToggle}
        onOpen={onOpen}
      />
    </div>
  );
}
