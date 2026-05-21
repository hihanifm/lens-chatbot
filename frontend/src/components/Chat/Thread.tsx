import { useEffect, useRef } from "react";
import { MessageBubble, type ChatMessage } from "./MessageBubble";

export function Thread({ messages }: { messages: ChatMessage[] }) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, messages[messages.length - 1]?.content]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 dark:text-slate-500">
        <p className="text-sm">No messages yet — ask the agent a question to begin.</p>
      </div>
    );
  }

  return (
    <div
      id="chat"
      className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-3
        bg-blue-50/50 dark:bg-slate-950"
    >
      {messages.map((m) => (
        <MessageBubble key={m.key} msg={m} />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
