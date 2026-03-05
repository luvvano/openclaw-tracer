# Roadmap: OpenClaw Tracer

## Milestone: v1.0

**Goal:** Functional tracing plugin — tracks all request events, stores in SQLite, displays in Canvas.

## Phases

- [ ] **Phase 1: Foundation** — Plugin scaffold, SQLite setup, config loader. Plugin loads, DB created, config hot-reloaded.
- [ ] **Phase 2: Event Hooks** — All tracking hooks implemented. Sessions, LLM calls, tools, skills, subagents, commands tracked and written to DB.
- [ ] **Phase 3: Canvas UI** — HTTP route serving trace viewer. Session list + detail view with expandable event tree, filter bar, token/cost summary.

## Phase Details

### Phase 1: Foundation
**Goal**: Plugin loads, SQLite DB initialized, config working — zero crashes even if DB fails
**Requirements**: CORE-01, CORE-02, CORE-03, CORE-04, CFG-01, CFG-02, CFG-03
**Success Criteria**:
1. Plugin loads in OpenClaw without errors
2. `~/.openclaw/tracer.db` created on startup with correct schema
3. Config file created with defaults if missing, hot-reloaded per request
4. All DB operations wrapped in try/catch — plugin never takes down OpenClaw

### Phase 2: Event Hooks
**Goal**: All event types tracked and persisted to SQLite with source metadata
**Requirements**: TRACK-01, TRACK-02, TRACK-03, TRACK-04, TRACK-05, TRACK-06, TRACK-07, SRC-01, SRC-02, SRC-03, SRC-04
**Depends on**: Phase 1
**Success Criteria**:
1. A complete request produces rows in: sessions, llm_calls, tool_calls, events tables
2. Source fields populated: session_key, channel, sender_id, model, trigger, agent_type
3. Sensitive tool params masked when mask_sensitive=true
4. Each event type can be individually disabled via config

### Phase 3: Canvas UI
**Goal**: Visual trace viewer in Canvas — sessions list + drill-down detail view
**Requirements**: UI-01, UI-02, UI-03, UI-04, UI-05, UI-06, UI-07
**Depends on**: Phase 2
**Success Criteria**:
1. `/tracer show` opens Canvas with session list
2. Clicking a session shows full event tree (LLM calls + nested tool calls)
3. Each event shows: type, name, duration, tokens, status
4. Filter by event type works
5. Token/cost summary in session header
