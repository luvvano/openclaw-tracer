import type { PluginContext } from "openclaw/plugin-sdk/core";
import { initDb, pruneOldSessions } from "./db.js";
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

  // ── Session lifecycle ───────────────────────────────────────────────────

  api.on("session_start", (event, _ctx) => {
    try {
      const e = event as { sessionId: string; sessionKey?: string };
      tracer.onSessionStart(e.sessionId, e.sessionKey);
    } catch { /* ignore */ }
  });

  api.on("session_end", (event, _ctx) => {
    try {
      const e = event as { sessionId: string; messageCount?: number };
      tracer.onSessionEnd(e.sessionId, e.messageCount);
      pruneOldSessions(db, config.max_sessions);
    } catch { /* ignore */ }
  });

  // ── Agent context (source metadata) ────────────────────────────────────

  api.on("before_agent_start", (event, ctx) => {
    try {
      const c = ctx as { sessionId?: string; sessionKey?: string; agentId?: string; trigger?: string; channelId?: string };
      if (!c.sessionId) return;
      tracer.setSessionSource(c.sessionId, {
        trigger: c.trigger,
        agentType: (!c.agentId || c.agentId === "main") ? "main" : "subagent",
        sessionKey: c.sessionKey,
        channel: c.channelId,
      });
    } catch { /* ignore */ }
  });

  api.on("message_received", (event, ctx) => {
    try {
      const e = event as { from: string; content: string };
      const c = ctx as { channelId?: string; sessionId?: string };
      if (c.sessionId) {
        tracer.setSessionSource(c.sessionId, {
          senderId: e.from,
          channel: c.channelId,
        });
      }
    } catch { /* ignore */ }
  });

  // ── LLM calls ──────────────────────────────────────────────────────────

  api.on("llm_input", (event, _ctx) => {
    try {
      const e = event as { runId: string; sessionId: string; provider: string; model: string };
      tracer.onLlmInput(e.runId, e.sessionId, e.model, e.provider);
    } catch { /* ignore */ }
  });

  api.on("llm_output", (event, _ctx) => {
    try {
      const e = event as {
        runId: string; sessionId: string; provider: string; model: string;
        usage?: { input?: number; output?: number; cacheRead?: number; cacheWrite?: number; total?: number };
      };
      tracer.onLlmOutput(e.runId, e.sessionId, e.model, e.provider, e.usage);
    } catch { /* ignore */ }
  });

  // ── Tool calls ──────────────────────────────────────────────────────────

  api.on("before_tool_call", (event, _ctx) => {
    try {
      const e = event as { toolName: string; params: Record<string, unknown>; runId?: string };
      tracer.onBeforeToolCall(e.toolName, e.runId, e.params);
    } catch { /* ignore */ }
  });

  api.on("after_tool_call", (event, ctx) => {
    try {
      const e = event as { toolName: string; params: Record<string, unknown>; runId?: string; error?: string };
      const c = ctx as { sessionId?: string };
      tracer.onAfterToolCall(e.toolName, e.runId, c.sessionId, e.params, e.error);
    } catch { /* ignore */ }
  });

  // ── Subagents ───────────────────────────────────────────────────────────

  api.on("subagent_spawned", (event, ctx) => {
    try {
      const e = event as { childSessionKey: string; agentId: string; mode: string; runId: string };
      const c = ctx as { sessionId?: string };
      tracer.onSubagentSpawned(e.childSessionKey, e.mode, e.runId, c.sessionId);
    } catch { /* ignore */ }
  });

  // ── Gateway startup verify ──────────────────────────────────────────────

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
