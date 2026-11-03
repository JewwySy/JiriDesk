const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const WebSocket = require('ws');
const { isOfficeAddress } = require('./network.js');

test('only this PC and private network addresses count as the office', () => {
  for (const a of ['127.0.0.1', '::1', '::ffff:127.0.0.1', '192.168.1.20', '::ffff:192.168.1.20', '10.0.0.5', '172.16.0.1', '172.31.255.1']) {
    assert.equal(isOfficeAddress(a), true, a);
  }
  for (const a of ['100.81.71.70', '8.8.8.8', '172.32.0.1', '::ffff:8.8.8.8', '', undefined]) {
    assert.equal(isOfficeAddress(a), false, String(a));
  }
});

const running = [];
after(() => running.forEach((p) => p.kill()));

function startServer(port, env = {}) {
  const proc = spawn(process.execPath, ['server.js'], { cwd: __dirname, env: { ...process.env, PORT: port, HOST: '127.0.0.1', JIRIDESK_ACCESS_KEY: '', ...env } });
  running.push(proc);
  return new Promise((resolve, reject) => {
    proc.stdout.once('data', () => resolve(proc));
    proc.once('exit', (code) => reject(new Error(`server exited ${code}`)));
  });
}

function client(port, id, name, accessKey) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  const seen = [];
  const waiting = [];
  ws.on('message', (raw) => {
    const m = JSON.parse(raw);
    seen.push(m);
    for (const w of [...waiting]) if (w.test(m)) { waiting.splice(waiting.indexOf(w), 1); w.resolve(m); }
  });
  ws.on('open', () => ws.send(JSON.stringify({ type: 'register', id, name, accessKey })));
  const next = (t) => new Promise((resolve, reject) => {
    const found = seen.find(t);
    if (found) return resolve(found);
    waiting.push({ test: t, resolve });
    setTimeout(() => reject(new Error('timed out')), 3000).unref();
  });
  return { ws, seen, next };
}
const sees = (id) => (m) => m.type === 'discovered' && m.devices.some((d) => d.id === id);
const gone = (id) => (m) => m.type === 'discovered' && !m.devices.some((d) => d.id === id);

test('an open device appears on the other device and disappears when it closes', async () => {
  await startServer(38101);
  const a = client(38101, '111111111', 'FRONT-DESK');
  await a.next((m) => m.type === 'registered');
  const b = client(38101, '222222222', 'ACCOUNTING');

  const found = await a.next(sees('222222222'));
  assert.deepEqual(found.devices, [{ id: '222222222', name: 'ACCOUNTING' }]);
  await b.next(sees('111111111'));

  a.seen.length = 0;
  b.ws.close();
  await a.next(gone('222222222'));
  a.ws.close();
});

test('a connection that sends an oversized message cannot bring the server down', async () => {
  await startServer(38103);
  const bad = new WebSocket('ws://127.0.0.1:38103');
  bad.on('error', () => {});
  await new Promise((r) => bad.once('open', r));
  bad.send('x'.repeat(70 * 1024));
  await new Promise((r) => bad.once('close', r));
  await new Promise((r) => setTimeout(r, 200));
  const good = client(38103, '333333333', 'STILL-ALIVE');
  good.ws.on('error', () => {});
  await good.next((m) => m.type === 'registered');
  good.ws.close();
});

test('a server with an access key never lists devices', async () => {
  const accessKey = 'k'.repeat(32);
  await startServer(38102, { JIRIDESK_ACCESS_KEY: accessKey });
  const a = client(38102, '111111111', 'FRONT-DESK', accessKey);
  await a.next((m) => m.type === 'registered');
  const b = client(38102, '222222222', 'ACCOUNTING', accessKey);
  await b.next((m) => m.type === 'registered');
  await new Promise((r) => setTimeout(r, 200));
  assert.equal([...a.seen, ...b.seen].some((m) => m.type === 'discovered'), false);
  a.ws.close();
  b.ws.close();
});
