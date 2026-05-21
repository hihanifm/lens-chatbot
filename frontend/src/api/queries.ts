import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiJson } from "./client";
import type {
  Bug,
  FeatureFlags,
  Message,
  Session,
  User,
  VirtualTree,
  ZipEntry,
} from "./types";

export function useSessions(ids: string[]) {
  return useQuery<Session[]>({
    queryKey: ["sessions", ids],
    enabled: ids.length > 0,
    queryFn: () => api(`/sessions?ids=${ids.join(",")}`),
  });
}

export interface SessionDetail {
  session: Session;
  messages: Message[];
  bug: Bug | null;
  downloaded_files: string[];
}

export function useSession(id: string | undefined) {
  return useQuery<SessionDetail>({
    queryKey: ["session", id],
    enabled: !!id,
    queryFn: () => api(`/session/${id}`),
  });
}

export function useWorkspaceFiles(id: string | undefined, enabled = true) {
  return useQuery<VirtualTree>({
    queryKey: ["workspace-files", id],
    enabled: !!id && enabled,
    queryFn: () => api(`/session/${id}/workspace/files`),
  });
}

export function useZipContents(id: string | undefined, zipPath: string | null) {
  return useQuery<{ entries: ZipEntry[] }>({
    queryKey: ["zip-contents", id, zipPath],
    enabled: !!id && !!zipPath,
    queryFn: () =>
      api(`/session/${id}/zip-contents?zipPath=${encodeURIComponent(zipPath!)}`),
  });
}

export function useToggleFile(id: string | undefined) {
  const qc = useQueryClient();
  return useMutation<unknown, Error, { filePath: string; selected: boolean }>({
    mutationFn: (vars) => apiJson(`/session/${id}/files`, vars, "PATCH"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["session", id] }),
  });
}

export function useDownloadAttachment(id: string | undefined) {
  const qc = useQueryClient();
  return useMutation<
    { filePath: string; extractedFiles: string[]; autoSelected: string[] },
    Error,
    { attId: string; attName: string }
  >({
    mutationFn: ({ attId, attName }) =>
      apiJson(`/session/${id}/attachment/${attId}`, { attName }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workspace-files", id] });
      qc.invalidateQueries({ queryKey: ["session", id] });
    },
  });
}

export function useExtractFile(id: string | undefined) {
  const qc = useQueryClient();
  return useMutation<{ filePath: string }, Error, { zipPath: string; innerPath: string }>({
    mutationFn: (vars) => apiJson(`/session/${id}/extract-file`, vars),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workspace-files", id] });
      qc.invalidateQueries({ queryKey: ["zip-contents", id] });
    },
  });
}

export function useFeatureFlags() {
  return useQuery<FeatureFlags>({
    queryKey: ["features"],
    queryFn: async () => {
      const res = await api<{ flags: FeatureFlags }>("/settings/features");
      return res.flags ?? {};
    },
    staleTime: 60_000,
  });
}

export interface SkillInfo {
  name: string;
  description: string;
  triggers: string[];
}

export function useSkills() {
  return useQuery<SkillInfo[]>({
    queryKey: ["skills"],
    queryFn: () => api("/skills"),
    staleTime: 60_000,
  });
}

export function useCreateWikiEntry(id: string | undefined) {
  return useMutation<
    { entry: { path: string; moduleSlug: string } },
    Error,
    { module: string; title?: string }
  >({
    mutationFn: (vars) => apiJson(`/session/${id}/wiki`, vars),
  });
}

export interface LlmSettings {
  provider: string;
  model: string;
  baseUrl?: string;
  apiKey?: string;
  maxIterations?: number;
  systemPromptSource?: "lens" | "cline";
}

export function useLlmSettings() {
  return useQuery<LlmSettings>({
    queryKey: ["settings", "llm"],
    queryFn: () => api("/settings/llm"),
  });
}

export function useSkillsSettings() {
  return useQuery<{ dirs: string[]; env: string[]; extra: string[]; configured: string[] }>({
    queryKey: ["settings", "skills"],
    queryFn: () => api("/settings/skills"),
  });
}

export function useSaveLlmSettings() {
  const qc = useQueryClient();
  return useMutation<LlmSettings, Error, LlmSettings & { pin: string }>({
    mutationFn: (vars) => apiJson("/settings/llm", vars, "PUT"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings", "llm"] }),
  });
}

export function useSaveSkillsDirs() {
  const qc = useQueryClient();
  return useMutation<unknown, Error, { pin: string; dirs: string[] }>({
    mutationFn: (vars) => apiJson("/settings/skills", vars, "PUT"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings", "skills"] }),
  });
}

export function useChangeAdminPin() {
  return useMutation<unknown, Error, { currentPin: string; newPin: string }>({
    mutationFn: (vars) => apiJson("/settings/admin/pin", vars, "PUT"),
  });
}

export function useAuthLogin() {
  return useMutation<User, Error, { name: string; pin: string }>({
    mutationFn: (vars) => apiJson("/auth", vars),
  });
}

export function useCreateAdhocSession() {
  const qc = useQueryClient();
  return useMutation<
    { session: Session; bug: unknown },
    Error,
    { title: string; description?: string; bugId?: string }
  >({
    mutationFn: (vars) => apiJson("/session/adhoc", vars),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sessions"] }),
  });
}

export function useCreateBugSession() {
  const qc = useQueryClient();
  return useMutation<{ session: Session; bug: unknown }, Error, { bugId: string }>({
    mutationFn: (vars) => apiJson("/session", vars),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sessions"] }),
  });
}
