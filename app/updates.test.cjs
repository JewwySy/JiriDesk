const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const vm = require('node:vm');

test('a packaged app installs only a downloaded update requested by its own window', () => {
  const updater = new EventEmitter();
  const calls = [];
  updater.checkForUpdates = async () => { calls.push('check'); };
  updater.quitAndInstall = (...args) => calls.push(['install', ...args]);
  const handlers = {};
  const win = { isDestroyed: () => false, webContents: { send: (...args) => calls.push(args) } };
  const app = new EventEmitter();
  app.isPackaged = true;
  const ctx = {
    module: {}, process: { platform: 'win32', resourcesPath: 'resources' },
    require: name => name === 'electron-updater' ? { autoUpdater: updater } :
      name === 'node:fs' ? { existsSync: () => true } : require(name),
    setInterval: () => 1, clearInterval: () => calls.push('clear'), console,
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('./updates.js'), 'utf8'), ctx);
  ctx.module.exports({ app, win, ipcMain: { handle: (name, fn) => { handlers[name] = fn; } }, prepareToQuit: () => calls.push('prepare') });
  const window = { sender: win.webContents };
  assert.equal(handlers['install-update'](window), false);
  assert.equal(updater.autoInstallOnAppQuit, false);
  updater.emit('update-downloaded', { version: '0.2.1' });
  assert.equal(handlers['update-status'](window), '0.2.1');
  assert.equal(handlers['install-update']({ sender: {} }), false);
  assert.equal(handlers['install-update'](window), true);
  assert.equal(handlers['install-update'](window), false);
  app.emit('before-quit');
  assert.deepEqual(calls, ['check', ['update-ready', '0.2.1'], 'prepare', ['install', false, true], 'clear']);
});
