// Regenerates every raster icon from the SVGs in this folder.
// Run from the repo root: app/node_modules/.bin/electron brand/render-icons.cjs
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const appDir = path.join(__dirname, '..', 'app');
const siteDir = path.join(__dirname, '..', 'site');
const svgUrl = (name) => 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(__dirname, name)).toString('base64');

// The full icon gets muddy below 32px, so small sizes use the simplified drawing.
const sourceFor = (size) => (size < 32 ? 'jiridesk-icon-small.svg' : 'jiridesk-icon.svg');

function ico(pngs) {
  const header = Buffer.alloc(6 + 16 * pngs.length);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  let offset = header.length;
  pngs.forEach(({ size, data }, i) => {
    const at = 6 + 16 * i;
    header[at] = size === 256 ? 0 : size; // 0 means 256 in the ICO format
    header[at + 1] = size === 256 ? 0 : size;
    header.writeUInt16LE(1, at + 4);
    header.writeUInt16LE(32, at + 6);
    header.writeUInt32LE(data.length, at + 8);
    header.writeUInt32LE(offset, at + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...pngs.map((p) => p.data)]);
}

function write(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
  console.log(path.relative(path.join(__dirname, '..'), file), data.length);
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false });
  await win.loadURL('about:blank');

  const render = async (size) => {
    const url = await win.webContents.executeJavaScript(`new Promise((done, fail) => {
      const img = new Image();
      img.onerror = fail;
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = c.height = ${size};
        c.getContext('2d').drawImage(img, 0, 0, ${size}, ${size});
        done(c.toDataURL('image/png'));
      };
      img.src = ${JSON.stringify(svgUrl(sourceFor(size)))};
    })`);
    return Buffer.from(url.split(',')[1], 'base64');
  };

  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const pngs = [];
  for (const size of sizes) pngs.push({ size, data: await render(size) });

  write(path.join(appDir, 'build', 'icon.ico'), ico(pngs));
  write(path.join(appDir, 'build', 'icon.png'), await render(1024));
  write(path.join(appDir, 'assets', 'icon.png'), await render(256));
  write(path.join(appDir, 'assets', 'tray.png'), await render(16));
  write(path.join(appDir, 'assets', 'tray@2x.png'), await render(32));
  write(path.join(siteDir, 'favicon.png'), await render(64));
  write(path.join(__dirname, 'jiridesk-icon-1024.png'), await render(1024));
  app.quit();
});
