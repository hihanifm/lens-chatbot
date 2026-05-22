import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage, LogLine, ReportRef } from "../components/Chat/types";
import { clientId } from "../utils/clientId";
import { api } from "../api/client";

interface ToolCommandLine {
  query: string;
  success: boolean;
  error?: string;
}

interface AnalyzeEvent {
  type: "text" | "done" | "error" | "status" | "tool_error" | "tool_command";
  content?: string;
  commands?: ToolCommandLine[];
  reports?: ReportRef[];
}

export interface AnalyzeOptions {
  mode?: "act" | "plan";
  skills?: string[];
}

const truncate = (s: string) => (s.length > 280 ? s.slice(0, 280) + "…" : s);

/**
 * Drives the /analyze and /lucky SSE streams. Returns the live messages added
 * during this session plus `send` (chat turn), `lucky` (auto RCA) and `abort`.
 */
export function useAnalyze(sessionId: string | undefined, userId: string | null) {
  const [live, setLive] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const esRef = useRef<EventSource | null>(null);
  const doneRef = useRef(false);

  useEffect(() => {
    esRef.current?.close();
    esRef.current = null;
    setLive([]);
    setStreaming(false);
  }, [sessionId]);

  useEffect(() => () => esRef.current?.close(), []);

  const patch = useCallback((key: string, fn: (m: ChatMessage) => ChatMessage) => {
    setLive((prev) => prev.map((m) => (m.key === key ? fn(m) : m)));
  }, []);

  // Shared SSE pump for both /analyze and /lucky (identical event shapes).
  const runStream = useCallback(
    (url: string, userMsg: ChatMessage) => {
      const ts = Date.now();
      const engKey = `live-eng-${ts}`;
      const asstKey = `live-asst-${ts}`;

      setLive((prev) => [
        ...prev,
        userMsg,
        { key: engKey, role: "englog", content: "", logLines: [], streaming: true },
        { key: asstKey, role: "assistant", content: "", streaming: true },
      ]);
      setStreaming(true);
      doneRef.current = false;

      const addLog = (line: LogLine) =>
        patch(engKey, (m) => ({ ...m, logLines: [...(m.logLines ?? []), line] }));

      const es = new EventSource(url);
      esRef.current = es;

      const finish = () => {
        es.close();
        esRef.current = null;
        setStreaming(false);
        patch(engKey, (m) => ({ ...m, streaming: false }));
        patch(asstKey, (m) => ({ ...m, streaming: false }));
      };

      es.onmessage = (e) => {
        let data: AnalyzeEvent;
        try {
          data = JSON.parse(e.data);
        } catch {
          return;
        }
        switch (data.type) {
          case "status":
            addLog({ text: data.content ?? "", kind: "status" });
            break;
          case "tool_error":
            addLog({ text: data.content ?? "", kind: "error" });
            break;
          case "tool_command":
            for (const c of data.commands ?? []) {
              addLog({
                text: `${c.success ? "✓" : "✗"} ${truncate(String(c.query ?? ""))}${
                  c.error ? " — " + c.error : ""
                }`,
                kind: c.success ? "cmd-ok" : "cmd-error",
              });
            }
            break;
          case "text":
            patch(asstKey, (m) => ({ ...m, content: m.content + (data.content ?? "") }));
            break;
          case "error":
            doneRef.current = true;
            setLive((prev) => [
              ...prev.filter((m) => m.key !== asstKey),
              { key: `live-err-${ts}`, role: "error", content: `✗ ${data.content ?? "error"}` },
            ]);
            finish();
            break;
          case "done":
            doneRef.current = true;
            patch(asstKey, (m) => ({
              ...m,
              streaming: false,
              createdAt: new Date().toISOString(),
              reports: data.reports ?? [],
            }));
            finish();
            break;
        }
      };

      es.onerror = () => {
        if (doneRef.current) return;
        setLive((prev) => [
          ...prev.filter((m) => m.key !== asstKey),
          {
            key: `live-err-${ts}`,
            role: "error",
            content: "✗ Connection lost — check server logs",
          },
        ]);
        finish();
      };
    },
    [patch]
  );

  const send = useCallback(
    (question: string, opts: AnalyzeOptions = {}) => {
      const q = question.trim();
      if (!q || !sessionId || !userId || streaming) return;
      const params = new URLSearchParams({
        question: q,
        userId,
        clientId: clientId(),
        mode: opts.mode ?? "act",
      });
      (opts.skills ?? []).forEach((s) => params.append("skill", s));
      runStream(`/session/${sessionId}/analyze?${params}`, {
        key: `live-user-${Date.now()}`,
        role: "user",
        content: q,
        skills: opts.skills ?? [],
      });
    },
    [sessionId, userId, streaming, runStream]
  );

  const lucky = useCallback(
    () => {
      if (!sessionId || !userId || streaming) return;
      const params = new URLSearchParams({
        userId,
        clientId: clientId(),
      });
      runStream(`/session/${sessionId}/lucky?${params}`, {
        key: `live-user-${Date.now()}`,
        role: "user",
        content: "🎲 I'm Feeling Lucky — finding the root cause automatically…",
      });
    },
    [sessionId, userId, streaming, runStream]
  );

  const abort = useCallback(async () => {
    if (!streaming) return;
    doneRef.current = true;
    esRef.current?.close();
    esRef.current = null;
    setStreaming(false);
    setLive((prev) => prev.map((m) => (m.streaming ? { ...m, streaming: false } : m)));
    if (sessionId) {
      try {
        await api(`/session/${sessionId}/abort`, { method: "POST" });
      } catch {
        /* best effort */
      }
    }
  }, [sessionId, streaming]);

  return { live, streaming, send, lucky, abort };
}
