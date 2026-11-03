const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.exe': 'application/octet-stream' };
function resolveFile(url) {
  const pathname = decodeURIComponent(new URL(url, 'http://localhost').pathname);
  const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(root + path.sep) || !['.html', '.css', '.png', '.exe'].includes(path.extname(file))) return null;
  return file;
}
if (process.argv.includes('--test')) {
  const assert = require('node:assert/strict');
  assert.equal(resolveFile('/'), path.join(root, 'index.html'));
  assert.equal(resolveFile('/downloads/JiriDesk-Setup.exe'), path.join(root, 'downloads', 'JiriDesk-Setup.exe'));
  assert.equal(resolveFile('/serve.cjs'), null);
  assert.equal(resolveFile('/%2e%2e%5capp/package.json'), null);
  console.log('Server path checks passed.');
} else {
  const server = http.createServer((req, res) => {
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, {Allow:'GET, HEAD'}); res.end(); return; }
    let file;
    try { file = resolveFile(req.url); } catch { res.writeHead(400); res.end('Bad request'); return; }
    if (!file) { res.writeHead(404); res.end('Not found'); return; }
    fs.stat(file, (err, stat) => {
      if (err || !stat.isFile()) { res.writeHead(404); res.end('Not found'); return; }
      const headers = {'Content-Type':types[path.extname(file)], 'Content-Length':stat.size, 'X-Content-Type-Options':'nosniff'};
      if (file.endsWith('.exe')) headers['Content-Disposition'] = 'attachment; filename="JiriDesk-Setup.exe"';
      res.writeHead(200, headers);
      if (req.method === 'HEAD') { res.end(); return; }
      const stream = fs.createReadStream(file);
      stream.on('error', () => res.destroy());
      res.on('close', () => stream.destroy());
      stream.pipe(res);
    });
  });
  server.on('error', error => { console.error(error.message); process.exitCode=1; });
  server.listen(8080, '0.0.0.0', () => console.log('JiriDesk site: http://localhost:8080 (also available on your LAN IP, if the firewall permits)'));
}
