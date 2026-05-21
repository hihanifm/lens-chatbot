import { create } from "zustand";

export interface UploadProgress {
  sessionId: string;
  fileName: string;
  bugId: string;
  loaded: number;
  total: number;
  phase: "uploading" | "saving" | "done" | "error";
  message?: string;
}

interface UploadResult {
  filePaths?: string[];
  autoSelected?: string[];
  error?: string;
}

interface UploadState {
  active: UploadProgress | null;
  /** Returns a promise that resolves with the server response (or rejects). */
  start: (args: {
    sessionId: string;
    bugId: string;
    files: FileList | File[];
    commentLabel?: string;
    commentBody?: string;
  }) => Promise<UploadResult>;
  clear: () => void;
}

export const useUpload = create<UploadState>((set, get) => ({
  active: null,
  clear: () => set({ active: null }),
  start: ({ sessionId, bugId, files, commentLabel, commentBody }) => {
    if (get().active && get().active!.phase !== "done" && get().active!.phase !== "error") {
      return Promise.reject(new Error("An upload is already in progress"));
    }
    const list = Array.from(files);
    const fileName =
      list.length === 1 ? list[0].name : `${list.length} files`;
    const total = list.reduce((sum, f) => sum + f.size, 0);

    set({
      active: { sessionId, bugId, fileName, loaded: 0, total, phase: "uploading" },
    });

    const fd = new FormData();
    for (const f of list) fd.append("files", f);
    if (commentLabel) fd.append("commentLabel", commentLabel);
    if (commentBody) fd.append("commentBody", commentBody);

    return new Promise<UploadResult>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `/session/${sessionId}/upload`);

      xhr.upload.onprogress = (e) => {
        if (!e.lengthComputable) return;
        set((s) =>
          s.active
            ? { active: { ...s.active, loaded: e.loaded, total: e.total } }
            : s
        );
      };
      xhr.upload.onload = () => {
        // Bytes are on the wire; server is now writing them to disk.
        set((s) => (s.active ? { active: { ...s.active, phase: "saving" } } : s));
      };
      xhr.onload = () => {
        let body: UploadResult = {};
        try {
          body = JSON.parse(xhr.responseText);
        } catch {
          /* keep empty */
        }
        if (xhr.status >= 200 && xhr.status < 300) {
          set((s) => (s.active ? { active: { ...s.active, phase: "done" } } : s));
          resolve(body);
        } else {
          const msg = body.error ?? `Upload failed (HTTP ${xhr.status})`;
          set((s) =>
            s.active ? { active: { ...s.active, phase: "error", message: msg } } : s
          );
          reject(new Error(msg));
        }
      };
      xhr.onerror = () => {
        set((s) =>
          s.active
            ? { active: { ...s.active, phase: "error", message: "Network error" } }
            : s
        );
        reject(new Error("Network error during upload"));
      };

      xhr.send(fd);
    });
  },
}));
