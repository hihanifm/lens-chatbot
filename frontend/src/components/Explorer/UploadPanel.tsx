import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { useUpload } from "../../state/upload";

export function UploadPanel({
  sessionId,
  bugId,
}: {
  sessionId: string;
  bugId: string;
}) {
  const qc = useQueryClient();
  const start = useUpload((s) => s.start);
  const active = useUpload((s) => s.active);
  const fileRef = useRef<HTMLInputElement>(null);
  const [label, setLabel] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);

  const busy =
    !!active && active.phase !== "done" && active.phase !== "error";

  const submit = async () => {
    if (files.length === 0 || busy) return;
    setError(null);
    try {
      await start({
        sessionId,
        bugId,
        files,
        commentLabel: label.trim() || undefined,
      });
      setFiles([]);
      setLabel("");
      if (fileRef.current) fileRef.current.value = "";
      qc.invalidateQueries({ queryKey: ["workspace-files", sessionId] });
      qc.invalidateQueries({ queryKey: ["session", sessionId] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    }
  };

  return (
    <div className="border-t border-gray-200 dark:border-slate-800 p-3 space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
        Upload logs
      </p>
      <input
        id="upload-files-input"
        ref={fileRef}
        type="file"
        multiple
        onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
        className="block w-full text-xs text-gray-600 dark:text-slate-300
          file:mr-2 file:py-1 file:px-2 file:rounded-md file:border-0
          file:text-xs file:bg-blue-100 file:text-blue-700
          dark:file:bg-slate-800 dark:file:text-slate-200"
      />
      <Input
        id="upload-label-input"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Optional group label"
        className="text-xs"
      />
      {error && <p className="text-xs text-red-600 dark:text-red-300">{error}</p>}
      <Button
        id="upload-submit-btn"
        variant="primary"
        size="sm"
        className="w-full"
        onClick={submit}
        disabled={files.length === 0 || busy}
      >
        {busy ? "Uploading…" : `Upload ${files.length || ""} file${files.length === 1 ? "" : "s"}`}
      </Button>
    </div>
  );
}
