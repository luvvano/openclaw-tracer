# Phase 2: Event Hooks — Context

**Gathered:** 2026-03-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire all SDK hooks into the Tracer class. Phase 1 created the skeleton — now fill it. Also ship `src/client.ts` (tracerHit helper) and integrate it into the GSD plugin. Phase complete when: a real request produces rows in `sessions` and `events` tables, source metadata populated, tool calls timed, LLM tokens stored.
</domain>

<decisions>
## Implementation Decisions

### Tool call timing (Q1 → A)
- Key: `runId + toolName` → `Map<string, number>` in Tracer instance (start timestamps)
- Format: `${runId ?? "noreid"}::${toolName}`
- Simple, handles 99% of cases; parallel same-tool same-run edge case accepted

### Skill detection (Q2 → B)
- Do NOT track skills as separate events — no reliable SDK hook for skill dispatch
- Skills show up implicitly through LLM calls (model, prompt patterns)
- Remove `onSkillDetected` from Tracer — keep stub but mark as no-op for v1.0
- Deferred to v2 (would need prompt inspection heuristics)

### Session IDs (Q3 → store both)
- `sessions.id` = `sessionId` (ephemeral UUID, primary key)
- `sessions.session_key` = `sessionKey` (stable slug, for Canvas grouping)
- Source: `ctx.sessionKey` + `ctx.sessionId` from PluginHookAgentContext

### Command tracking (Q4 → B via tracerHit)
- `src/client.ts` — lightweight standalone helper, opens DB via `node:sqlite`
- `tracerHit(type, name, sessionId?)` — sync write to `~/.openclaw/tracer.db`
- No-op + silent catch if DB doesn't exist
- GSD plugin (`src/index.ts`) imports `tracerHit` and calls it at top of each `registerCommand` handler (9 handlers)
- Phase 2 delivers: `client.ts` + GSD plugin integration

### In-memory timing map
- `Tracer` holds two Maps:
  - `llmTimings: Map<string, number>` — key: `runId`, value: `Date.now()` at llm_input
  - `toolTimings: Map<string, number>` — key: `${runId}::${toolName}`, value: `Date.now()` at before_tool_call
- Maps cleaned up in `session_end` (drop entries for that sessionId)

### Source metadata enrichment
- `message_received` → capture `event.from` (sender_id), `ctx.channelId`
- `before_agent_start` / `llm_input` → capture `ctx.trigger`, `ctx.sessionId`, `ctx.sessionKey`, `ctx.agentId`
- `agent_type`: "main" if `agentId === "main"` or undefined, else "subagent"
- Pattern: store in `sessionSourceMap: Map<sessionId, SourceInfo>` in Tracer, flush to DB on `session_end`

### Hook registration in src/index.ts
- All hooks registered in Phase 2 section of `src/index.ts`
- Hooks: `session_start`, `session_end`, `message_received`, `before_agent_start`, `llm_input`, `llm_output`, `before_tool_call`, `after_tool_call`, `subagent_spawned`, `subagent_ended`
- Each hook calls corresponding Tracer method, wrapped in try/catch
</decisions>

<code_context>
## SDK Hook Signatures (confirmed)

```typescript
// session_start
api.on("session_start", (event: { sessionId: string; sessionKey?: string }, ctx) => {})

// llm_input  
api.on("llm_input", (event: { runId: string; sessionId: string; provider: string; model: string }, ctx) => {})

// llm_output
api.on("llm_output", (event: { runId: string; sessionId: string; provider: string; model: string;
  usage?: { input?: number; output?: number; cacheRead?: number; cacheWrite?: number; total?: number } }, ctx) => {})

// before_tool_call
api.on("before_tool_call", (event: { toolName: string; params: Record<string, unknown>; runId?: string; toolCallId?: string }, ctx) => {})

// after_tool_call
api.on("after_tool_call", (event: { toolName: string; params: Record<string, unknown>; runId?: string; result?: unknown; error?: string }, ctx) => {})

// before_agent_start
api.on("before_agent_start", (event: { prompt: string }, ctx: PluginHookAgentContext) => {})
// ctx has: agentId, sessionKey, sessionId, trigger, channelId

// message_received
api.on("message_received", (event: { from: string; content: string }, ctx: { channelId: string }) => {})

// subagent_spawned
api.on("subagent_spawned", (event: { childSessionKey: string; agentId: string; label?: string; mode: string; runId: string }, ctx) => {})
```

## src/client.ts Interface
```typescript
// Standalone, zero deps except node:sqlite
export function tracerHit(
  type: "command" | "skill" | "custom",
  name: string,
  sessionId?: string
): void
```
Opens DB at `~/.openclaw/tracer.db`. If DB missing or error → silent no-op.

## GSD Plugin Integration Points
9 handlers in `src/index.ts`:
gsd_status, gsd_progress, gsd_settings, gsd_help, gsd_health,
gsd_cleanup, gsd_update, gsd_project_list, gsd_set_project
→ add `tracerHit("command", "<name>", (ctx as any).sessionId)` at top of each
</code_context>

<specifics>
## Phase 2 Deliverables

1. `src/tracer.ts` — fill all stub methods (except onSkillDetected = kept as no-op)
2. `src/index.ts` — register all hooks, call tracer methods
3. `src/client.ts` — standalone tracerHit() helper
4. GSD plugin `src/index.ts` — import tracerHit, add to all 9 handlers

## Verification
- Make a `/gsd_status` request → `SELECT * FROM events WHERE type='command'` returns 1 row
- Make a request with LLM → `SELECT * FROM events WHERE type='llm_call'` returns rows with tokens
- `SELECT * FROM sessions` returns the session with channel, sender_id populated
</specifics>

<deferred>
## Deferred to Phase 3
- Canvas HTTP route
- tracerHit for SKILL.md workflow dispatches (skill type events)
- Tool result content in metadata (currently just error/ok status)
</deferred>

---
*Phase: 02-event-hooks*
*Context gathered: 2026-03-05*
