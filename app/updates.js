const fs = require('node:fs');
const path = require('node:path');

module.exports = function startUpdates({ app, ipcMain, win, prepareToQuit }) {
  let readyVersion = null;
  let autoUpdater;
  ipcMain.handle('update-status', event =>
    event.sender === win.webContents ? readyVersion : null);
  ipcMain.handle('install-update', event => {
    if (event.sender !== win.webContents || !readyVersion) return false;
    readyVersion = null;
    prepareToQuit();
    autoUpdater.quitAndInstall(false, true);
    return true;
  });

  if (!app.isPackaged || process.platform !== 'win32' ||
      !fs.existsSync(path.join(process.resourcesPath, 'app-update.yml'))) return;

  autoUpdater = require('electron-updater').autoUpdater;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowDowngrade = false;
  autoUpdater.disableWebInstaller = true;
  autoUpdater.on('error', error => console.warn('Update check failed:', error.message));
  autoUpdater.on('update-downloaded', ({ version }) => {
    readyVersion = version;
    if (!win.isDestroyed()) win.webContents.send('update-ready', version);
  });

  const check = async () => {
    if (readyVersion) return;
    try {
      const result = await autoUpdater.checkForUpdates();
      await result?.downloadPromise;
    } catch {
      // electron-updater emits the error; retry at the next scheduled check.
    }
  };
  check();
  const timer = setInterval(check, 60 * 60 * 1000);
  app.once('before-quit', () => clearInterval(timer));
};
