import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input, Textarea } from "../components/ui/Input";
import { StatusBadge } from "../components/ui/StatusBadge";
import { Spinner } from "../components/ui/Spinner";
import { useSessions, useCreateAdhocSession, useCreateBugSession } from "../api/queries";
import { useSeenSessions } from "../state/sessions";

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString();
}

function AdhocForm({ onCreated }: { onCreated: (id: string) => void }) {
  const create = useCreateAdhocSession();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [bugId, setBugId] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await create.mutateAsync({
        title: title.trim(),
        description: description.trim() || undefined,
        bugId: bugId.trim() || undefined,
      });
      onCreated(res.session.id);
    } catch {
      /* error shown below */
    }
  };

  return (
    <Card className="px-6 py-5">
      <h2 className="font-semibold text-gray-900 dark:text-slate-100">New session</h2>
      <p className="text-sm text-gray-400 dark:text-slate-500 mt-0.5">
        Start an ad-hoc investigation — no tracker entry needed.
      </p>
      <form onSubmit={submit} className="mt-4 space-y-3">
        <Input
          id="adhoc-title-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title — e.g. App crash on cold start"
          required
        />
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional description / context"
          rows={3}
        />
        <Input
          value={bugId}
          onChange={(e) => setBugId(e.target.value)}
          placeholder="Optional bug ID"
        />
        {create.isError && (
          <p className="text-sm text-red-600 dark:text-red-300">{create.error.message}</p>
        )}
        <Button
          id="adhoc-create-btn"
          type="submit"
          variant="primary"
          size="lg"
          className="w-full"
          disabled={create.isPending || !title.trim()}
        >
          {create.isPending ? "Creating…" : "Create session"}
        </Button>
      </form>
    </Card>
  );
}

function LoadBugForm({ onCreated }: { onCreated: (id: string) => void }) {
  const create = useCreateBugSession();
  const [bugId, setBugId] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await create.mutateAsync({ bugId: bugId.trim() });
      onCreated(res.session.id);
    } catch {
      /* error shown below */
    }
  };

  return (
    <Card className="px-6 py-5">
      <h2 className="font-semibold text-gray-900 dark:text-slate-100">Load a tracked bug</h2>
      <p className="text-sm text-gray-400 dark:text-slate-500 mt-0.5">
        Pull a bug from the tracker by its ID.
      </p>
      <form onSubmit={submit} className="mt-4 flex gap-2">
        <Input
          id="bug-id-input"
          value={bugId}
          onChange={(e) => setBugId(e.target.value)}
          placeholder="e.g. BUG-123"
          required
        />
        <Button
          id="load-bug-btn"
          type="submit"
          variant="primary"
          size="lg"
          disabled={create.isPending || !bugId.trim()}
        >
          {create.isPending ? "Loading…" : "Load"}
        </Button>
      </form>
      {create.isError && (
        <p className="text-sm text-red-600 dark:text-red-300 mt-2">{create.error.message}</p>
      )}
    </Card>
  );
}

function SessionList() {
  const ids = useSeenSessions((s) => s.ids);
  const { data: sessions = [], isLoading } = useSessions(ids);

  if (ids.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400 dark:text-slate-500">
        <p className="text-lg">No sessions yet.</p>
        <p className="mt-1">Create your first session to get started.</p>
      </div>
    );
  }
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-gray-400 dark:text-slate-500 py-8">
        <Spinner /> Loading sessions…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {sessions.map((s) => (
        <Link key={s.id} to={`/session/${s.id}`} className="block">
          <Card interactive className="px-6 py-5 cursor-pointer">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <h3 className="font-semibold text-gray-900 dark:text-slate-100 truncate">
                  {s.bug_id}
                </h3>
                <p className="text-sm text-gray-400 dark:text-slate-500 mt-0.5">
                  Created {fmtDate(s.created_at)}
                  {s.last_model ? ` · ${s.last_model}` : ""}
                </p>
              </div>
              <StatusBadge status={s.status || "ready"} />
            </div>
          </Card>
        </Link>
      ))}
    </div>
  );
}

export default function Home() {
  const navigate = useNavigate();
  const addSeen = useSeenSessions((s) => s.add);

  const handleCreated = (id: string) => {
    addSeen(id);
    navigate(`/session/${id}`);
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="w-[92%] max-w-6xl mx-auto py-8 grid lg:grid-cols-5 gap-6">
        <section className="lg:col-span-3">
          <h1 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400 mb-3">
            Your sessions
          </h1>
          <SessionList />
        </section>
        <aside className="lg:col-span-2 space-y-4">
          <h1 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400 mb-3">
            Get started
          </h1>
          <LoadBugForm onCreated={handleCreated} />
          <AdhocForm onCreated={handleCreated} />
        </aside>
      </div>
    </div>
  );
}
