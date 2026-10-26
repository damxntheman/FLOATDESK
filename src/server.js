import { readFileSync } from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';
import { SessionRegistry } from './registry.js';

const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || '8787');
const tlsCert = process.env.TLS_CERT_FILE;
const tlsKey = process.env.TLS_KEY_FILE;
const tls = Boolean(tlsCert && tlsKey);
const loopback = ['127.0.0.1', 'localhost', '::1'].includes(host);
if (!loopback && !tls) throw new Error('LAN binding requires TLS_CERT_FILE and TLS_KEY_FILE.');
if (Boolean(tlsCert) !== Boolean(tlsKey)) throw new Error('Both TLS_CERT_FILE and TLS_KEY_FILE are required.');

const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
const routes = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/client.js', ['client.js', 'text/javascript; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']]
]);
const registry = new SessionRegistry();
const attempts = new Map();
const server = (tls ? createHttpsServer({
  cert: readFileSync(tlsCert), key: readFileSync(tlsKey)
}) : createHttpServer()) ;

server.on('request', (req, res) => {
  const route = routes.get((req.url || '').split('?')[0]);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; media-src blob:; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'");
  if (req.method !== 'GET' || !route) { res.writeHead(404); res.end('Not found'); return; }
  res.setHeader('Content-Type', route[1]);
  res.writeHead(200);
  res.end(readFileSync(join(publicDir, route[0])));
});

const wss = new WebSocketServer({
  server, path: '/signal', maxPayload: 32768,
  verifyClient: (info) => {
    const origin = info.req.headers.origin;
    const expected = (tls ? 'https://' : 'http://') + info.req.headers.host;
    return origin === expected;
  }
});

function send(ws, data) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
}
function failure(ws, error) {
  send(ws, { type: 'error', message: error instanceof Error ? error.message : 'Request rejected.' });
}
function permitAttempt(ip) {
  const now = Date.now();
  let entry = attempts.get(ip);
  if (!entry || now > entry.until) entry = { count: 0, until: now + 10 * 60 * 1000 };
  entry.count++;
  attempts.set(ip, entry);
  return entry.count <= 6;
}
function notifyViewerReady(room) {
  if (room.host && room.viewer) send(room.host, { type: 'viewer-ready' });
}

wss.on('connection', (ws, req) => {
  const ip = req.socket.remoteAddress || 'unknown';
  ws.on('message', (raw) => {
    let data;
    try { data = JSON.parse(raw.toString()); } catch { return failure(ws, 'Invalid message.'); }
    if (!data || typeof data !== 'object') return failure(ws, 'Invalid message.');
    try {
      if (data.type === 'create') {
        const info = registry.create(ws);
        send(ws, { type: 'created', ...info });
      } else if (data.type === 'join') {
        if (!permitAttempt(ip)) throw new Error('Too many pairing attempts. Try again later.');
        const info = registry.join(ws, data.code);
        send(ws, { type: 'joined', code: info.code, token: info.token, expiresAt: info.expiresAt });
        notifyViewerReady(registry.forClient(ws).record);
      } else if (data.type === 'resume') {
        // Resume tokens carry 256 bits of randomness. Avoid throttling valid rapid resumes.
        const { record, previous } = registry.resume(ws, data.code, data.role, data.token);
        if (previous && previous !== ws && previous.readyState === WebSocket.OPEN) previous.close(4001, 'Session moved');
        send(ws, { type: 'resumed', role: data.role, code: record.code, expiresAt: record.expiresAt });
        notifyViewerReady(record);
      } else if (data.type === 'signal') {
        const entry = registry.forClient(ws);
        if (!entry) throw new Error('Not authenticated to a session.');
        const payload = data.payload;
        if (!payload || !['offer', 'answer', 'candidate'].includes(payload.type)) throw new Error('Invalid signal.');
        if ((payload.type === 'offer' && entry.role !== 'host') ||
            (payload.type === 'answer' && entry.role !== 'viewer')) throw new Error('Invalid signaling direction.');
        const other = registry.peer(ws);
        if (other) send(other, { type: 'signal', payload });
      } else if (data.type === 'stop') {
        const peer = registry.peer(ws);
        registry.stop(ws);
        send(peer, { type: 'session-ended' });
        send(ws, { type: 'session-ended' });
      } else {
        throw new Error('Unknown request.');
      }
    } catch (err) { failure(ws, err); }
  });
  ws.on('close', () => {
    const entry = registry.detach(ws);
    if (entry) {
      const other = entry.role === 'host' ? entry.record.viewer : entry.record.host;
      send(other, { type: 'peer-disconnected' });
    }
  });
  ws.on('error', () => {});
});

const housekeeping = setInterval(() => {
  const now = Date.now();
  for (const room of registry.rooms.values()) {
    if (now >= room.expiresAt) {
      send(room.host, { type: 'session-ended' });
      send(room.viewer, { type: 'session-ended' });
    }
  }
  registry.prune();
  for (const [ip, entry] of attempts) if (now > entry.until) attempts.delete(ip);
}, 60000);
housekeeping.unref();
server.listen(port, host, () => {
  console.log('FLOATDESK research prototype at ' + (tls ? 'https://' : 'http://') + host + ':' + port);
  console.log('VIEW ONLY; no input injection or production security guarantees.');
});
