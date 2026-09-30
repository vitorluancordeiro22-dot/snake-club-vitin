import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import game from '../api/game.js';
import ranking from '../api/ranking.js';
const vercelConfig = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
process.env.SNAKE_LOCAL_DEV = '1';
const root = resolve('public');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
http.createServer(async (req, res) => {
  for (const header of vercelConfig.headers[0].headers) res.setHeader(header.key, header.value);
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api/game') return game(req, res);
  if (url.pathname === '/api/ranking') return ranking(req, res);
  try {
    const path = resolve(root, '.' + (url.pathname === '/' ? '/index.html' : url.pathname));
    if (path !== root && !path.startsWith(root + sep)) throw new Error('Invalid path');
    const content = await readFile(path);
    res.setHeader('Content-Type', mime[extname(path)] || 'application/octet-stream');
    res.end(content);
  } catch { res.statusCode = 404; res.end('Not found'); }
}).listen(Number(process.env.PORT || 3000), '0.0.0.0', () => console.log('Snake Club: http://localhost:' + (process.env.PORT || 3000)));
