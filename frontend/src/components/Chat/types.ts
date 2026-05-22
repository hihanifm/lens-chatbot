export type LogKind = "status" | "error" | "cmd-ok" | "cmd-error";

export interface LogLine {
  text: string;
  kind: LogKind;
}

export type BubbleRole = "user" | "assistant" | "status" | "error" | "text" | "englog";

/** A report file emitted by the agent on `done` (server `AgentReportFile`). */
export interface ReportRef {
  relativePath: string;
  name: string;
  size: number;
}

export interface ChatMessage {
  key: string;
  role: BubbleRole;
  content: string;
  createdAt?: string;
  userName?: string | null;
  skills?: string[];
  streaming?: boolean;
  /** For role === "englog": the collected agent tool trace for one turn. */
  logLines?: LogLine[];
  /** For role === "assistant": report files emitted on `done`. */
  reports?: ReportRef[];
}
