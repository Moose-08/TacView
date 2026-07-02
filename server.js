'use strict';

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

let sea = null;
try {
  const seaModule = require('node:sea');
  if (seaModule.isSea()) sea = seaModule;
} catch (_) {}

const GAME_BASE = process.env.GAME_BASE || 'http://localhost:8111';
const PORT = Number(process.env.PORT || 3111);
const APP_DIR = sea ? path.dirname(process.execPath) : __dirname;
const PUBLIC_DIR = path.join(__dirname, 'public');
const CONFIG_PATH = path.join(APP_DIR, 'overlay-config.json');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const DEFAULT_OVERLAY_CONFIG = {
  widgets: { nav: true, threat: true, ship: true, fuel: false, caution: true, feed: false },
  opacity: 75,
  fontScale: 100,
  playerName: '',
  left: 80,
  top: 80,
};

function readOverlayConfig() {
  try {
    return { ...DEFAULT_OVERLAY_CONFIG, ...JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) };
  } catch (_) {
    return { ...DEFAULT_OVERLAY_CONFIG };
  }
}

function readBody(req, cb) {
  let body = '';
  let overflow = false;
  req.on('data', (chunk) => {
    body += chunk;
    if (body.length > 65536) { overflow = true; req.destroy(); }
  });
  req.on('error', () => {});
  req.on('end', () => { if (!overflow) cb(body); });
}

function originAllowed(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  return origin.startsWith('chrome-extension://') || origin.startsWith('moz-extension://') ||
    origin === `http://localhost:${PORT}` || origin === `http://127.0.0.1:${PORT}`;
}

function rejectOrigin(res) {
  res.writeHead(403, { 'Content-Type': 'application/json' });
  res.end('{"error":"forbidden_origin"}');
}

function handleOverlayConfig(req, res) {
  if (req.method === 'POST') {
    if (!originAllowed(req)) { rejectOrigin(res); return; }
    readBody(req, (body) => {
      try {
        const merged = { ...readOverlayConfig(), ...JSON.parse(body || '{}') };
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(merged));
      } catch (_) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end('{"error":"bad_json"}');
      }
    });
    return;
  }
  res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(readOverlayConfig()));
}

let navState = { active: null, notice: null, updated: 0 };

function handleNavSync(req, res) {
  if (req.method === 'POST') {
    if (!originAllowed(req)) { rejectOrigin(res); return; }
    readBody(req, (body) => {
      try {
        const parsed = JSON.parse(body || '{}');
        navState = { active: parsed.active || null, notice: parsed.notice || null, updated: Date.now() };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"ok":true}');
      } catch (_) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end('{"error":"bad_json"}');
      }
    });
    return;
  }
  res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(navState));
}

function overlayScriptPath() {
  if (!sea) return path.join(__dirname, 'overlay-native.ps1');
  const target = path.join(os.tmpdir(), 'tacview-overlay.ps1');
  const data = Buffer.from(sea.getAsset('overlay-native.ps1'));
  if (!fs.existsSync(target) || !fs.readFileSync(target).equals(data)) {
    fs.writeFileSync(target, data);
  }
  return target;
}

function handleOverlayLaunch(res) {
  try {
    const scriptPath = overlayScriptPath();
    const child = spawn('cmd.exe',
      ['/c', 'start', '""', '/min', 'powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass',
        '-WindowStyle', 'Hidden', '-File', `"${scriptPath}"`],
      { detached: true, stdio: 'ignore', windowsVerbatimArguments: true });
    child.unref();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{"ok":true}');
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'spawn_failed', detail: String(err.message || err) }));
  }
}

async function proxyToGame(req, res) {
  const upstreamPath = req.url.replace(/^\/api/, '') || '/';
  const url = GAME_BASE + upstreamPath;
  try {
    const upstream = await fetch(url, { signal: AbortSignal.timeout(5000) });
    const buf = Buffer.from(await upstream.arrayBuffer());
    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    res.writeHead(upstream.status, {
      'Content-Type': contentType,
      'Cache-Control': 'no-store',
    });
    res.end(buf);
  } catch (err) {
    res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'game_unreachable', detail: String(err.message || err) }));
  }
}

function serveStatic(req, res) {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  const rel = urlPath === '/' ? 'index.html' : urlPath.slice(1);

  if (sea) {
    try {
      const data = Buffer.from(sea.getAsset(`public/${rel.replace(/\\/g, '/')}`));
      const ext = path.extname(rel).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      res.end(data);
    } catch (_) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
    }
    return;
  }

  const filePath = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!filePath.startsWith(PUBLIC_DIR + path.sep) && filePath !== PUBLIC_DIR) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  try {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }
    if (req.url.startsWith('/sync/nav')) {
      handleNavSync(req, res);
    } else if (req.url.startsWith('/sync/overlay-config')) {
      handleOverlayConfig(req, res);
    } else if (req.url.startsWith('/sync/overlay') && req.method === 'POST') {
      if (!originAllowed(req)) { rejectOrigin(res); return; }
      handleOverlayLaunch(res);
    } else if (req.url.startsWith('/api/')) {
      proxyToGame(req, res);
    } else {
      serveStatic(req, res);
    }
  } catch (err) {
    try {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Bad request');
    } catch (_) {}
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use — is another TACVIEW server running?`);
  } else {
    console.error('Server error:', err.message);
  }
  process.exit(1);
});

server.listen(PORT, () => {
  console.log(`TACVIEW online → http://localhost:${PORT}`);
  console.log(`Proxying game API from ${GAME_BASE}`);
  if (!process.env.TACVIEW_NO_OPEN) {
    const opener = spawn('cmd.exe', ['/c', 'start', '""', `http://localhost:${PORT}`],
      { detached: true, stdio: 'ignore', windowsVerbatimArguments: true });
    opener.unref();
  }
});
