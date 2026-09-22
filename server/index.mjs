// Production server: serves the built dist/ (npm run build) and the /api/subscribe
// endpoint that powers the email gate. Run with `npm start` after building.
import http from 'node:http';
import { createReadStream, existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleSubscribeRequest } from './requestHandler.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.resolve(__dirname, '..', 'dist');
const PORT = Number(process.env.PORT) || 4173;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.wasm': 'application/wasm',
  '.woff2': 'font/woff2',
};

async function serveStatic(req, res) {
  const requestedPath = decodeURIComponent(req.url.split('?')[0]);
  const candidate = path.normalize(path.join(DIST_DIR, requestedPath));

  // Guard against path traversal escaping dist/.
  if (!candidate.startsWith(DIST_DIR)) {
    res.statusCode = 403;
    res.end('Forbidden');
    return;
  }

  const filePath = existsSync(candidate) && (await stat(candidate)).isFile()
    ? candidate
    : path.join(DIST_DIR, 'index.html'); // SPA fallback

  const ext = path.extname(filePath);
  res.setHeader('Content-Type', MIME_TYPES[ext] || 'application/octet-stream');
  createReadStream(filePath)
    .on('error', () => {
      res.statusCode = 404;
      res.end('Not found');
    })
    .pipe(res);
}

if (!existsSync(DIST_DIR)) {
  console.error('dist/ not found — run `npm run build` before `npm start`.');
  process.exit(1);
}

const server = http.createServer((req, res) => {
  if (req.url === '/api/subscribe') {
    handleSubscribeRequest(req, res);
    return;
  }
  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`Agent Syndicate serving dist/ on http://localhost:${PORT}`);
});
