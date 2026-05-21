import { useState } from "react";
import type {
  AttachmentNode,
  InternalFolderNode,
  InternalRoots,
  VirtualTree,
} from "../../api/types";
import { cn } from "../../utils/cn";
import { ZipNode } from "./ZipNode";

interface TreeProps {
  tree: VirtualTree;
  sessionId: string;
  selected: Set<string>;
  onToggle: (filePath: string, selected: boolean) => void;
}

export function FileRow({
  name,
  filePath,
  selected,
  onToggle,
  hint,
  disabled,
}: {
  name: string;
  filePath?: string;
  selected: Set<string>;
  onToggle: (filePath: string, selected: boolean) => void;
  hint?: string;
  disabled?: boolean;
}) {
  const checkable = !!filePath && !disabled;
  const isOn = !!filePath && selected.has(filePath);
  return (
    <label
      className={cn(
        "flex items-center gap-2 px-2 py-1 rounded-md text-sm",
        checkable
          ? "cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-800"
          : "opacity-60"
      )}
    >
      <input
        type="checkbox"
        className="accent-blue-600 shrink-0"
        checked={isOn}
        disabled={!checkable}
        onChange={(e) => filePath && onToggle(filePath, e.target.checked)}
      />
      <span className="truncate text-gray-700 dark:text-slate-200">{name}</span>
      {hint && (
        <span className="text-[11px] text-gray-400 dark:text-slate-500 truncate">
          {hint}
        </span>
      )}
    </label>
  );
}

function AttachmentRow({
  node,
  sessionId,
  selected,
  onToggle,
}: {
  node: AttachmentNode;
  sessionId: string;
  selected: Set<string>;
  onToggle: (filePath: string, selected: boolean) => void;
}) {
  if (node.isZip) {
    return (
      <ZipNode
        sessionId={sessionId}
        name={node.name}
        zipPath={node.filePath}
        downloaded={node.downloaded}
        selected={selected}
        onToggle={onToggle}
      />
    );
  }
  return (
    <FileRow
      name={node.name}
      filePath={node.filePath}
      selected={selected}
      onToggle={onToggle}
      hint={node.downloaded ? undefined : "not downloaded"}
    />
  );
}

function Section({
  title,
  count,
  children,
  defaultOpen = true,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mb-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 w-full px-1 py-1 text-xs font-semibold
          uppercase tracking-wide text-gray-500 dark:text-slate-400"
      >
        <span className={cn("transition-transform text-[10px]", open && "rotate-90")}>▶</span>
        {title}
        {count != null && <span className="text-gray-400 dark:text-slate-500">({count})</span>}
      </button>
      {open && <div className="pl-1">{children}</div>}
    </div>
  );
}

function InternalFolder({
  folder,
  selected,
  onToggle,
}: {
  folder: InternalFolderNode;
  selected: Set<string>;
  onToggle: (filePath: string, selected: boolean) => void;
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
            <InternalFolder key={f.relativePath} folder={f} selected={selected} onToggle={onToggle} />
          ))}
          {folder.files.map((f) => (
            <FileRow
              key={f.filePath}
              name={f.name}
              filePath={f.filePath}
              selected={selected}
              onToggle={onToggle}
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
}: {
  roots: InternalRoots;
  count: number;
  selected: Set<string>;
  onToggle: (filePath: string, selected: boolean) => void;
}) {
  if (count === 0) return null;
  return (
    <Section title="Workspace Internals" count={count} defaultOpen={false}>
      {roots.folders.map((f) => (
        <InternalFolder key={f.relativePath} folder={f} selected={selected} onToggle={onToggle} />
      ))}
      {roots.files.map((f) => (
        <FileRow
          key={f.filePath}
          name={f.name}
          filePath={f.filePath}
          selected={selected}
          onToggle={onToggle}
          hint={f.description}
        />
      ))}
    </Section>
  );
}

export function Tree({ tree, sessionId, selected, onToggle }: TreeProps) {
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
        <Section title="Bug Attachments" count={tree.bugAttachments.length}>
          {tree.bugAttachments.map((n) => (
            <AttachmentRow
              key={n.attId}
              node={n}
              sessionId={sessionId}
              selected={selected}
              onToggle={onToggle}
            />
          ))}
        </Section>
      )}
      {tree.comments.map((c) => (
        <Section key={c.commentId} title={`Comment · ${c.author}`} count={c.nodes.length}>
          {c.nodes.map((n) => (
            <AttachmentRow
              key={n.attId}
              node={n}
              sessionId={sessionId}
              selected={selected}
              onToggle={onToggle}
            />
          ))}
        </Section>
      ))}
      <InternalSection
        roots={tree.internalRoots}
        count={tree.internalFileCount}
        selected={selected}
        onToggle={onToggle}
      />
    </div>
  );
}
