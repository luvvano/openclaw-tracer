# Phase 1: Foundation — Context

**Gathered:** 2026-03-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Scaffold the plugin, initialize SQLite, load config. No event tracking yet — just the infrastructure that Phase 2 hooks will write to. Phase complete when: plugin loads in OpenClaw, `tracer.db` is created on startup, config is readable from `api.pluginConfig`, and DB write/read works end-to-end.
</domain>

<decisions>
## Implementation Decisions

### Module Structure
- Multi-file: `src/index.ts` (entry), `src/db.ts` (SQLite), `src/config.ts` (config loader), `src/tracer.ts` (hook orchestrator — skeleton in Phase 1, filled in Phase 2)
- Rationale: Phase 2 adds 8+ hooks, Phase 3 adds HTTP route — single file would be unmanageable

### SQLite Library
- Use `node:sqlite` (built-in, Node.js 22+) — confirmed available in OpenClaw's Node.js 22.22 runtime without flags
- No external dependency, sync API, WAL mode for performance
- API: `new DatabaseSync(path)` from `node:sqlite`

### Config
- Plugin config via `api.pluginConfig` (reads from `openclaw.json → plugins.entries.openclaw-tracer.config`)
- Config schema with defaults (all tracking enabled by default):
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
- Config loaded once at plugin init, re-read per request via a `getConfig()` helper (hot reload)

### DB Schema
- Two tables: `sessions` + `events` (normalized)
- `sessions`: id, session_key, channel, sender_id, model, provider, trigger, agent_type, started_at, ended_at, message_count
- `events`: id, session_id, run_id, type, name, started_at, ended_at, duration_ms, status, metadata (JSON text)
- Index: `events(session_id)`, `sessions(started_at DESC)`
- WAL mode + `PRAGMA journal_mode=WAL` on open

### Error Handling
- All DB operations in try/catch — errors logged via `api.logger.warn`, never thrown
- If DB can't be created (permissions etc.) — plugin still loads, tracking silently disabled

### Claude's Discretion
- Plugin ID/name in `openclaw.plugin.json` — use `openclaw-tracer`
- DB path: `~/.openclaw/tracer.db` (hardcoded, not configurable in v1.0)
- TypeScript config: extend from GSD plugin pattern (ESM, `"type": "module"`)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Patterns (from GSD plugin)
- Plugin entry: `export default function tracerPlugin(api: PluginContext): void`
- Logger: `api.logger.info/warn/error`
- Import pattern: `import type { PluginContext } from "openclaw/plugin-sdk/core"`
- `homedir()` from `node:os` for `~/.openclaw/tracer.db` path

### node:sqlite API
```typescript
import { DatabaseSync } from "node:sqlite";
const db = new DatabaseSync(path); // opens or creates
db.exec("PRAGMA journal_mode=WAL");
db.exec("CREATE TABLE IF NOT EXISTS ...");
const stmt = db.prepare("INSERT INTO events ...").run(values);
const rows = db.prepare("SELECT * FROM sessions ORDER BY started_at DESC LIMIT 20").all();
```

### openclaw.plugin.json structure (from GSD plugin)
```json
{
  "id": "openclaw-tracer",
  "name": "OpenClaw Tracer",
  "version": "0.1.0",
  "entry": "src/index.ts"
}
```
</code_context>

<specifics>
## Specific Requirements

- `node:sqlite` import — NOT `better-sqlite3`
- DB at `join(homedir(), ".openclaw", "tracer.db")` — created in `db.ts`, passed to tracer
- `getConfig()` in `config.ts` reads `api.pluginConfig` and merges with defaults
- `src/tracer.ts` exports a `Tracer` class with stub methods (`trackSession`, `trackEvent`) — wired up in Phase 2
- Phase 1 deliverable: plugin loads + DB schema created + config readable + one test write (insert dummy event on `gateway_start`, log confirmation)
</specifics>

<deferred>
## Deferred

- DB path configurability — Phase 1 hardcodes `~/.openclaw/tracer.db`
- Config hot-reload logic — Phase 2 (needed when hooks call `getConfig()`)
- Canvas HTTP route registration — Phase 3
</deferred>

---
*Phase: 01-foundation*
*Context gathered: 2026-03-05*
