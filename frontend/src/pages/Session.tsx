import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Sidebar } from "../components/Sidebar";
import { BugPanel } from "../components/BugPanel";
import { Thread } from "../components/Chat/Thread";
import { Composer } from "../components/Chat/Composer";
import { ExplorerDrawer } from "../components/Explorer/Drawer";
import { LuckyButton } from "../components/Lucky/Button";
import { WikiModal } from "../components/Wiki/Modal";
import { PresenceBar } from "../components/Presence/Bar";
import type { ChatMessage } from "../components/Chat/types";
import { Spinner } from "../components/ui/Spinner";
import { useSession, useFeatureFlags } from "../api/queries";
import { useSeenSessions } from "../state/sessions";
import { useAuth } from "../state/auth";
import { useAnalyze } from "../hooks/useAnalyze";
import { useListen } from "../hooks/useListen";
import { parseSkillTag } from "../utils/skillTag";

export default function Session() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, isError, error } = useSession(id);
  const { data: features } = useFeatureFlags();
  const addSeen = useSeenSessions((s) => s.add);
  const userId = useAuth((s) => s.userId);
  const { live, streaming, send, lucky, abort } = useAnalyze(id, userId);
  const { presence, remote } = useListen(id, userId);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [wikiOpen, setWikiOpen] = useState(false);

  useEffect(() => {
    if (id) addSeen(id);
  }, [id, addSeen]);

  const loaded = useMemo<ChatMessage[]>(() => {
    if (!data) return [];
    return data.messages.map((m) => {
      const parsed =
        m.role === "user" ? parseSkillTag(m.content) : { skill: null, text: m.content };
      return {
        key: String(m.id),
        role: m.role === "assistant" ? "assistant" : m.role === "user" ? "user" : "status",
        content: parsed.text,
        createdAt: m.created_at,
        userName: m.role === "user" && m.user_name !== "User" ? m.user_name : null,
        skill: parsed.skill,
      } satisfies ChatMessage;
    });
  }, [data]);

  const messages = useMemo(
    () => [...loaded, ...remote, ...live],
    [loaded, remote, live]
  );

  return (
    <div className="flex-1 flex min-h-0">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {isLoading && (
          <div className="flex-1 flex items-center justify-center text-gray-400 dark:text-slate-500">
            <Spinner /> <span className="ml-2">Loading session…</span>
          </div>
        )}
        {isError && (
          <div className="flex-1 flex flex-col items-center justify-center gap-2">
            <p className="text-sm text-red-600 dark:text-red-300">
              {error instanceof Error ? error.message : "Failed to load session"}
            </p>
            <Link to="/" className="text-sm text-blue-600 hover:underline">
              ← Back home
            </Link>
          </div>
        )}
        {data && (
          <>
            <BugPanel
              bug={data.bug}
              bugId={data.session.bug_id}
              explorerOpen={drawerOpen}
              onToggleExplorer={() => setDrawerOpen((v) => !v)}
              actions={
                <>
                  {features?.lucky && (
                    <LuckyButton disabled={streaming} onLucky={lucky} />
                  )}
                  {features?.wiki && (
                    <button
                      type="button"
                      onClick={() => setWikiOpen(true)}
                      className="text-xs px-2.5 py-1 rounded-lg border border-gray-300
                        text-gray-600 hover:bg-gray-50 dark:border-slate-700
                        dark:text-slate-300 dark:hover:bg-slate-800 transition-colors"
                    >
                      📚 Wiki
                    </button>
                  )}
                </>
              }
            />
            <PresenceBar users={presence} />
            <Thread messages={messages} />
            <Composer
              streaming={streaming}
              onSend={(q, skill) => send(q, { skill })}
              onAbort={abort}
            />
          </>
        )}
      </div>
      {data && id && (
        <ExplorerDrawer
          open={drawerOpen}
          sessionId={id}
          bugId={data.session.bug_id}
          selectedFiles={data.session.selected_files ?? []}
          onClose={() => setDrawerOpen(false)}
        />
      )}
      {id && <WikiModal open={wikiOpen} onClose={() => setWikiOpen(false)} sessionId={id} />}
    </div>
  );
}
