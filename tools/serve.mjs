#!/usr/bin/env node
// Minimal static server for local testing: directory index, 404.html fallback, Range requests.
// usage: node tools/serve.mjs <dir> [port] [--cache-control "max-age=600"]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] || 'site');
const port = +(process.argv[3] || 8080);
const ccI = process.argv.indexOf('--cache-control');
const cacheControl = ccI > 0 ? process.argv[ccI + 1] : 'no-cache';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.txt': 'text/plain; charset=utf-8', '.ico': 'image/x-icon' };

export function createServer(dir = root, opts = {}) {
  return http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    let p = path.join(dir, decodeURIComponent(u.pathname));
    if (!p.startsWith(dir)) { res.writeHead(403); return res.end(); }
    if (opts.intercept && opts.intercept(req, res, u)) return;
    try { if (fs.statSync(p).isDirectory()) { if (!u.pathname.endsWith('/')) { res.writeHead(301, { Location: u.pathname + '/' + u.search }); return res.end(); } p = path.join(p, 'index.html'); } } catch { /* 404 below */ }
    if (!fs.existsSync(p)) {
      const nf = path.join(dir, '404.html');
      res.writeHead(404, { 'Content-Type': TYPES['.html'] });
      return res.end(fs.existsSync(nf) ? fs.readFileSync(nf) : 'not found');
    }
    const body = fs.readFileSync(p);
    const type = TYPES[path.extname(p)] || 'application/octet-stream';
    const headers = { 'Content-Type': type, 'Cache-Control': opts.cacheControl || cacheControl, 'Accept-Ranges': 'bytes' };
    const range = req.headers.range && /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
    if (range) {
      let s = range[1] === '' ? body.length - +range[2] : +range[1];
      let e = range[1] === '' ? body.length - 1 : range[2] === '' ? body.length - 1 : Math.min(+range[2], body.length - 1);
      if (s >= body.length || s > e) { res.writeHead(416, { 'Content-Range': `bytes */${body.length}` }); return res.end(); }
      res.writeHead(206, { ...headers, 'Content-Range': `bytes ${s}-${e}/${body.length}`, 'Content-Length': e - s + 1 });
      return res.end(req.method === 'HEAD' ? undefined : body.subarray(s, e + 1));
    }
    res.writeHead(200, { ...headers, 'Content-Length': body.length });
    res.end(req.method === 'HEAD' ? undefined : body);
  });
}
if (import.meta.url === `file://${process.argv[1]}`) createServer(root).listen(port, () => console.log(`serving ${root} on http://localhost:${port}/`));
