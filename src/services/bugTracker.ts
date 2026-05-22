import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

export interface BugAttachment {
  id: string;
  name: string;
  size: number;
}

export interface BugComment {
  id: string;
  author: string;
  body: string;
  created_at: string;
  attachments: BugAttachment[];
}

export interface BugDetails {
  id: string;
  title: string;
  description: string;
  author: string;
  owner: string;
  state: string;
  module: string;
  created_at: string;
  updated_at: string;
  attachments: BugAttachment[];
  comments: BugComment[];
}

export type DownloadProgress = (loaded: number, total: number) => void;

export interface BugTracker {
  getBug(bugId: string): Promise<BugDetails>;
  downloadAttachment(bugId: string, attId: string, onProgress?: DownloadProgress): Promise<Buffer>;
}

const MOCK_FIXTURES_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../fixtures/mock"
);

const MOCK_ATTACHMENTS: Record<string, string> = {
  "att-1": "modem_log.txt",
  "att-2": "screenshot.png",
  "att-3": "modem_verbose.txt",
  "att-4": "screenshot-2.png",
  "att-5": "crash_dump.zip",
};

// Stub — replace with InternalBugTracker when API is ready
export class MockBugTracker implements BugTracker {
  async getBug(bugId: string): Promise<BugDetails> {
    if (bugId === "BUG-456") {
      return {
        id: bugId,
        title: `[MOCK] Bug ${bugId} — Crash After Handover`,
        description: "Device crashes approximately 8 seconds after LTE handover. Radio and system logs captured in attached zip.",
        author: "alice.tan",
        owner: "bob.lee",
        state: "Open",
        module: "Radio",
        created_at: "2026-05-12T11:00:00Z",
        updated_at: new Date().toISOString(),
        attachments: [
          { id: "att-5", name: "crash_dump.zip", size: 1992 },
        ],
        comments: [
          {
            id: "cmt-10",
            author: "bob.lee",
            body: "Reproduced on two handsets. Both crash within 8–10s post-handover. Zip contains radio_logs and system_logs.",
            created_at: "2026-05-12T13:30:00Z",
            attachments: [],
          },
        ],
      };
    }

    return {
      id: bugId,
      title: `[MOCK] Bug ${bugId} — IMS Registration Failure`,
      description: "Device fails to register on IMS after handover. Observed in modem logs around T+30s.",
      author: "john.smith",
      owner: "jane.doe",
      state: "In Progress",
      module: "IMS",
      created_at: "2026-05-10T08:00:00Z",
      updated_at: new Date().toISOString(),
      attachments: [
        { id: "att-1", name: "modem_log.txt", size: 320 },
        { id: "att-2", name: "screenshot.png", size: 34059 },
        { id: "att-4", name: "screenshot (2).png", size: 22748 },
        { id: "att-5", name: "crash_dump.zip", size: 1992 },
      ],
      comments: [
        {
          id: "cmt-1",
          author: "jane.doe",
          body: "Reproduced on build 4.2.1. Attached verbose modem log. DNS resolution consistently fails after handover.",
          created_at: "2026-05-10T09:15:00Z",
          attachments: [{ id: "att-3", name: "modem_verbose.txt", size: 360 }],
        },
        {
          id: "cmt-2",
          author: "bob.lee",
          body: "Checked RIL layer — looks clean. Narrowing down to P-CSCF discovery phase.",
          created_at: "2026-05-12T14:22:00Z",
          attachments: [],
        },
      ],
    };
  }

  async downloadAttachment(_bugId: string, attId: string, _onProgress?: DownloadProgress): Promise<Buffer> {
    const fixtureName = MOCK_ATTACHMENTS[attId];
    if (!fixtureName) {
      throw new Error(`Unknown mock attachment: ${attId}`);
    }
    return readFile(path.join(MOCK_FIXTURES_DIR, fixtureName));
  }
}

// TODO: implement this when internal bug tracker API details are available
export class InternalBugTracker implements BugTracker {
  private baseUrl: string;
  private token: string;

  constructor() {
    this.baseUrl = process.env.BUG_TRACKER_URL!;
    this.token = process.env.BUG_TRACKER_TOKEN!;
  }

  async getBug(bugId: string): Promise<BugDetails> {
    const { default: axios } = await import("axios");
    const res = await axios.get(`${this.baseUrl}/bugs/${bugId}`, {
      headers: { Authorization: `Bearer ${this.token}` },
    });
    // TODO: map res.data fields to BugDetails shape
    return res.data as BugDetails;
  }

  async downloadAttachment(bugId: string, attId: string, onProgress?: DownloadProgress): Promise<Buffer> {
    const { default: axios } = await import("axios");
    const res = await axios.get(
      `${this.baseUrl}/bugs/${bugId}/attachments/${attId}/download`,
      {
        headers: { Authorization: `Bearer ${this.token}` },
        responseType: "arraybuffer",
        onDownloadProgress: onProgress
          ? (e) => onProgress(e.loaded, e.total ?? 0)
          : undefined,
      }
    );
    return Buffer.from(res.data);
  }
}
