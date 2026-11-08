'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
const assets = new Set(['index.html', 'styles.css', 'app.js', 'favicon.svg', 'social-preview.svg']);
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };
const port = Number(process.env.PORT || 4173);
const server = http.createServer((req, res) => {
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); return res.end('Method not allowed'); }
  let name;
  try { name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\//, '') || 'index.html'; }
  catch { res.writeHead(400); return res.end('Bad request'); }
  if (!assets.has(name)) { res.writeHead(404); return res.end('Not found'); }
  fs.readFile(path.join(root, name), (error, data) => {
    if (error) { res.writeHead(500); return res.end('Read error'); }
    res.writeHead(200, { 'Content-Type': mime[path.extname(name)], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(req.method === 'HEAD' ? undefined : data);
  });
});
server.listen(port, '127.0.0.1', () => console.log(`Линия: http://127.0.0.1:${port}`));
