interface SessionRow {
  id: string;
  session_key: string | null;
  channel: string | null;
  sender_id: string | null;
  model: string | null;
  trigger: string | null;
  agent_type: string | null;
  started_at: number;
  ended_at: number | null;
  message_count: number;
}

interface EventRow {
  id: number;
  session_id: string | null;
  run_id: string | null;
  type: string;
  name: string;
  started_at: number;
  ended_at: number | null;
  duration_ms: number | null;
  status: string;
  metadata: string | null;
}

export function buildHtml(sessions: SessionRow[], events: EventRow[]): string {
  const sessionsJson = JSON.stringify(sessions);
  const eventsJson = JSON.stringify(events);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>OpenClaw Tracer</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", monospace; background: #0f1117; color: #e2e8f0; min-height: 100vh; }
  header { background: #1a1d2e; border-bottom: 1px solid #2d3748; padding: 12px 20px; display: flex; align-items: center; gap: 12px; }
  header h1 { font-size: 16px; font-weight: 600; color: #a78bfa; }
  header .subtitle { font-size: 12px; color: #64748b; }
  .layout { display: flex; height: calc(100vh - 49px); }
  .sessions { width: 320px; border-right: 1px solid #2d3748; overflow-y: auto; flex-shrink: 0; }
  .sessions h2 { font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; padding: 12px 16px 8px; }
  .session-item { padding: 10px 16px; border-bottom: 1px solid #1e2330; cursor: pointer; transition: background 0.1s; }
  .session-item:hover { background: #1a1d2e; }
  .session-item.active { background: #1e1b4b; border-left: 3px solid #7c3aed; }
  .session-key { font-size: 12px; font-weight: 500; color: #c4b5fd; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .session-meta { font-size: 11px; color: #64748b; margin-top: 3px; display: flex; gap: 8px; flex-wrap: wrap; }
  .detail { flex: 1; overflow-y: auto; padding: 16px; }
  .detail h2 { font-size: 13px; font-weight: 600; color: #94a3b8; margin-bottom: 12px; }
  .session-header { background: #1a1d2e; border-radius: 8px; padding: 14px; margin-bottom: 16px; }
  .session-header .title { font-size: 14px; font-weight: 600; color: #e2e8f0; margin-bottom: 8px; }
  .session-header .attrs { display: flex; flex-wrap: wrap; gap: 8px; }
  .attr { background: #0f1117; border: 1px solid #2d3748; border-radius: 4px; padding: 3px 8px; font-size: 11px; color: #94a3b8; }
  .attr span { color: #e2e8f0; }
  .events-list { display: flex; flex-direction: column; gap: 4px; }
  .event-item { background: #1a1d2e; border-radius: 6px; padding: 8px 12px; display: flex; align-items: center; gap: 10px; }
  .event-item.error { border-left: 3px solid #ef4444; }
  .event-icon { font-size: 14px; width: 20px; text-align: center; flex-shrink: 0; }
  .event-name { flex: 1; font-size: 12px; color: #e2e8f0; font-family: monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .event-dur { font-size: 11px; color: #64748b; min-width: 55px; text-align: right; flex-shrink: 0; }
  .event-tokens { font-size: 11px; color: #a78bfa; min-width: 70px; text-align: right; flex-shrink: 0; }
  .empty { color: #4b5563; font-size: 13px; padding: 32px; text-align: center; }
  .refresh-btn { margin-left: auto; background: #7c3aed; border: none; color: white; padding: 5px 12px; border-radius: 4px; font-size: 12px; cursor: pointer; }
  .refresh-btn:hover { background: #6d28d9; }
  .total-bar { font-size: 11px; color: #64748b; padding: 8px 16px; border-top: 1px solid #1e2330; }
</style>
</head>
<body>
<header>
  <h1>&#x26A1; OpenClaw Tracer</h1>
  <span class="subtitle" id="subtitle">Loading...</span>
  <button class="refresh-btn" onclick="loadData()">&#x21BB; Refresh</button>
</header>
<div class="layout">
  <div class="sessions">
    <h2>Sessions</h2>
    <div id="sessions-list"></div>
    <div class="total-bar" id="total-bar"></div>
  </div>
  <div class="detail" id="detail">
    <div class="empty">Select a session to view its trace</div>
  </div>
</div>
<script>
var allSessions = ${sessionsJson};
var allEvents = ${eventsJson};
var selectedId = null;

var TYPE_ICONS = { llm_call: '&#x1F916;', tool_call: '&#x1F527;', command: '&#x1F4AC;', subagent: '&#x1F517;', skill: '&#x1F4DA;', system: '&#x2699;&#xFE0F;' };

function fmt(ms) {
  if (ms == null) return '?';
  if (ms < 1000) return ms + 'ms';
  return (ms / 1000).toFixed(1) + 's';
}

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function renderSessions() {
  var el = document.getElementById('sessions-list');
  if (!allSessions.length) { el.innerHTML = '<div class="empty">No sessions yet</div>'; return; }
  el.innerHTML = allSessions.map(function(s) {
    var dur = s.ended_at ? fmt(s.ended_at - s.started_at) : 'active';
    var evCount = allEvents.filter(function(e) { return e.session_id === s.id; }).length;
    var key = s.session_key || s.id.slice(0, 8);
    return '<div class="session-item' + (s.id === selectedId ? ' active' : '') + '" onclick="selectSession(' + JSON.stringify(s.id) + ')">' +
      '<div class="session-key">' + esc(key) + '</div>' +
      '<div class="session-meta">' +
        '<span>' + esc(s.channel || '?') + '</span>' +
        '<span>' + esc(s.model ? s.model.split('/').pop().slice(0, 20) : '?') + '</span>' +
        '<span>' + dur + '</span>' +
        '<span>' + evCount + ' ev</span>' +
      '</div>' +
    '</div>';
  }).join('');
  document.getElementById('total-bar').textContent = allSessions.length + ' sessions | ' + allEvents.length + ' events';
}

function selectSession(id) {
  selectedId = id;
  renderSessions();
  var session = allSessions.find(function(s) { return s.id === id; });
  var events = allEvents.filter(function(e) { return e.session_id === id; });
  var detail = document.getElementById('detail');
  if (!session) { detail.innerHTML = '<div class="empty">Session not found</div>'; return; }

  var dur = session.ended_at ? fmt(session.ended_at - session.started_at) : 'active';
  var totalTokens = events.reduce(function(acc, e) {
    if (e.metadata) { try { var m = JSON.parse(e.metadata); return acc + (m.total_tokens || 0); } catch(ex) {} }
    return acc;
  }, 0);

  var attrs = [
    ['Channel', session.channel || '?'],
    ['Model', session.model ? session.model.split('/').pop() : '?'],
    ['Trigger', session.trigger || '?'],
    ['Agent', session.agent_type || '?'],
    ['Duration', dur],
    ['Events', events.length],
    ['Tokens', totalTokens || '?'],
  ];

  var evHtml = events.length === 0
    ? '<div class="empty">No events for this session</div>'
    : '<div class="events-list">' + events.map(function(e) {
        var icon = TYPE_ICONS[e.type] || '&#x1F4CC;';
        var tokens = '';
        if (e.metadata) { try { var m = JSON.parse(e.metadata); if (m.total_tokens) tokens = m.total_tokens + ' tok'; } catch(ex) {} }
        return '<div class="event-item' + (e.status === 'error' ? ' error' : '') + '">' +
          '<span class="event-icon">' + icon + '</span>' +
          '<span class="event-name">' + esc(e.name) + '</span>' +
          '<span class="event-dur">' + fmt(e.duration_ms) + '</span>' +
          '<span class="event-tokens">' + esc(tokens) + '</span>' +
        '</div>';
      }).join('') + '</div>';

  detail.innerHTML =
    '<h2>Session Trace</h2>' +
    '<div class="session-header">' +
      '<div class="title">' + esc(session.session_key || session.id) + '</div>' +
      '<div class="attrs">' + attrs.map(function(a) { return '<div class="attr">' + esc(a[0]) + ': <span>' + esc(a[1]) + '</span></div>'; }).join('') + '</div>' +
    '</div>' +
    evHtml;
}

function loadData() {
  fetch('/__tracer__/api')
    .then(function(r) { return r.json(); })
    .then(function(d) {
      allSessions = d.sessions || [];
      allEvents = d.events || [];
      document.getElementById('subtitle').textContent = allSessions.length + ' sessions | ' + allEvents.length + ' events';
      if (selectedId && allSessions.find(function(s) { return s.id === selectedId; })) selectSession(selectedId);
      else renderSessions();
    })
    .catch(function(e) {
      document.getElementById('subtitle').textContent = 'Error: ' + e.message;
    });
}

document.getElementById('subtitle').textContent = allSessions.length + ' sessions | ' + allEvents.length + ' events';
renderSessions();
</script>
</body>
</html>`;
}
