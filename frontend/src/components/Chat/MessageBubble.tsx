import { useMemo, useState } from "react";
import { cn } from "../../utils/cn";
import { fmtTime } from "../../utils/time";
import { extractWorkspacePaths } from "../../utils/extractWorkspacePaths";
import { EngineeringLog } from "./EngineeringLog";
import { ReportModal } from "./ReportModal";
import { Markdown } from "../ui/Markdown";
import type { ChatMessage, ReportRef } from "./types";

export type { ChatMessage } from "./types";

function SkillChip({ name }: { name: string }) {
  return (
    <span className="inline-flex items-center gap-1 self-start text-xs font-medium
      px-2 py-0.5 rounded-full mb-1
      bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-200">
      <span aria-hidden>🧩</span> {name}
    </span>
  );
}

export function MessageBubble({ msg, sessionId }: { msg: ChatMessage; sessionId?: string }) {
  const [openReport, setOpenReport] = useState<ReportRef | null>(null);

  if (msg.role === "englog") {
    return <EngineeringLog lines={msg.logLines ?? []} streaming={msg.streaming} />;
  }

  // Non-conversational rows: status / plain text — muted, monospace.
  if (msg.role === "status" || msg.role === "text") {
    return (
      <div className="text-xs text-gray-400 dark:text-slate-500 px-2 py-0.5 font-mono whitespace-pre-wrap">
        {msg.content}
      </div>
    );
  }
  if (msg.role === "error") {
    return (
      <div className="text-sm rounded-lg px-3 py-2 self-stretch
        bg-red-50 text-red-700 border border-red-200
        dark:bg-red-900/30 dark:text-red-300 dark:border-red-800 whitespace-pre-wrap">
        {msg.content}
      </div>
    );
  }

  const isUser = msg.role === "user";
  // Render the assistant's reply as Markdown once the turn finishes. While
  // streaming, partial Markdown (unclosed code fences/tables) looks broken,
  // so we keep plain pre-wrapped text until `done`.
  const renderMarkdown = !isUser && !msg.streaming && !!msg.content;

  // Merge backend-detected reports with any workspace paths mentioned in reply text.
  // Backend only tracks new .md files; this catches .txt and other formats too.
  const allChips = useMemo<ReportRef[]>(() => {
    if (msg.streaming || isUser) return msg.reports ?? [];
    const existing = new Set((msg.reports ?? []).map((r) => r.relativePath));
    const mentioned = extractWorkspacePaths(msg.content)
      .filter((p) => !existing.has(p))
      .map((p) => ({ relativePath: p, name: p.split("/").at(-1) ?? p, size: 0 }));
    return [...(msg.reports ?? []), ...mentioned];
  }, [msg.streaming, msg.reports, msg.content, isUser]);

  return (
    <div className={cn("flex flex-col", isUser ? "items-end" : "items-start")}>
      {msg.userName && (
        <span className="text-[11px] text-gray-400 dark:text-slate-500 px-1 mb-0.5">
          {msg.userName}
        </span>
      )}
      {isUser && msg.skills && msg.skills.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-1">
          {msg.skills.map((name) => (
            <SkillChip key={name} name={name} />
          ))}
        </div>
      )}
      <div
        data-testid={isUser ? "user-msg" : "assistant-msg"}
        className={cn(
          "max-w-[80%] rounded-xl px-3.5 py-2.5 text-sm break-words",
          !renderMarkdown && "whitespace-pre-wrap",
          isUser
            ? "bg-blue-600 text-white rounded-br-sm"
            : "bg-white text-gray-800 border border-gray-200 rounded-bl-sm " +
              "dark:bg-slate-900 dark:text-slate-100 dark:border-slate-800"
        )}
      >
        {renderMarkdown ? (
          <Markdown>{msg.content}</Markdown>
        ) : (
          msg.content || (msg.streaming ? "…" : "")
        )}
      </div>
      {allChips.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-1">
          {allChips.map((r) => (
            <button
              key={r.relativePath}
              type="button"
              onClick={() => sessionId && setOpenReport(r)}
              disabled={!sessionId}
              title={sessionId ? "View report" : undefined}
              className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full
                bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-200
                enabled:hover:bg-sky-200 dark:enabled:hover:bg-sky-900/70
                enabled:cursor-pointer transition-colors"
            >
              <span aria-hidden>📄</span> {r.name}
            </button>
          ))}
        </div>
      )}
      {sessionId && (
        <ReportModal
          open={openReport !== null}
          onClose={() => setOpenReport(null)}
          sessionId={sessionId}
          report={openReport}
        />
      )}
      <span className="text-[11px] text-gray-400 dark:text-slate-600 px-1 mt-0.5">
        {msg.streaming ? "…" : fmtTime(msg.createdAt ?? Date.now())}
      </span>
    </div>
  );
}
