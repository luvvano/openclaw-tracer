# OpenClaw Tracer

## What This Is

An OpenClaw plugin that provides full observability for every request. Tracks which skills, tools, hooks, and commands are activated per session, with timing and token data. Displayed in the OpenClaw Canvas UI as a live trace view.

## Core Value

When something unexpected happens in OpenClaw — a wrong skill fires, a tool is called unexpectedly, costs spike — you open Canvas and instantly see the full execution trace: what ran, in what order, how long it took, and how many tokens it used. Everything is persisted in SQLite so you can compare sessions over time.

## Requirements

### v1.0

- [ ] OpenClaw plugin (`src/index.ts`) that hooks into all SDK events
- [ ] Tracks per request: skills loaded, tools called, hooks fired, commands hit, timing, tokens/cost
- [ ] SQLite storage at `~/.openclaw/tracer.db` — all sessions persisted
- [ ] Canvas UI — on-demand trace viewer (`/tracer show`) with expandable event tree
- [ ] Config at `~/.openclaw/tracer-config.json` — toggle each event type on/off
- [ ] Source metadata in every trace: session_key, channel, sender_id, model, trigger type, agent type (main/subagent)

## Context

- **SDK hooks available:** `before_agent_start`, `llm_input`, `llm_output`, `agent_end`, `before_tool_call`, `after_tool_call`, `session_start`, `session_end`, `subagent_spawning`, `subagent_spawned`, `message_received`, `before_model_resolve`
- **Token data:** `llm_output` exposes `usage: { input, output, cacheRead, cacheWrite, total }`
- **Tool data:** `before_tool_call` / `after_tool_call` expose `toolName`, `params`, `result`, `runId`
- **Skill tracking:** Skills are invoked as messages to the LLM — track via `before_agent_start` + prompt inspection or `before_prompt_build`
- **Source data available:** `sessionKey`, `sessionId`, `channelId`, `agentId`, `trigger` (user/heartbeat/cron/memory)
- **Storage:** `better-sqlite3` (sync, fast, works in Node.js without async complexity)
- **Canvas:** Plugin registers HTTP route that serves the trace UI; `canvas.present(url)` shows it

## Key Decisions

| Decision | Rationale |
|---|---|
| SQLite via better-sqlite3 | Sync API, no async overhead in hooks, persistent across sessions |
| Canvas for display | Native OpenClaw UI, interactive, no external dependency |
| Config per event type | User controls overhead — can disable tool arg logging if privacy concern |
| Tool args: logged but sensitive fields masked | `token`, `key`, `password`, `secret` field values → `***` |
| On-demand view (`/tracer show`) | Not auto-opened on every request — only when user wants to inspect |
| Skill tracking via prompt inspection | No dedicated hook for skill dispatch; detect from `before_agent_start` prompt |

## Constraints

- Must not slow down requests — all DB writes synchronous but non-blocking (SQLite WAL mode)
- Must not crash OpenClaw on write errors — wrap all DB operations in try/catch
- Privacy: mask sensitive tool params before storing
- Plugin installable via manual copy to `~/.openclaw/extensions/` or ClawHub

## Sources Tracked per Trace

| Field | Source |
|---|---|
| `session_key` | `ctx.sessionKey` from all hooks |
| `channel` | `ctx.channelId` from message_received / PluginHookMessageContext |
| `sender_id` | `event.from` in message_received |
| `model` | `event.model` in llm_input/llm_output |
| `provider` | `event.provider` in llm_input |
| `trigger` | `ctx.trigger` in before_agent_start (user/heartbeat/cron/memory) |
| `agent_type` | `ctx.agentId` — main session vs subagent |
| `run_id` | `event.runId` — links tool calls to LLM invocation |

---
*Last updated: 2026-03-05 — Initial project setup*
