// Runs elevated, started by the scheduled task. Windows blocks input to admin windows from a program that is not
// elevated, and refuses screen capture to one that is, so only this small part runs as administrator.
// It reads input from the app that started it and exits when that app goes away.
const { app } = require('electron');
const fs = require('fs');
const net = require('net');
const path = require('path');

const dir = process.argv.find((a) => a.startsWith('--input-helper=')).slice('--input-helper='.length);
const note = (err) => fs.appendFileSync(path.join(dir, 'input-helper.log'), `${new Date().toISOString()} ${err && err.stack || err}\n`);

app.disableHardwareAcceleration();
process.on('uncaughtException', (err) => { note(err); app.exit(1); });

app.whenReady().then(() => {
  const { inputQueue } = require('./input');
  const queue = inputQueue();
  const leave = () => queue.releaseAll().finally(() => app.exit(0));
  const { pipe } = JSON.parse(fs.readFileSync(path.join(dir, 'input-helper.json'), 'utf8'));
  const socket = net.connect(pipe);
  let buffered = '';
  socket.setEncoding('utf8');
  socket.on('data', (chunk) => {
    const lines = (buffered + chunk).split('\n');
    buffered = lines.pop();
    for (const line of lines) {
      const ev = JSON.parse(line);
      if (ev.type === 'release-all') queue.releaseAll();
      else queue.push(ev);
    }
  });
  socket.on('error', (err) => { note(err); leave(); });
  socket.on('close', leave);
}).catch((err) => { note(err); app.exit(1); });
