import { useEffect, useState } from "react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { cn } from "../../utils/cn";
import {
  useLlmSettings,
  useSkillsSettings,
  useSaveLlmSettings,
  useSaveSkillsDirs,
  useChangeAdminPin,
} from "../../api/queries";

type Tab = "llm" | "skills" | "pin";

const fieldLabel = "block text-sm font-medium mb-1 text-gray-600 dark:text-slate-300";
const selectClass =
  "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white text-gray-900 " +
  "dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100";

function Banner({ kind, children }: { kind: "ok" | "error"; children: React.ReactNode }) {
  return (
    <p
      className={cn(
        "text-sm rounded-lg px-3 py-2",
        kind === "ok"
          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
          : "bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-300"
      )}
    >
      {children}
    </p>
  );
}

function LlmTab() {
  const { data } = useLlmSettings();
  const save = useSaveLlmSettings();
  const [provider, setProvider] = useState("ollama");
  const [model, setModel] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [maxIterations, setMaxIterations] = useState("24");
  const [systemPromptSource, setSystemPromptSource] = useState<"lens" | "cline">("lens");
  const [pin, setPin] = useState("");

  useEffect(() => {
    if (!data) return;
    setProvider(data.provider);
    setModel(data.model);
    setBaseUrl(data.baseUrl ?? "");
    setMaxIterations(String(data.maxIterations ?? 24));
    setSystemPromptSource(data.systemPromptSource ?? "lens");
  }, [data]);

  const submit = () => {
    save.mutate(
      {
        pin,
        provider,
        model,
        baseUrl: baseUrl || undefined,
        apiKey: apiKey || undefined,
        maxIterations: Number(maxIterations),
        systemPromptSource,
      },
      { onSuccess: () => { setApiKey(""); setPin(""); } }
    );
  };

  return (
    <div className="space-y-3">
      <div>
        <label className={fieldLabel}>Provider</label>
        <select
          className={selectClass}
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
        >
          <option value="ollama">Ollama</option>
          <option value="openai">OpenAI</option>
          <option value="openai-compatible">OpenAI-compatible</option>
        </select>
      </div>
      <div>
        <label className={fieldLabel}>Model</label>
        <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="llama3.1:8b" />
      </div>
      {provider !== "openai" && (
        <div>
          <label className={fieldLabel}>Base URL</label>
          <Input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="http://host.docker.internal:11434/v1"
          />
        </div>
      )}
      <div>
        <label className={fieldLabel}>
          API key {data?.apiKey ? `(saved: ${data.apiKey})` : ""}
        </label>
        <Input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="Leave blank to keep current"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={fieldLabel}>Max iterations</label>
          <Input
            type="number"
            value={maxIterations}
            onChange={(e) => setMaxIterations(e.target.value)}
            min={1}
            max={100}
          />
        </div>
        <div>
          <label className={fieldLabel}>System prompt</label>
          <select
            className={selectClass}
            value={systemPromptSource}
            onChange={(e) => setSystemPromptSource(e.target.value as "lens" | "cline")}
          >
            <option value="lens">lens (override)</option>
            <option value="cline">cline (SDK default)</option>
          </select>
        </div>
      </div>
      <div>
        <label className={fieldLabel}>Admin PIN</label>
        <Input
          type="password"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          placeholder="Required to save"
        />
      </div>
      {save.isError && <Banner kind="error">{save.error.message}</Banner>}
      {save.isSuccess && <Banner kind="ok">LLM settings saved.</Banner>}
      <Button
        variant="primary"
        className="w-full"
        onClick={submit}
        disabled={save.isPending || !pin || !model}
      >
        {save.isPending ? "Saving…" : "Save LLM settings"}
      </Button>
    </div>
  );
}

function SkillsTab() {
  const { data } = useSkillsSettings();
  const save = useSaveSkillsDirs();
  const [dirs, setDirs] = useState<string[]>([]);
  const [pin, setPin] = useState("");
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (data) setDirs(data.extra);
  }, [data]);

  return (
    <div className="space-y-3">
      <div>
        <label className={fieldLabel}>Environment skill dirs (read-only)</label>
        <div className="text-xs font-mono text-gray-400 dark:text-slate-500 space-y-0.5">
          {(data?.env ?? []).map((d) => <div key={d}>{d}</div>)}
          {(data?.env ?? []).length === 0 && <div>none</div>}
        </div>
      </div>
      <div>
        <label className={fieldLabel}>Extra skill dirs</label>
        <div className="space-y-1">
          {dirs.map((d, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="flex-1 text-xs font-mono truncate text-gray-700 dark:text-slate-200">
                {d}
              </span>
              <button
                type="button"
                onClick={() => setDirs(dirs.filter((_, j) => j !== i))}
                className="text-xs text-red-500 hover:underline"
              >
                remove
              </button>
            </div>
          ))}
        </div>
        <div className="flex gap-2 mt-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="/path/to/team-skills"
            className="text-xs"
          />
          <Button
            size="sm"
            onClick={() => {
              if (draft.trim()) {
                setDirs([...dirs, draft.trim()]);
                setDraft("");
              }
            }}
          >
            Add
          </Button>
        </div>
      </div>
      <div>
        <label className={fieldLabel}>Admin PIN</label>
        <Input
          type="password"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          placeholder="Required to save"
        />
      </div>
      {save.isError && <Banner kind="error">{save.error.message}</Banner>}
      {save.isSuccess && <Banner kind="ok">Skill directories saved.</Banner>}
      <Button
        variant="primary"
        className="w-full"
        onClick={() => save.mutate({ pin, dirs }, { onSuccess: () => setPin("") })}
        disabled={save.isPending || !pin}
      >
        {save.isPending ? "Saving…" : "Save skill directories"}
      </Button>
    </div>
  );
}

function PinTab() {
  const change = useChangeAdminPin();
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");

  return (
    <div className="space-y-3">
      <div>
        <label className={fieldLabel}>Current PIN</label>
        <Input
          type="password"
          value={currentPin}
          onChange={(e) => setCurrentPin(e.target.value)}
        />
      </div>
      <div>
        <label className={fieldLabel}>New PIN</label>
        <Input
          type="password"
          value={newPin}
          onChange={(e) => setNewPin(e.target.value)}
        />
      </div>
      {change.isError && <Banner kind="error">{change.error.message}</Banner>}
      {change.isSuccess && <Banner kind="ok">Admin PIN changed.</Banner>}
      <Button
        variant="primary"
        className="w-full"
        onClick={() =>
          change.mutate(
            { currentPin, newPin },
            { onSuccess: () => { setCurrentPin(""); setNewPin(""); } }
          )
        }
        disabled={change.isPending || !currentPin || !newPin}
      >
        {change.isPending ? "Changing…" : "Change PIN"}
      </Button>
    </div>
  );
}

export function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("llm");
  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "llm", label: "LLM Provider" },
    { id: "skills", label: "Skills" },
    { id: "pin", label: "Admin PIN" },
  ];

  return (
    <Modal open={open} onClose={onClose} title="Settings" width="max-w-lg">
      <div className="flex gap-1 mb-4 bg-gray-100 dark:bg-slate-800 rounded-lg p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "flex-1 text-sm py-1.5 rounded-md transition-colors",
              tab === t.id
                ? "bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-300 font-medium shadow-sm"
                : "text-gray-500 dark:text-slate-400"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "llm" && <LlmTab />}
      {tab === "skills" && <SkillsTab />}
      {tab === "pin" && <PinTab />}
    </Modal>
  );
}
