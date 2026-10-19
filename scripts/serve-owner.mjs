import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { projectRoot } from '../lib/store.mjs';
const base = path.join(projectRoot,'apps/owner/out');
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json','.ico':'image/x-icon','.woff2':'font/woff2'};
http.createServer((request,response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url,'http://127.0.0.1:3001').pathname);
    let target = path.resolve(base, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!target.startsWith(`${base}${path.sep}`)) { response.writeHead(403).end(); return; }
    if (!fs.existsSync(target) && fs.existsSync(`${target}.html`)) target += '.html';
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) { response.writeHead(404).end('Not found'); return; }
    response.writeHead(200,{'Content-Type':types[path.extname(target)] || 'application/octet-stream','Cache-Control':'no-store'});
    fs.createReadStream(target).pipe(response);
  } catch { response.writeHead(400).end('Bad request'); }
}).listen(3001,'127.0.0.1');
