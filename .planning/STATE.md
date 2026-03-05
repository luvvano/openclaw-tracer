# State: OpenClaw Tracer

## Current Position

Phase: 1 complete, starting Phase 2
Status: Foundation done — plugin scaffold, DB, config, Tracer skeleton all shipped
Last activity: 2026-03-05 — Phase 1 executed

## Progress

- [x] Phase 1: Foundation (`027180d`, `0f799f3`)
- [ ] Phase 2: Event Hooks
- [x] Phase 3: Canvas UI (`aa631a7`)

## Key Decisions

- Storage: SQLite (`better-sqlite3`, sync API, WAL mode)
- Display: Canvas via plugin HTTP route
- Config: `~/.openclaw/tracer-config.json` (not in plugin config to survive reinstalls)
- Skill tracking: detect from `before_agent_start` event.prompt pattern matching
- Tool args: log but mask sensitive keys (`token`, `key`, `password`, `secret`, `auth`, `credential`)
- Canvas trigger: on-demand via `/tracer show` command (not auto-opened)

## Tech Stack

- Language: TypeScript (ESM, same as GSD plugin pattern)
- DB: `better-sqlite3` (npm)
- Canvas: plugin HTTP route (`registerHttpRoute`) + `canvas.navigate(url)` from handler
- OpenClaw SDK hooks: before_agent_start, llm_input, llm_output, agent_end, before_tool_call, after_tool_call, session_start, session_end, subagent_spawning, subagent_spawned, message_received

## DB Schema (planned)

```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  session_key TEXT,
  channel TEXT,
  sender_id TEXT,
  model TEXT,
  provider TEXT,
  trigger TEXT,
  agent_type TEXT,
  started_at INTEGER,
  ended_at INTEGER,
  message_count INTEGER
);

CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT,
  run_id TEXT,
  type TEXT,       -- llm_call | tool_call | skill | command | subagent | hook
  name TEXT,
  started_at INTEGER,
  ended_at INTEGER,
  duration_ms INTEGER,
  status TEXT,     -- ok | error
  metadata TEXT    -- JSON: tokens, params, error message, etc.
);
```

## Blockers

None.
