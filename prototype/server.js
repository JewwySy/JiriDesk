const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const rooms = new Map(); // code -> { host, viewer }

const server = http.createServer((req, res) => {
  const file = req.url === '/' ? 'index.html' : path.basename(req.url.split('?')[0]);
  const full = path.join(PUBLIC, file);
  fs.readFile(full, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server });

function newCode() {
  let c;
  do { c = String(Math.floor(100000 + Math.random() * 900000)); } while (rooms.has(c));
  return c;
}
const send = (ws, msg) => ws && ws.readyState === 1 && ws.send(JSON.stringify(msg));

wss.on('connection', (ws) => {
  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }

    if (m.type === 'host') {
      const code = newCode();
      rooms.set(code, { host: ws, viewer: null });
      ws.code = code; ws.role = 'host';
      send(ws, { type: 'code', code });
    } else if (m.type === 'join') {
      const room = rooms.get(String(m.code));
      if (!room || room.viewer) return send(ws, { type: 'error', message: 'Maling code o may kasalukuyang viewer na.' });
      room.viewer = ws; ws.code = m.code; ws.role = 'viewer';
      send(room.host, { type: 'viewer-joined' });
    } else if (['offer', 'answer', 'ice'].includes(m.type)) {
      const room = rooms.get(ws.code);
      if (!room) return;
      send(ws.role === 'host' ? room.viewer : room.host, m);
    }
  });

  ws.on('close', () => {
    const room = rooms.get(ws.code);
    if (!room) return;
    if (ws.role === 'host') {
      send(room.viewer, { type: 'ended' });
      rooms.delete(ws.code);
    } else {
      room.viewer = null;
      send(room.host, { type: 'viewer-left' });
    }
  });
});

server.listen(PORT, () => console.log(`Prototype running: http://localhost:${PORT}`));
