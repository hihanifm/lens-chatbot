// Thin fetch wrapper. All endpoints are same-origin (Vite proxies during dev,
// Express serves both /api routes and the static bundle in prod).

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export async function api<T = unknown>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(path, { ...init, headers });
  const text = await res.text();
  let body: unknown = text;
  if (text.length > 0) {
    try { body = JSON.parse(text); } catch {}
  }
  if (!res.ok) {
    const msg = typeof body === "object" && body && "error" in body
      ? String((body as { error: unknown }).error)
      : `HTTP ${res.status}`;
    throw new ApiError(res.status, msg, body);
  }
  return body as T;
}

export const apiJson = <T = unknown>(path: string, body: unknown, method = "POST") =>
  api<T>(path, { method, body: JSON.stringify(body) });
