import fs from "node:fs/promises";
import { sessions } from "../db.js";
import { log } from "../logger.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Delete sessions older than `retentionDays`, along with their messages and
 * workspace directories. A no-op when retention is disabled (days <= 0).
 */
export async function sweepExpiredSessions(retentionDays: number): Promise<void> {
  if (!retentionDays || retentionDays <= 0) return;
  const cutoff = new Date(Date.now() - retentionDays * DAY_MS).toISOString();
  const expired = sessions.listExpiredBefore(cutoff);
  for (const s of expired) {
    try {
      if (s.workspace_path) await fs.rm(s.workspace_path, { recursive: true, force: true });
      sessions.delete(s.id);
      log.info("retention:session-purged", { sessionId: s.id, bugId: s.bug_id });
    } catch (err) {
      log.warn("retention:purge-failed", { sessionId: s.id, error: (err as Error).message });
    }
  }
  if (expired.length) log.info("retention:sweep-done", { purged: expired.length, cutoff });
}

/**
 * Start the retention sweeper if `SESSION_RETENTION_DAYS` is set to a positive
 * number. Runs once at startup, then every 24h. Opt-in — the sweep is destructive.
 */
export function startRetentionSweeper(): void {
  const days = Number(process.env.SESSION_RETENTION_DAYS ?? 0);
  if (!days || days <= 0) return;
  const run = () =>
    sweepExpiredSessions(days).catch((err) =>
      log.warn("retention:sweep-error", { error: (err as Error).message })
    );
  log.info("retention:enabled", { retentionDays: days });
  run();
  setInterval(run, DAY_MS).unref();
}
