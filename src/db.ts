import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import { homedir } from "node:os";
import { mkdirSync } from "node:fs";

export type TracerDb = DatabaseSync;

export function initDb(): DatabaseSync | null {
  try {
    const dbDir = join(homedir(), ".openclaw");
    mkdirSync(dbDir, { recursive: true });
    const dbPath = join(dbDir, "tracer.db");
    const db = new DatabaseSync(dbPath);

    db.exec("PRAGMA journal_mode=WAL");
    db.exec("PRAGMA synchronous=NORMAL");

    db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        session_key TEXT,
        session_id TEXT,
        channel TEXT,
        sender_id TEXT,
        model TEXT,
        provider TEXT,
        trigger TEXT,
        agent_type TEXT,
        started_at INTEGER NOT NULL,
        ended_at INTEGER,
        message_count INTEGER DEFAULT 0
      )
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT,
        run_id TEXT,
        type TEXT NOT NULL,
        name TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        ended_at INTEGER,
        duration_ms INTEGER,
        status TEXT DEFAULT 'ok',
        metadata TEXT
      )
    `);

    db.exec(`CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_sessions_time ON sessions(started_at DESC)`);

    return db;
  } catch {
    return null;
  }
}

export function pruneOldSessions(db: DatabaseSync, maxSessions: number): void {
  try {
    db.exec(`
      DELETE FROM events WHERE session_id IN (
        SELECT id FROM sessions ORDER BY started_at DESC LIMIT -1 OFFSET ${maxSessions}
      )
    `);
    db.exec(`DELETE FROM sessions WHERE id NOT IN (
      SELECT id FROM sessions ORDER BY started_at DESC LIMIT ${maxSessions}
    )`);
  } catch { /* ignore */ }
}
