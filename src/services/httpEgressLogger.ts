import { AsyncLocalStorage } from "node:async_hooks";
import fs from "node:fs/promises";
import path from "node:path";
import { settings } from "../db.js";
import { log } from "../logger.js";

interface EgressContext {
  workspacePath: string;
  sessionId?: string;
}

export const egressContext = new AsyncLocalStorage<EgressContext>();

let seq = 0;

function ts(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}-${String(d.getMilliseconds()).padStart(3, "0")}`;
}

function redactHeaders(h: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  h.forEach((v, k) => {
    const kl = k.toLowerCase();
    if (kl === "authorization" && v.startsWith("Bearer ")) {
      const tok = v.slice(7);
      out[k] = `Bearer ...${tok.slice(-4)}`;
    } else if (kl === "x-api-key") {
      out[k] = `...${v.slice(-4)}`;
    } else {
      out[k] = v;
    }
  });
  return out;
}

function llmHostFromBaseUrl(baseUrl: string | undefined): string | null {
  if (!baseUrl) return null;
  try {
    return new URL(baseUrl).host;
  } catch {
    return null;
  }
}

const KNOWN_LLM_HOSTS = ["api.openai.com", "api.anthropic.com"];

function isLlmRequest(url: string): boolean {
  let host: string;
  try {
    host = new URL(url).host;
  } catch {
    return false;
  }
  if (KNOWN_LLM_HOSTS.includes(host)) return true;
  const configured = llmHostFromBaseUrl(settings.getLlmConfig().baseUrl);
  return configured ? host === configured : false;
}

async function readBodyForLog(body: BodyInit | null | undefined): Promise<unknown> {
  if (body == null) return null;
  if (typeof body === "string") {
    try { return JSON.parse(body); } catch { return body; }
  }
  if (body instanceof URLSearchParams) return body.toString();
  if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) {
    return `<binary ${(body as ArrayBuffer).byteLength ?? "?"} bytes>`;
  }
  return "<unsupported body type>";
}

async function dumpResponseBody(res: Response): Promise<{ body: string; truncated: boolean }> {
  try {
    const text = await res.text();
    return { body: text, truncated: false };
  } catch (err: any) {
    return { body: `<read error: ${err?.message ?? err}>`, truncated: true };
  }
}

export function installFetchInterceptor(): void {
  const origFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = async (input: any, init?: RequestInit): Promise<Response> => {
    const flags = settings.getFeatureFlags();
    const url = typeof input === "string" ? input : (input?.url ?? String(input));
    if (!flags.httpEgressLogging || !isLlmRequest(url)) {
      return origFetch(input, init);
    }
    const ctx = egressContext.getStore();
    const startedAt = Date.now();
    const reqHeaders = new Headers(init?.headers ?? (typeof input === "object" ? input.headers : undefined));
    const reqBody = await readBodyForLog(init?.body ?? null);

    let res: Response;
    try {
      res = await origFetch(input, init);
    } catch (err: any) {
      await writeDump(ctx, {
        ts: new Date().toISOString(),
        request: {
          url,
          method: init?.method ?? "GET",
          headers: redactHeaders(reqHeaders),
          body: reqBody,
        },
        error: err?.message ?? String(err),
        durationMs: Date.now() - startedAt,
      });
      throw err;
    }

    const cloned = res.clone();
    void (async () => {
      const { body, truncated } = await dumpResponseBody(cloned);
      await writeDump(ctx, {
        ts: new Date().toISOString(),
        request: {
          url,
          method: init?.method ?? "GET",
          headers: redactHeaders(reqHeaders),
          body: reqBody,
        },
        response: {
          status: res.status,
          headers: redactHeaders(res.headers),
          body,
          truncated,
          durationMs: Date.now() - startedAt,
        },
      });
    })();
    return res;
  };
  log.info("http-egress:installed");
}

async function writeDump(ctx: EgressContext | undefined, payload: unknown): Promise<void> {
  const n = ++seq;
  const dir = ctx?.workspacePath
    ? path.join(ctx.workspacePath, "agent_notes")
    : path.join(process.env.DATA_DIR ?? process.cwd(), "http-egress");
  const file = path.join(dir, `http-egress-${ts()}-${n}.json`);
  try {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(file, JSON.stringify(payload, null, 2), "utf8");
  } catch (err: any) {
    log.warn("http-egress:write-failed", { file, error: err?.message ?? String(err) });
  }
}
