# Requirements: OpenClaw Tracer

## v1.0 Requirements

### Core Infrastructure
- [ ] **CORE-01**: Plugin loads in OpenClaw without errors, registers all hooks
- [ ] **CORE-02**: SQLite DB created at `~/.openclaw/tracer.db` on first run (WAL mode)
- [ ] **CORE-03**: Config file at `~/.openclaw/tracer-config.json` with per-category toggles
- [ ] **CORE-04**: All DB writes wrapped in try/catch — plugin never crashes OpenClaw

### Event Tracking
- [ ] **TRACK-01**: Session lifecycle tracked (`session_start`, `session_end`) with: session_key, session_id, channel, sender_id, trigger, agent_type, started_at, ended_at, message_count
- [ ] **TRACK-02**: LLM calls tracked (`llm_input`, `llm_output`) with: run_id, provider, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, duration_ms
- [ ] **TRACK-03**: Tool calls tracked (`before_tool_call`, `after_tool_call`) with: tool_name, run_id, params_json (masked), result_summary, error, duration_ms
- [ ] **TRACK-04**: Skills loaded tracked via `before_agent_start` prompt inspection — detect `/gsd:*` or `gsd_*` patterns, skill name extracted and stored
- [ ] **TRACK-05**: Subagents tracked (`subagent_spawning`, `subagent_spawned`, `subagent_ended`) with: target_session_key, kind, run_id, duration_ms
- [ ] **TRACK-06**: Commands (registerCommand hits) tracked via `message_received` — detect `/cmd` pattern, command name stored
- [ ] **TRACK-07**: Hook firing itself tracked (which hooks ran, at what time) — configurable, off by default (high volume)

### Config
- [ ] **CFG-01**: `~/.openclaw/tracer-config.json` schema:
  ```json
  {
    "enabled": true,
    "track": {
      "sessions": true,
      "llm_calls": true,
      "tools": true,
      "tool_args": true,
      "skills": true,
      "subagents": true,
      "commands": true,
      "hooks": false
    },
    "mask_sensitive": true,
    "max_sessions": 500
  }
  ```
- [ ] **CFG-02**: Config hot-reloaded on each request (no restart required)
- [ ] **CFG-03**: `mask_sensitive: true` masks values of params whose keys contain: `token`, `key`, `password`, `secret`, `auth`, `credential`

### Canvas UI
- [ ] **UI-01**: Plugin registers HTTP route at `/tracer` serving interactive HTML trace viewer
- [ ] **UI-02**: `/tracer show` command opens Canvas to `http://localhost:{port}/__tracer__/`
- [ ] **UI-03**: Default view: list of recent sessions (last 20), sorted by time desc
- [ ] **UI-04**: Session detail view: expandable event tree — LLM calls → tool calls nested under their run_id
- [ ] **UI-05**: Each event shows: type icon, name, duration, token count (for LLM), status (ok/error)
- [ ] **UI-06**: Filter bar: by event type, by session, by date range
- [ ] **UI-07**: Session summary header: total tokens, total cost estimate, duration, channel, model

### Sources
- [ ] **SRC-01**: Every stored event includes: session_key, channel, sender_id (where available)
- [ ] **SRC-02**: LLM events include: provider, model, run_id
- [ ] **SRC-03**: `agent_type` field: "main" for primary session, "subagent" for spawned agents
- [ ] **SRC-04**: `trigger` field: "user" | "heartbeat" | "cron" | "memory"

## v2 Requirements (Deferred)

- Real-time Canvas updates (WebSocket push as events arrive)
- Cost breakdown by provider (pricing table)
- Anomaly detection (flag unusually high token usage)
- Export to CSV/JSON
- Per-skill aggregate stats (avg tokens, avg duration)
- ClawHub distribution

## Traceability

| Req | Phase | Status |
|-----|-------|--------|
| CORE-01..04 | Phase 1 | Pending |
| TRACK-01..07 | Phase 2 | Pending |
| CFG-01..03 | Phase 1 | Pending |
| UI-01..07 | Phase 3 | Pending |
| SRC-01..04 | Phase 2 | Pending |
