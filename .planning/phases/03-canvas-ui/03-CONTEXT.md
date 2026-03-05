# Phase 3: Canvas UI — Context

**Gathered:** 2026-03-05
**Status:** Ready for planning

<domain>
Plugin registers an HTTP route that serves a static HTML trace viewer. `/tracer show` command returns a Telegram inline button with the URL. No WebSocket/live updates — on-demand snapshot.
</domain>

<decisions>
- **HTTP route:** `api.registerHttpRoute({ path: "/__tracer__", auth: "gateway", match: "prefix" })`
- **URL:** `http://localhost:18789/__tracer__/` (port from openclaw.json)
- **Trigger:** `gsd_trace` command (already exists) returns inline button + stats; new `tracer_show` command opens Canvas URL
- **Display:** Session list (last 20) → click session → event tree (LLM calls + nested tool calls)
- **Canvas open:** Return `{ text: "...", url: "http://localhost:18789/__tracer__/" }` from handler — OpenClaw Canvas picks it up
- **UI stack:** Vanilla HTML+CSS+JS, single-file template string in `src/ui.ts`, no build step
- **Port:** Read from `~/.openclaw/openclaw.json → port` (default 18789)
- **Auth:** `auth: "gateway"` — local only, no external exposure
- **Data endpoint:** Separate route `/__tracer__/api/data` returns JSON { sessions, events }
</decisions>

<code_context>
## SDK: registerHttpRoute

```typescript
api.registerHttpRoute({
  path: "/__tracer__",
  auth: "gateway",
  match: "prefix",
  handler: (req: IncomingMessage, res: ServerResponse) => {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(htmlContent);
  },
});
```

## Canvas open from registerCommand
Return `{ text: "message" }` plus separately call canvas.present — OR use Telegram inline button pointing to local URL.
Simplest: return `{ text: "...\n\nOpen: http://localhost:18789/__tracer__/" }` — user clicks link.

## Port detection
```typescript
const port = (api.config as Record<string,unknown>).port as number ?? 18789;
```
</code_context>

<specifics>
- `src/ui.ts` — exports `buildHtml(sessions, events)` returning full HTML string
- `src/index.ts` — register 2 routes: `/__tracer__/` (HTML) + `/__tracer__/api` (JSON)
- `gsd_trace` command already shows recent events in Telegram — keep as is
- Add `/tracer_show` registerCommand that returns the URL as clickable text + summary
- HTML page: session list on left, event tree on right (flexbox), vanilla JS click handler
</specifics>
