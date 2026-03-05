import type { PluginContext } from "openclaw/plugin-sdk/core";
import type { IncomingMessage, ServerResponse } from "node:http";
import { initDb, pruneOldSessions } from "./db.js";
import { getConfig } from "./config.js";
import { Tracer } from "./tracer.js";
import { buildHtml } from "./ui.js";

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

  // ── Phase 3: Canvas UI ──────────────────────────────────────────────────

  const port = (api.config as Record<string, unknown>).port as number ?? 18789;
  const tracerUrl = "http://localhost:" + port + "/__tracer__/";

  // JSON data endpoint
  api.registerHttpRoute({
    path: "/__tracer__/api",
    auth: "gateway",
    match: "exact",
    handler: (_req: IncomingMessage, res: ServerResponse) => {
      try {
        const sessions = db.prepare("SELECT * FROM sessions ORDER BY started_at DESC LIMIT 100").all();
        const events = db.prepare("SELECT * FROM events ORDER BY started_at ASC").all();
        res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
        res.end(JSON.stringify({ sessions, events }));
      } catch (e) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: String(e) }));
      }
    },
  });

  // HTML UI route
  api.registerHttpRoute({
    path: "/__tracer__",
    auth: "gateway",
    match: "prefix",
    handler: (_req: IncomingMessage, res: ServerResponse) => {
      try {
        const sessions = db.prepare("SELECT * FROM sessions ORDER BY started_at DESC LIMIT 50").all() as Parameters<typeof buildHtml>[0];
        const events = db.prepare("SELECT * FROM events ORDER BY started_at ASC").all() as Parameters<typeof buildHtml>[1];
        const html = buildHtml(sessions, events);
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html);
      } catch (e) {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("Tracer error: " + String(e));
      }
    },
  });

  // tracer_show command
  api.registerCommand({
    name: "tracer_show",
    description: "Open OpenClaw Tracer in browser",
    acceptsArgs: false,
    requireAuth: false,
    handler() {
      try {
        const sessionCount = (db.prepare("SELECT COUNT(*) as n FROM sessions").get() as { n: number }).n;
        const eventCount = (db.prepare("SELECT COUNT(*) as n FROM events").get() as { n: number }).n;
        const tokenRow = db.prepare(
          "SELECT SUM(CAST(json_extract(metadata,'$.total_tokens') AS INTEGER)) as t FROM events WHERE type='llm_call'"
        ).get() as { t: number | null };
        const totalTokens = tokenRow?.t ?? 0;
        return {
          text: "**OpenClaw Tracer**\n\n" +
            sessionCount + " sessions · " + eventCount + " events · " + totalTokens + " tokens\n\n" +
            tracerUrl,
        };
      } catch {
        return { text: "Open Tracer: " + tracerUrl };
      }
    },
  });

  api.logger.info("[tracer] Canvas UI registered at " + tracerUrl);

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
