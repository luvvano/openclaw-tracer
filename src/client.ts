/**
 * Lightweight tracerHit client — can be imported by any OpenClaw plugin.
 * Writes directly to ~/.openclaw/tracer.db via node:sqlite.
 * Silent no-op if DB doesn't exist or is unavailable.
 */
import { join } from "node:path";
import { homedir } from "node:os";
import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const DB_PATH = join(homedir(), ".openclaw", "tracer.db");

let _db: DatabaseSync | null | undefined = undefined;

function getDb(): DatabaseSync | null {
  if (_db !== undefined) return _db;
  try {
    if (!existsSync(DB_PATH)) { _db = null; return null; }
    _db = new DatabaseSync(DB_PATH);
    return _db;
  } catch {
    _db = null;
    return null;
  }
}

export function tracerHit(
  type: "command" | "skill" | "custom",
  name: string,
  sessionId?: string
): void {
  try {
    const db = getDb();
    if (!db) return;
    db.prepare(
      "INSERT INTO events (session_id, type, name, started_at, status) VALUES (?, ?, ?, ?, ?)"
    ).run(sessionId ?? null, type, name, Date.now(), "ok");
  } catch {
    // silent — never crash the calling plugin
  }
}
