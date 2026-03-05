import type { DatabaseSync } from "node:sqlite";
import type { TracerConfig } from "./config.js";

export interface PluginLogger {
  info: (msg: string) => void;
  warn: (msg: string) => void;
  error?: (msg: string) => void;
}

export class Tracer {
  constructor(
    private readonly db: DatabaseSync,
    private readonly config: TracerConfig,
    private readonly logger: PluginLogger
  ) {}

  // ── Session lifecycle ─────────────────────────────────────────────────────
  onSessionStart(_sessionId: string, _sessionKey?: string): void {
    // Phase 2: INSERT INTO sessions
  }

  onSessionEnd(_sessionId: string, _messageCount?: number): void {
    // Phase 2: UPDATE sessions SET ended_at, message_count
  }

  // ── LLM calls ─────────────────────────────────────────────────────────────
  onLlmInput(_runId: string, _sessionId: string, _model: string, _provider: string): void {
    // Phase 2: start timing for this runId
  }

  onLlmOutput(
    _runId: string,
    _sessionId: string,
    _model: string,
    _provider: string,
    _usage?: { input?: number; output?: number; total?: number }
  ): void {
    // Phase 2: INSERT INTO events type=llm_call with tokens
  }

  // ── Tool calls ────────────────────────────────────────────────────────────
  onBeforeToolCall(_toolName: string, _runId?: string, _params?: Record<string, unknown>): void {
    // Phase 2: start timing for this tool call
  }

  onAfterToolCall(_toolName: string, _runId?: string, _durationMs?: number, _error?: string): void {
    // Phase 2: INSERT INTO events type=tool_call
  }

  // ── Skills ────────────────────────────────────────────────────────────────
  onSkillDetected(_skillName: string, _sessionId?: string): void {
    // Phase 2: INSERT INTO events type=skill
  }

  // ── Subagents ─────────────────────────────────────────────────────────────
  onSubagentSpawned(_targetSessionKey: string, _kind: string): void {
    // Phase 2: INSERT INTO events type=subagent
  }

  // ── Commands ──────────────────────────────────────────────────────────────
  onCommandHit(_commandName: string, _sessionId?: string): void {
    // Phase 2: INSERT INTO events type=command
  }

  // ── Source context ────────────────────────────────────────────────────────
  setSessionSource(
    _sessionId: string,
    _opts: {
      channel?: string;
      senderId?: string;
      trigger?: string;
      agentType?: string;
      model?: string;
      provider?: string;
    }
  ): void {
    // Phase 2: UPDATE sessions SET channel, sender_id, trigger, etc.
  }
}
