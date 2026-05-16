import type { Response } from "express";

interface ListenClient {
  clientId: string;
  userName: string;
  sessionId: string;
  res: Response;
}

const rooms = new Map<string, ListenClient[]>();

setInterval(() => {
  for (const clients of rooms.values()) {
    for (const c of clients) {
      try { c.res.write(": ping\n\n"); } catch { /* client gone */ }
    }
  }
}, 25_000);

export function addClient(sessionId: string, client: ListenClient): void {
  const existing = rooms.get(sessionId) ?? [];
  const snapshot = existing.map(c => ({ clientId: c.clientId, userName: c.userName }));
  client.res.write(`data: ${JSON.stringify({ type: "presence:snapshot", users: snapshot })}\n\n`);
  for (const c of existing) {
    try {
      c.res.write(`data: ${JSON.stringify({ type: "presence:join", clientId: client.clientId, userName: client.userName })}\n\n`);
    } catch { /* client gone */ }
  }
  rooms.set(sessionId, [...existing, client]);
}

export function removeClient(sessionId: string, clientId: string): void {
  const existing = rooms.get(sessionId) ?? [];
  const client = existing.find(c => c.clientId === clientId);
  const remaining = existing.filter(c => c.clientId !== clientId);
  if (remaining.length) {
    rooms.set(sessionId, remaining);
  } else {
    rooms.delete(sessionId);
  }
  if (!client) return;
  for (const c of remaining) {
    try {
      c.res.write(`data: ${JSON.stringify({ type: "presence:leave", clientId: client.clientId, userName: client.userName })}\n\n`);
    } catch { /* client gone */ }
  }
}

export function broadcast(sessionId: string, event: object, excludeClientId?: string): void {
  const clients = rooms.get(sessionId) ?? [];
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const c of clients) {
    if (c.clientId === excludeClientId) continue;
    try { c.res.write(payload); } catch { /* client gone */ }
  }
}

export function getPresence(sessionId: string): { clientId: string; userName: string }[] {
  return (rooms.get(sessionId) ?? []).map(c => ({ clientId: c.clientId, userName: c.userName }));
}
