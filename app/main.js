const { app, BrowserWindow, ipcMain, dialog, desktopCapturer, screen, clipboard, shell, Tray, Menu, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const os = require('os');
const net = require('net');
const { execFile } = require('child_process');
const { DEFAULT_SERVERS, parseServers, migrateServers } = require('./servers');
const { safeFileName, displayPoint } = require('./session');
const { adminTaskXml } = require('./elevation');
const { inputQueue } = require('./input');

let win;
let tray;
let quitting = false;

if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', showWindow);

function showWindow() {
  if (!win) return;
  win.show();
  if (win.isMinimized()) win.restore();
  win.focus();
}

// Native window buttons follow the app theme.
const CHROME = {
  dark: { color: '#0e0f12', symbolColor: '#8a8f9c' },
  light: { color: '#f6f6f8', symbolColor: '#6b7080' },
};
ipcMain.on('set-chrome', (_e, theme) => {
  const chrome = CHROME[theme];
  if (!win || !chrome) return;
  win.setBackgroundColor(chrome.color);
  win.setTitleBarOverlay({ ...chrome, height: 40 });
});

function createWindow() {
  win = new BrowserWindow({
    width: 1040,
    height: 720,
    minWidth: 620,
    minHeight: 460,
    show: false,
    title: 'JiriDesk',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    backgroundColor: CHROME.dark.color,
    titleBarStyle: 'hidden',
    titleBarOverlay: { ...CHROME.dark, height: 40 },
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, backgroundThrottling: false },
  });
  win.setMenuBarVisibility(false);
  win.loadFile('index.html');
  win.once('ready-to-show', () => { if (!process.argv.includes('--hidden')) win.show(); });
  win.on('close', (e) => {
    if (!quitting && loadConfig().trayOnClose) {
      e.preventDefault();
      win.hide();
    }
  });
}

function createTray() {
  tray = new Tray(path.join(__dirname, 'assets', 'tray.png')); // tray@2x.png is picked up automatically
  tray.setToolTip('JiriDesk');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open JiriDesk', click: showWindow },
    { type: 'separator' },
    { label: 'Exit', click: quit },
  ]));
  tray.on('click', showWindow);
}

function quit() {
  quitting = true;
  app.quit();
}

function applyLoginItem(cfg) {
  // Only an installed build has a stable path worth registering.
  if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: cfg.startWithWindows, args: ['--hidden'] });
}

app.whenReady().then(() => {
  const cfg = loadConfig();
  applyLoginItem(cfg);
  createTray();
  createWindow();
  if (adminAvailable() && cfg.runAsAdmin) startInputHelper();
  require('./updates')({ app, ipcMain, win, prepareToQuit: () => { quitting = true; } });
});

app.on('before-quit', () => { quitting = true; });
app.on('window-all-closed', () => app.quit());

// ---- Per-machine settings ----
const DEFAULTS = {
  server: DEFAULT_SERVERS,
  deviceName: os.hostname(),
  serverAccessKey: '',
  startWithWindows: true,
  notifications: true,
  sound: false,
  trayOnClose: true,
  theme: 'system',
  allowPassword: true,
  interactive: 'ask', // ask | never
  profile: 'control', // view | control | unattended
  rememberHistory: true,
  saveThumbnails: true,
  syncClipboard: true,
  runAsAdmin: false,
  quality: 'balanced', // balanced | quality | speed
  viewMode: 'shrink', // original | shrink | stretch
  startFullscreen: false,
  perDesk: true, // remember the view mode for each computer
  hardwareAcceleration: true, // applied when JiriDesk starts
  recent: [],
};
const CHOICES = {
  theme: ['system', 'dark', 'light'],
  interactive: ['ask', 'never'],
  profile: ['view', 'control', 'unattended'],
  quality: ['balanced', 'quality', 'speed'],
  viewMode: ['original', 'shrink', 'stretch'],
};
const FLAGS = ['startWithWindows', 'notifications', 'sound', 'trayOnClose', 'allowPassword', 'rememberHistory', 'saveThumbnails', 'syncClipboard', 'startFullscreen', 'perDesk', 'hardwareAcceleration'];

const configPath = () => path.join(app.getPath('userData'), 'config.json');
function loadConfig() {
  let saved = null;
  try { saved = JSON.parse(fs.readFileSync(configPath(), 'utf8')); } catch { /* first run */ }
  if (saved) {
    // Older versions stored "fit to window" as a yes/no.
    if (!saved.viewMode && saved.fit === false) saved.viewMode = 'original';
    delete saved.fit;
    return { ...DEFAULTS, ...saved, server: migrateServers(saved.server ?? DEFAULTS.server) };
  }
  const cfg = {
    ...DEFAULTS,
    id: String(crypto.randomInt(100000000, 1000000000)),
    password: crypto.randomBytes(5).toString('hex'),
  };
  saveConfig(cfg);
  return cfg;
}
function saveConfig(cfg) {
  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2));
}

// Must run before the app is ready.
if (loadConfig().hardwareAcceleration === false) app.disableHardwareAcceleration();

ipcMain.handle('get-config', () => loadConfig());
ipcMain.handle('set-config', (_e, patch) => {
  const cfg = loadConfig();
  if (typeof patch.password === 'string' && patch.password.length >= 8) cfg.password = patch.password;
  if (typeof patch.server === 'string' && parseServers(patch.server)) cfg.server = patch.server;
  if (typeof patch.serverAccessKey === 'string' && patch.serverAccessKey.length <= 256) cfg.serverAccessKey = patch.serverAccessKey;
  for (const k of FLAGS) if (typeof patch[k] === 'boolean') cfg[k] = patch[k];
  for (const [k, vals] of Object.entries(CHOICES)) if (vals.includes(patch[k])) cfg[k] = patch[k];
  if (Array.isArray(patch.recent)) cfg.recent = patch.recent.slice(0, 30);
  saveConfig(cfg);
  applyLoginItem(cfg);
  return cfg;
});

// ---- Admin control ----
// The window stays a normal program, because Windows refuses screen capture to an elevated one.
// Only the helper in input-helper.js runs as administrator.
const ADMIN_TASK = 'JiriDesk Admin';
const adminAvailable = () => app.isPackaged && process.platform === 'win32';
let helper = null;
let helperServer = null;

function startInputHelper() {
  if (helper || helperServer) return Promise.resolve(Boolean(helper));
  return new Promise((resolve) => {
    const pipe = `\\\\.\\pipe\\jiridesk-input-${crypto.randomBytes(16).toString('hex')}`;
    const server = net.createServer((socket) => {
      clearTimeout(giveUp);
      server.close();
      helperServer = null;
      helper = socket;
      socket.on('error', () => {});
      socket.on('close', () => {
        if (helper === socket) helper = null;
      });
      resolve(true);
    });
    helperServer = server;
    const giveUp = setTimeout(() => {
      server.close();
      if (helperServer === server) helperServer = null;
      resolve(false);
    }, 30000); // antivirus can hold a first start for many seconds
    server.on('error', () => { clearTimeout(giveUp); helperServer = null; resolve(false); });
    server.listen(pipe, () => {
      fs.writeFileSync(path.join(app.getPath('userData'), 'input-helper.json'), JSON.stringify({ pipe }));
      execFile('schtasks', ['/Run', '/TN', ADMIN_TASK], { windowsHide: true }, () => {});
    });
  });
}
function stopInputHelper() {
  if (helper) helper.destroy();
  helper = null;
}

// Changing a task needs administrator rights, so Windows shows its UAC prompt here, once.
function runSchtasksElevated(args) {
  const line = args.map((a) => `"${a}"`).join(' ');
  return new Promise((resolve) => {
    execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command',
      '$p = Start-Process schtasks.exe -Verb RunAs -WindowStyle Hidden -Wait -PassThru -ArgumentList $env:JD_SCHTASKS; exit $p.ExitCode'],
    { windowsHide: true, env: { ...process.env, JD_SCHTASKS: line } }, (err) => resolve(!err));
  });
}
async function createAdminTask() {
  const dir = app.getPath('userData');
  const file = path.join(dir, 'admin-task.xml');
  const xml = adminTaskXml({
    exe: process.execPath,
    args: [`--input-helper=${dir}`, `--user-data-dir=${path.join(dir, 'input-helper')}`],
    user: `${process.env.USERDOMAIN}\\${os.userInfo().username}`,
  });
  fs.writeFileSync(file, `\ufeff${xml}`, 'utf16le');
  const ok = await runSchtasksElevated(['/Create', '/TN', ADMIN_TASK, '/XML', file, '/F']);
  fs.rmSync(file, { force: true });
  return ok;
}

ipcMain.handle('admin-status', () => ({ available: adminAvailable(), active: Boolean(helper) }));
ipcMain.handle('set-run-as-admin', async (_e, on) => {
  const cfg = loadConfig();
  if (!adminAvailable()) return { ok: false, cfg, active: false };
  const ok = on ? await createAdminTask() : await runSchtasksElevated(['/Delete', '/TN', ADMIN_TASK, '/F']);
  if (!ok) return { ok: false, cfg, active: Boolean(helper) };
  cfg.runAsAdmin = Boolean(on);
  saveConfig(cfg);
  if (on) await startInputHelper();
  else stopInputHelper();
  return { ok: true, cfg, active: Boolean(helper) };
});

// Lock out password guessing here too: the server's limit is per connection.
const MAX_FAILS = 5;
let fails = [];
ipcMain.handle('check-password', (_e, attempt) => {
  const now = Date.now();
  fails = fails.filter((t) => now - t < 60000);
  if (fails.length >= MAX_FAILS) return false;
  const a = Buffer.from(String(attempt || ''));
  const b = Buffer.from(loadConfig().password);
  const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!ok) fails.push(now);
  return ok;
});

// Host asks the user whether to allow a viewer, and at what level.
ipcMain.handle('ask-permission', async (_e, fromId, viewOnly) => {
  const cfg = loadConfig();
  showWindow();
  if (cfg.sound) shell.beep();
  const levels = viewOnly ? ['view', 'deny'] : ['control', 'view', 'deny'];
  const { response } = await dialog.showMessageBox(win, {
    type: 'question',
    buttons: viewOnly ? ['Allow (view only)', 'Deny'] : ['Allow (full control)', 'View only', 'Deny'],
    defaultId: levels.length - 1,
    cancelId: levels.length - 1,
    title: 'Incoming connection',
    message: `ID ${fromId} wants to connect to your computer.`,
  });
  return levels[response];
});

// Every monitor, primary first. Remote input goes to whichever one the viewer is looking at.
let inputDisplayId = null;
ipcMain.handle('screen-sources', async () => {
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } });
  const primary = screen.getPrimaryDisplay().id;
  const displays = screen.getAllDisplays().sort((a, b) => (b.id === primary) - (a.id === primary));
  const monitors = displays.map((d, n) => {
    const source = sources.find((s) => s.display_id === String(d.id));
    return source && { sourceId: source.id, displayId: d.id, label: `Screen ${n + 1}`, width: d.size.width, height: d.size.height };
  }).filter(Boolean);
  // Some systems do not report which display a source belongs to.
  return monitors.length ? monitors : [{ sourceId: sources[0].id, displayId: primary, label: 'Screen 1', width: 0, height: 0 }];
});
ipcMain.on('set-input-display', (_e, id) => { inputDisplayId = id; });

ipcMain.on('copy-text', (_e, text) => clipboard.writeText(String(text)));
ipcMain.handle('read-clipboard', () => clipboard.readText());

// ---- Files dropped by the viewer. Saved under Downloads\JiriDesk, never over an existing file. ----
const incoming = new Map(); // id -> { handle, file, name, left }
let nextFileId = 1;
async function openUnique(dir, name) {
  const { name: stem, ext } = path.parse(name);
  for (let n = 0; ; n++) {
    const file = path.join(dir, n ? `${stem} (${n})${ext}` : name);
    try { return { file, handle: await fs.promises.open(file, 'wx') }; } catch (err) {
      if (err.code !== 'EEXIST') throw err;
    }
  }
}
async function dropIncoming(id) {
  const f = incoming.get(id);
  if (!f) return;
  incoming.delete(id);
  await f.handle.close().catch(() => {});
  await fs.promises.rm(f.file, { force: true }).catch(() => {});
}
ipcMain.handle('file-start', async (_e, name, size) => {
  if (!Number.isSafeInteger(size) || size < 0) throw new Error('Invalid file size');
  const dir = path.join(app.getPath('downloads'), 'JiriDesk');
  await fs.promises.mkdir(dir, { recursive: true });
  const opened = await openUnique(dir, safeFileName(name));
  const id = nextFileId++;
  incoming.set(id, { ...opened, left: size });
  return id;
});
ipcMain.handle('file-chunk', async (_e, id, bytes) => {
  const f = incoming.get(id);
  if (!f) return false;
  if (bytes.length > f.left) { await dropIncoming(id); return false; }
  f.left -= bytes.length;
  await f.handle.write(bytes);
  return true;
});
ipcMain.handle('file-end', async (_e, id) => {
  const f = incoming.get(id);
  if (!f) return null;
  if (f.left) { await dropIncoming(id); return null; }
  incoming.delete(id);
  await f.handle.close();
  return path.basename(f.file);
});
ipcMain.handle('file-abort-all', () => Promise.all([...incoming.keys()].map(dropIncoming)));
ipcMain.on('notify', (_e, body) => {
  if (loadConfig().notifications && Notification.isSupported()) new Notification({ title: 'JiriDesk', body: String(body) }).show();
});
ipcMain.on('exit-app', quit);

const localInput = inputQueue();
const MOUSE_EVENTS = new Set(['move', 'down', 'up', 'wheel']);
function toPixels(ev) {
  if (!MOUSE_EVENTS.has(ev.type)) return ev;
  const display = screen.getAllDisplays().find((d) => d.id === inputDisplayId) || screen.getPrimaryDisplay();
  const point = displayPoint(display.bounds, ev.x, ev.y);
  const sf = display.scaleFactor || 1;
  // Monitors with different scaling only line up in screen pixels, which Windows can convert exactly.
  const real = process.platform === 'win32' ? screen.dipToScreenPoint(point) : { x: Math.round(point.x * sf), y: Math.round(point.y * sf) };
  return { ...ev, x: real.x, y: real.y };
}
ipcMain.on('input', (_e, ev) => {
  const event = toPixels(ev);
  if (helper) helper.write(`${JSON.stringify(event)}\n`);
  else localInput.push(event);
});
ipcMain.on('release-input', () => {
  if (helper) helper.write('{"type":"release-all"}\n');
  localInput.releaseAll();
});
