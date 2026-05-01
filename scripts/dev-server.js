/**
 * Serveur de développement local (sans CLI Vercel).
 * Charge .env / .env.local, sert public/ et route POST/OPTIONS /api/generate.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const ROOT = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const PREFERRED_PORT = Number(process.env.PORT) || 3000;
const PORT_TRY_LIMIT = 40;

loadEnvFiles();
const generateHandler = require(path.join(ROOT, 'api', 'generate.js'));

function loadEnvFiles() {
  for (const name of ['.env.local', '.env']) {
    const filePath = path.join(ROOT, name);
    if (!fs.existsSync(filePath)) continue;
    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (key && process.env[key] === undefined) process.env[key] = val;
    }
  }
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('JSON invalide'));
      }
    });
    req.on('error', reject);
  });
}

/** Mimique res.status().json() / .end() utilisée par api/generate.js (runtime Vercel). */
function createVercelLikeResponse(nodeRes) {
  let statusCode = 200;
  const res = {
    setHeader(name, value) {
      nodeRes.setHeader(name, value);
    },
    status(code) {
      statusCode = code;
      return res;
    },
    json(obj) {
      nodeRes.statusCode = statusCode;
      if (!nodeRes.getHeader('Content-Type')) {
        nodeRes.setHeader('Content-Type', 'application/json; charset=utf-8');
      }
      nodeRes.end(JSON.stringify(obj));
    },
    end(data) {
      nodeRes.statusCode = statusCode;
      nodeRes.end(data !== undefined && data !== null ? data : '');
    }
  };
  return res;
}

function serveIndex(nodeRes) {
  const htmlPath = path.join(PUBLIC_DIR, 'index.html');
  fs.readFile(htmlPath, (err, data) => {
    if (err) {
      nodeRes.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      nodeRes.end('Erreur lecture index.html');
      return;
    }
    nodeRes.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    nodeRes.end(data);
  });
}

const server = http.createServer(async (nodeReq, nodeRes) => {
  let pathname;
  try {
    pathname = new URL(nodeReq.url || '/', 'http://127.0.0.1').pathname;
  } catch {
    nodeRes.writeHead(400);
    nodeRes.end();
    return;
  }

  if (pathname === '/api/generate') {
    const res = createVercelLikeResponse(nodeRes);
    let body = {};
    if (nodeReq.method === 'POST') {
      try {
        body = await readJsonBody(nodeReq);
      } catch {
        res.status(400).json({ error: 'Corps JSON invalide' });
        return;
      }
    }
    const req = { method: nodeReq.method, body };
    try {
      await generateHandler(req, res);
    } catch (e) {
      console.error('[dev-server]', e);
      if (!nodeRes.writableEnded) {
        nodeRes.statusCode = 500;
        nodeRes.setHeader('Content-Type', 'application/json; charset=utf-8');
        nodeRes.end(JSON.stringify({ error: 'Erreur serveur' }));
      }
    }
    return;
  }

  if (pathname === '/' || pathname === '/index.html') {
    serveIndex(nodeRes);
    return;
  }

  nodeRes.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  nodeRes.end('Not found');
});

function listenFrom(port) {
  if (port > PREFERRED_PORT + PORT_TRY_LIMIT) {
    console.error(
      `[dev-server] Aucun port libre entre ${PREFERRED_PORT} et ${port - 1}. Ferme les autres serveurs ou définis PORT.`
    );
    process.exit(1);
  }

  function onListenError(err) {
    server.off('listening', onListening);
    if (err.code !== 'EADDRINUSE') {
      console.error(err);
      process.exit(1);
    }
    console.warn(`[dev-server] Port ${port} déjà utilisé → essai ${port + 1}`);
    listenFrom(port + 1);
  }

  function onListening() {
    server.off('error', onListenError);
    console.log(`Lumière — dev local http://localhost:${port} (sans Vercel CLI)`);
    if (port !== PREFERRED_PORT) {
      console.warn(
        `[dev-server] Pour réserver le port ${PREFERRED_PORT}, arrête l’autre processus ou utilise PORT=${port}.`
      );
    }
  }

  server.once('error', onListenError);
  server.once('listening', onListening);
  server.listen(port);
}

listenFrom(PREFERRED_PORT);
