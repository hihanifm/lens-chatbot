import { useEffect, useRef, useState } from "react";
import type { ChatMessage, LogLine } from "../components/Chat/types";
import { clientId } from "../utils/clientId";

export interface PresenceUser {
  clientId: string;
  userName: string;
}

interface ListenEvent {
  type: string;
  clientId?: string;
  userName?: string;
  users?: PresenceUser[];
  content?: string;
  user?: string;
  skill?: string | null;
  commands?: { query: string; success: boolean; error?: string }[];
}

const truncate = (s: string) => (s.length > 280 ? s.slice(0, 280) + "…" : s);

/**
 * Passive observer of /session/:id/listen — tracks who else is viewing the
 * session and mirrors analysis runs started by *other* clients into the thread.
 */
export function useListen(sessionId: string | undefined, userId: string | null) {
  const [presence, setPresence] = useState<PresenceUser[]>([]);
  const [remote, setRemote] = useState<ChatMessage[]>([]);
  const mine = clientId();

  // Keys of the in-flight remote turn (one analysis per session at a time).
  const turn = useRef<{ eng: string; asst: string } | null>(null);

  useEffect(() => {
    setPresence([]);
    setRemote([]);
    turn.current = null;
    if (!sessionId || !userId) return;

    const params = new URLSearchParams({ userId, clientId: mine });
    const es = new EventSource(`/session/${sessionId}/listen?${params}`);

    const patch = (key: string, fn: (m: ChatMessage) => ChatMessage) =>
      setRemote((prev) => prev.map((m) => (m.key === key ? fn(m) : m)));

    es.onmessage = (e) => {
      let d: ListenEvent;
      try {
        d = JSON.parse(e.data);
      } catch {
        return;
      }
      // Presence.
      if (d.type === "presence:snapshot") {
        setPresence((d.users ?? []).filter((u) => u.clientId !== mine));
        return;
      }
      if (d.type === "presence:join") {
        if (d.clientId === mine) return;
        setPresence((p) =>
          p.some((u) => u.clientId === d.clientId)
            ? p
            : [...p, { clientId: d.clientId!, userName: d.userName ?? "?" }]
        );
        return;
      }
      if (d.type === "presence:leave") {
        setPresence((p) => p.filter((u) => u.clientId !== d.clientId));
        return;
      }

      // Analysis events — only mirror those started by *other* clients.
      if (d.clientId && d.clientId === mine) return;
      const ts = Date.now();

      if (d.type === "user_message") {
        const eng = `remote-eng-${ts}`;
        const asst = `remote-asst-${ts}`;
        turn.current = { eng, asst };
        setRemote((prev) => [
          ...prev,
          {
            key: `remote-user-${ts}`,
            role: "user",
            content: d.content ?? "",
            userName: d.user ?? "Someone",
            skill: d.skill ?? null,
          },
          { key: eng, role: "englog", content: "", logLines: [], streaming: true },
          { key: asst, role: "assistant", content: "", streaming: true },
        ]);
        return;
      }
      if (!turn.current) return;
      const { eng, asst } = turn.current;
      const addLog = (line: LogLine) =>
        patch(eng, (m) => ({ ...m, logLines: [...(m.logLines ?? []), line] }));

      switch (d.type) {
        case "status":
          addLog({ text: d.content ?? "", kind: "status" });
          break;
        case "tool_error":
          addLog({ text: d.content ?? "", kind: "error" });
          break;
        case "tool_command":
          for (const c of d.commands ?? []) {
            addLog({
              text: `${c.success ? "✓" : "✗"} ${truncate(String(c.query ?? ""))}${
                c.error ? " — " + c.error : ""
              }`,
              kind: c.success ? "cmd-ok" : "cmd-error",
            });
          }
          break;
        case "text":
          patch(asst, (m) => ({ ...m, content: m.content + (d.content ?? "") }));
          break;
        case "done":
          patch(eng, (m) => ({ ...m, streaming: false }));
          patch(asst, (m) => ({ ...m, streaming: false, createdAt: new Date().toISOString() }));
          turn.current = null;
          break;
        case "error":
          patch(eng, (m) => ({ ...m, streaming: false }));
          patch(asst, (m) => ({
            ...m,
            streaming: false,
            role: "error",
            content: `✗ ${d.content ?? "error"}`,
          }));
          turn.current = null;
          break;
      }
    };

    return () => es.close();
  }, [sessionId, userId, mine]);

  return { presence, remote };
}
