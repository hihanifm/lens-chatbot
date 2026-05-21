// Stable per-browser client id, used to suppress echo of our own events on the
// presence/listen stream (matches the legacy myClientId behaviour).
const KEY = "lens-chatbot:client-id";

function makeId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `c-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

let cached: string | null = null;

export function clientId(): string {
  if (cached) return cached;
  try {
    const stored = localStorage.getItem(KEY);
    if (stored) {
      cached = stored;
      return stored;
    }
    const id = makeId();
    localStorage.setItem(KEY, id);
    cached = id;
    return id;
  } catch {
    cached = makeId();
    return cached;
  }
}
