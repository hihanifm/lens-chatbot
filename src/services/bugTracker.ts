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

export interface BugTracker {
  getBug(bugId: string): Promise<BugDetails>;
  downloadAttachment(bugId: string, attId: string): Promise<Buffer>;
}

// Stub — replace with InternalBugTracker when API is ready
export class MockBugTracker implements BugTracker {
  async getBug(bugId: string): Promise<BugDetails> {
    return {
      id: bugId,
      title: `[MOCK] Bug ${bugId} — IMS Registration Failure`,
      description: "Device fails to register on IMS after handover. Observed in modem logs around T+30s.",
      author: "john.smith",
      owner: "jane.doe",
      state: "In Progress",
      module: "IMS",
      created_at: "2026-05-10T08:00:00Z",
      updated_at: "2026-05-14T17:30:00Z",
      attachments: [
        { id: "att-1", name: "modem_log.txt", size: 20480 },
        { id: "att-2", name: "screenshot.png", size: 45312 },
      ],
      comments: [
        {
          id: "cmt-1",
          author: "jane.doe",
          body: "Reproduced on build 4.2.1. Attached verbose modem log. DNS resolution consistently fails after handover.",
          created_at: "2026-05-10T09:15:00Z",
          attachments: [{ id: "att-3", name: "modem_verbose.txt", size: 51200 }],
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

  async downloadAttachment(_bugId: string, attId: string): Promise<Buffer> {
    const content = `[MOCK] Log content for attachment ${attId}
2024-01-15 10:23:01 INFO  IMS registration attempt started
2024-01-15 10:23:02 DEBUG P-CSCF discovery via DHCP
2024-01-15 10:23:05 ERROR DNS resolution failed for pcscf.ims.internal
2024-01-15 10:23:05 WARN  Retrying with secondary DNS...
2024-01-15 10:23:10 ERROR Registration timeout after 5000ms
Replace this with real API download.`;
    return Buffer.from(content);
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

  async downloadAttachment(bugId: string, attId: string): Promise<Buffer> {
    const { default: axios } = await import("axios");
    const res = await axios.get(
      `${this.baseUrl}/bugs/${bugId}/attachments/${attId}/download`,
      {
        headers: { Authorization: `Bearer ${this.token}` },
        responseType: "arraybuffer",
      }
    );
    return Buffer.from(res.data);
  }
}
