import { cn } from "../../utils/cn";
import { fmtTime } from "../../utils/time";
import { EngineeringLog } from "./EngineeringLog";
import type { ChatMessage } from "./types";

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

export function MessageBubble({ msg }: { msg: ChatMessage }) {
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
  return (
    <div className={cn("flex flex-col", isUser ? "items-end" : "items-start")}>
      {msg.userName && (
        <span className="text-[11px] text-gray-400 dark:text-slate-500 px-1 mb-0.5">
          {msg.userName}
        </span>
      )}
      {msg.skill && isUser && <SkillChip name={msg.skill} />}
      <div
        data-testid={isUser ? "user-msg" : "assistant-msg"}
        className={cn(
          "max-w-[80%] rounded-xl px-3.5 py-2.5 text-sm whitespace-pre-wrap break-words",
          isUser
            ? "bg-blue-600 text-white rounded-br-sm"
            : "bg-white text-gray-800 border border-gray-200 rounded-bl-sm " +
              "dark:bg-slate-900 dark:text-slate-100 dark:border-slate-800"
        )}
      >
        {msg.content || (msg.streaming ? "…" : "")}
      </div>
      {msg.reports && msg.reports.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-1">
          {msg.reports.map((r) => (
            <span
              key={r}
              className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full
                bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-200"
            >
              <span aria-hidden>📄</span> {r.split("/").pop()}
            </span>
          ))}
        </div>
      )}
      <span className="text-[11px] text-gray-400 dark:text-slate-600 px-1 mt-0.5">
        {msg.streaming ? "…" : fmtTime(msg.createdAt ?? Date.now())}
      </span>
    </div>
  );
}
