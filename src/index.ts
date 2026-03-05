import type { PluginContext } from "openclaw/plugin-sdk/core";
import { initDb } from "./db.js";
import { getConfig } from "./config.js";
import { Tracer } from "./tracer.js";

export default function tracerPlugin(api: PluginContext): void {
  const pluginConfig = api.pluginConfig as Record<string, unknown> | undefined;
  const config = getConfig(pluginConfig);

  if (!config.enabled) {
    api.logger.info("[tracer] disabled via config");
    return;
  }

  const db = initDb();
  if (!db) {
    api.logger.warn("[tracer] failed to initialize SQLite DB — tracing disabled");
    return;
  }

  const tracer = new Tracer(db, config, api.logger);
  api.logger.info("[tracer] initialized, DB ready");

  // Phase 2: hook registrations go here (tracer.onSessionStart, etc.)
  void tracer; // used in Phase 2

  api.on("gateway_start", async () => {
    try {
      const stmt = db.prepare(
        "INSERT INTO events (session_id, type, name, started_at, status) VALUES (?,?,?,?,?)"
      );
      const result = stmt.run("__test__", "system", "startup_check", Date.now(), "ok") as { lastInsertRowid: number };
      db.prepare("DELETE FROM events WHERE id = ?").run(result.lastInsertRowid);
      api.logger.info("[tracer] DB write verified OK");
    } catch (e) {
      api.logger.warn("[tracer] DB write test failed: " + String(e).slice(0, 100));
    }
  });
}
