import type { DatabaseSync } from "node:sqlite";
import type { TracerConfig } from "./config.js";
import { maskSensitiveParams } from "./config.js";

export interface PluginLogger {
  info: (msg: string) => void;
  warn: (msg: string) => void;
  error?: (msg: string) => void;
}

interface SourceInfo {
  channel?: string;
  senderId?: string;
  trigger?: string;
  agentType?: string;
  model?: string;
  provider?: string;
  sessionKey?: string;
}

export class Tracer {
  private llmTimings = new Map<string, number>();
  private toolTimings = new Map<string, number>();
  private sessionSourceMap = new Map<string, SourceInfo>();

  constructor(
    private readonly db: DatabaseSync,
    private readonly config: TracerConfig,
    private readonly logger: PluginLogger
  ) {}

  // ── Session lifecycle ─────────────────────────────────────────────────────

  onSessionStart(sessionId: string, sessionKey?: string): void {
    if (!this.config.track.sessions) return;
    try {
      this.db.prepare(
        `INSERT OR IGNORE INTO sessions (id, session_key, started_at) VALUES (?, ?, ?)`
      ).run(sessionId, sessionKey ?? null, Date.now());
    } catch (e) {
      this.logger.warn("[tracer] onSessionStart error: " + String(e).slice(0, 80));
    }
  }

  onSessionEnd(sessionId: string, messageCount?: number): void {
    if (!this.config.track.sessions) return;
    try {
      this.db.prepare(
        `UPDATE sessions SET ended_at = ?, message_count = ? WHERE id = ?`
      ).run(Date.now(), messageCount ?? 0, sessionId);
      // Flush source metadata
      const src = this.sessionSourceMap.get(sessionId);
      if (src) {
        this.db.prepare(
          `UPDATE sessions SET channel=?, sender_id=?, model=?, provider=?, trigger=?, agent_type=? WHERE id=?`
        ).run(
          src.channel ?? null, src.senderId ?? null,
          src.model ?? null, src.provider ?? null,
          src.trigger ?? null, src.agentType ?? null,
          sessionId
        );
        this.sessionSourceMap.delete(sessionId);
      }
      // Clean up timing maps for this run
      for (const k of this.llmTimings.keys()) {
        if (k.startsWith(sessionId)) this.llmTimings.delete(k);
      }
    } catch (e) {
      this.logger.warn("[tracer] onSessionEnd error: " + String(e).slice(0, 80));
    }
  }

  // ── LLM calls ─────────────────────────────────────────────────────────────

  onLlmInput(runId: string, sessionId: string, model: string, provider: string): void {
    if (!this.config.track.llm_calls) return;
    this.llmTimings.set(runId, Date.now());
    const src = this.sessionSourceMap.get(sessionId) ?? {};
    src.model = model;
    src.provider = provider;
    this.sessionSourceMap.set(sessionId, src);
  }

  onLlmOutput(
    runId: string,
    sessionId: string,
    model: string,
    provider: string,
    usage?: { input?: number; output?: number; cacheRead?: number; cacheWrite?: number; total?: number }
  ): void {
    if (!this.config.track.llm_calls) return;
    try {
      const start = this.llmTimings.get(runId);
      const now = Date.now();
      const durationMs = start ? now - start : null;
      this.llmTimings.delete(runId);

      const metadata = JSON.stringify({
        input_tokens: usage?.input ?? null,
        output_tokens: usage?.output ?? null,
        cache_read: usage?.cacheRead ?? null,
        cache_write: usage?.cacheWrite ?? null,
        total_tokens: usage?.total ?? null,
        model,
        provider,
      });

      this.db.prepare(
        `INSERT INTO events (session_id, run_id, type, name, started_at, ended_at, duration_ms, status, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(sessionId, runId, "llm_call", model, start ?? now, now, durationMs, "ok", metadata);
    } catch (e) {
      this.logger.warn("[tracer] onLlmOutput error: " + String(e).slice(0, 80));
    }
  }

  // ── Tool calls ────────────────────────────────────────────────────────────

  onBeforeToolCall(toolName: string, runId?: string, _params?: Record<string, unknown>): void {
    if (!this.config.track.tools) return;
    const key = (runId ?? "norun") + "::" + toolName;
    this.toolTimings.set(key, Date.now());
  }

  onAfterToolCall(
    toolName: string,
    runId?: string,
    sessionId?: string,
    params?: Record<string, unknown>,
    error?: string
  ): void {
    if (!this.config.track.tools) return;
    try {
      const key = (runId ?? "norun") + "::" + toolName;
      const start = this.toolTimings.get(key);
      const now = Date.now();
      const durationMs = start ? now - start : null;
      this.toolTimings.delete(key);

      let maskedParams: Record<string, unknown> | null = null;
      if (this.config.track.tool_args && params) {
        maskedParams = this.config.mask_sensitive ? maskSensitiveParams(params) : params;
      }

      const metadata = JSON.stringify({
        params: maskedParams,
        error: error ?? null,
      });

      this.db.prepare(
        `INSERT INTO events (session_id, run_id, type, name, started_at, ended_at, duration_ms, status, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        sessionId ?? null, runId ?? null, "tool_call", toolName,
        start ?? now, now, durationMs,
        error ? "error" : "ok",
        metadata
      );
    } catch (e) {
      this.logger.warn("[tracer] onAfterToolCall error: " + String(e).slice(0, 80));
    }
  }

  // ── Skills (no-op in v1.0) ────────────────────────────────────────────────

  onSkillDetected(_skillName: string, _sessionId?: string): void {
    // Deferred to v2 — no reliable SDK hook for skill dispatch
  }

  // ── Subagents ─────────────────────────────────────────────────────────────

  onSubagentSpawned(childSessionKey: string, kind: string, runId?: string, parentSessionId?: string): void {
    if (!this.config.track.subagents) return;
    try {
      const metadata = JSON.stringify({ child_session_key: childSessionKey, kind });
      this.db.prepare(
        `INSERT INTO events (session_id, run_id, type, name, started_at, status, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(parentSessionId ?? null, runId ?? null, "subagent", childSessionKey, Date.now(), "ok", metadata);
    } catch (e) {
      this.logger.warn("[tracer] onSubagentSpawned error: " + String(e).slice(0, 80));
    }
  }

  // ── Commands ──────────────────────────────────────────────────────────────

  onCommandHit(commandName: string, sessionId?: string): void {
    if (!this.config.track.commands) return;
    try {
      this.db.prepare(
        `INSERT INTO events (session_id, type, name, started_at, status) VALUES (?, ?, ?, ?, ?)`
      ).run(sessionId ?? null, "command", commandName, Date.now(), "ok");
    } catch (e) {
      this.logger.warn("[tracer] onCommandHit error: " + String(e).slice(0, 80));
    }
  }

  // ── Source context ────────────────────────────────────────────────────────

  setSessionSource(
    sessionId: string,
    opts: {
      channel?: string;
      senderId?: string;
      trigger?: string;
      agentType?: string;
      model?: string;
      provider?: string;
      sessionKey?: string;
    }
  ): void {
    const existing = this.sessionSourceMap.get(sessionId) ?? {};
    this.sessionSourceMap.set(sessionId, { ...existing, ...opts });
  }
}
