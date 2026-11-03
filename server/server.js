// Signaling server: every client registers with its permanent ID and
// messages are relayed by ID. The server never sees video, only signaling.
const http = require('http');
const { timingSafeEqual } = require('node:crypto');
const { WebSocketServer } = require('ws');
const { isOfficeAddress } = require('./network');

const PORT = process.env.PORT || 3001;
const accessKey = Buffer.from(process.env.JIRIDESK_ACCESS_KEY || '');
const { TURN_URL, TURN_USERNAME, TURN_PASSWORD } = process.env;
if ((process.env.RENDER === 'true' && !accessKey.length) || (accessKey.length && accessKey.length < 32) ||
    ((TURN_URL || TURN_USERNAME || TURN_PASSWORD) &&
     !(accessKey.length && /^turns?:[^\s]+$/.test(TURN_URL || '') && TURN_USERNAME && TURN_PASSWORD))) {
  throw new Error('Configure a 32-character access key and all three TURN settings for private relay.');
}
const iceServers = TURN_URL ? [{ urls: TURN_URL, username: TURN_USERNAME, credential: TURN_PASSWORD }] : undefined;
const { CF_TURN_KEY_ID, CF_TURN_API_TOKEN } = process.env;
const cloudflareTurn = Boolean(CF_TURN_KEY_ID || CF_TURN_API_TOKEN);
if (cloudflareTurn && !(accessKey.length && CF_TURN_KEY_ID && CF_TURN_API_TOKEN && !iceServers)) {
  throw new Error('Cloudflare TURN requires a private access key and both Cloudflare settings, without static TURN settings.');
}
async function relaySettings() {
  if (!cloudflareTurn) return iceServers;
  const url = 'https://rtc.live.cloudflare.com/v1/turn/keys/' + encodeURIComponent(CF_TURN_KEY_ID) + '/credentials/generate-ice-servers';
  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + CF_TURN_API_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ttl: 86400 }),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error('TURN credential request failed');
  const result = await response.json();
  if (!Array.isArray(result.iceServers) || !result.iceServers.length) throw new Error('Missing TURN credentials');
  return result.iceServers;
}
const clients = new Map(); // id -> ws
const RELAY = new Set(['connect-request', 'accept', 'reject', 'offer', 'answer', 'ice', 'bye']);
const MAX_REQUESTS_PER_MIN = 10; // per connection, slows down password guessing

const server = http.createServer((_req, res) => { res.writeHead(200); res.end('ok'); });
const wss = new WebSocketServer({ server, maxPayload: 64 * 1024 });

const send = (ws, msg) => ws && ws.readyState === 1 && ws.send(JSON.stringify(msg));

// Tells every office device which others are open. Servers with an access key are internet-facing and never list devices.
function announceDevices() {
  const office = [...clients.values()].filter((c) => c.office);
  for (const c of office) {
    send(c, { type: 'discovered', devices: office.filter((o) => o !== c).map((o) => ({ id: o.id, name: o.name })) });
  }
}

// Clears connections left behind when a device changes networks, so its ID can register again.
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 15000);

wss.on('connection', (ws, req) => {
  ws.office = !accessKey.length && process.env.RENDER !== 'true' && isOfficeAddress(req.socket.remoteAddress);
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  // Without a listener, one bad connection (an oversized message, say) would crash the whole server.
  ws.on('error', (err) => { console.warn(`Connection error: ${err.message}`); ws.terminate(); });
  ws.reqTimes = [];
  let refreshTimer;
  let relayPending = false;
  async function sendRelaySettings() {
    if (relayPending) return;
    relayPending = true;
    try {
      send(ws, { type: 'ice-config', iceServers: await relaySettings() });
    } catch {
      console.warn('Cloudflare TURN credentials unavailable; direct connections remain available.');
    } finally {
      relayPending = false;
    }
  }

  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }

    if (!m || typeof m !== 'object') return;
    if (m.type === 'register') {
      const suppliedKey = Buffer.from(typeof m.accessKey === 'string' ? m.accessKey : '');
      if (accessKey.length && (suppliedKey.length !== accessKey.length || !timingSafeEqual(suppliedKey, accessKey))) {
        return send(ws, { type: 'error', code: 'access-denied', message: 'Invalid server access key.' });
      }
      if (ws.id) return;
      if (!/^\d{9}$/.test(m.id)) return send(ws, { type: 'error', message: 'Invalid ID.' });
      const existing = clients.get(m.id);
      if (existing && existing !== ws && existing.readyState === 1) {
        return send(ws, { type: 'error', code: 'id-in-use', message: 'This ID is already in use.' });
      }
      ws.id = m.id;
      ws.name = typeof m.name === 'string' ? m.name.slice(0, 64) : '';
      clients.set(m.id, ws);
      send(ws, { type: 'registered', id: m.id, iceServers });
      announceDevices();
      if (cloudflareTurn) {
        sendRelaySettings();
        refreshTimer = setInterval(sendRelaySettings, 30 * 60 * 1000);
      }
      return;
    }

    if (m.type === 'presence' && ws.id && Array.isArray(m.ids)) {
      const online = m.ids.slice(0, 50).filter((id) => clients.has(String(id)));
      return send(ws, { type: 'presence', online });
    }

    if (!ws.id || !RELAY.has(m.type)) return;

    if (m.type === 'connect-request') {
      const now = Date.now();
      ws.reqTimes = ws.reqTimes.filter((t) => now - t < 60000);
      if (ws.reqTimes.length >= MAX_REQUESTS_PER_MIN) {
        return send(ws, { type: 'reject', from: m.to, reason: 'Too many attempts. Wait a minute.' });
      }
      ws.reqTimes.push(now);
    }

    const target = clients.get(String(m.to));
    if (!target) return send(ws, { type: 'reject', from: m.to, reason: 'Offline or unknown ID.' });
    send(target, { ...m, from: ws.id, to: undefined });
  });

  ws.on('close', () => {
    clearInterval(refreshTimer);
    if (ws.id && clients.get(ws.id) === ws) {
      clients.delete(ws.id);
      announceDevices();
    }
  });
});

server.listen(PORT, process.env.HOST || (accessKey.length ? '127.0.0.1' : undefined), () => console.log(`Signaling server on :${PORT}`));
