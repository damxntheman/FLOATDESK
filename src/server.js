import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';
import { SessionRegistry } from './registry.js';
import { RecoveryThrottle } from './recovery.js';
import { ControlGrant } from './control.js';

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
  ['/ice-queue.js', ['ice-queue.js', 'text/javascript; charset=utf-8']],
  ['/touch-mapping.js', ['touch-mapping.js', 'text/javascript; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']]
]);
const registry = new SessionRegistry();
const attempts = new Map();
const recoveryThrottle = new RecoveryThrottle();
const controlGrants = new WeakMap();
const controlAgents = new WeakMap();
const nativeAgentPath = process.env.FLOATDESK_AGENT_BIN || '';
function grantFor(room) {
  if (!controlGrants.has(room)) controlGrants.set(room, new ControlGrant());
  return controlGrants.get(room);
}
function controlStatus(room, state, message = '') {
  send(room.host, { type: 'control-state', state, message });
  send(room.viewer, { type: 'control-state', state, message });
}
function revokeControl(room, reason = 'Touch control is off.') {
  if (!room) return;
  const child = controlAgents.get(room);
  if (child) {
    controlAgents.delete(room);
    // Stop accepting native events immediately. Child exit is not an authorization boundary.
    child.stdin.end();
    if (!child.killed) child.kill();
  }
  const grant = grantFor(room);
  const previously = grant.phase;
  grant.revoke();
  if (previously !== 'off') controlStatus(room, 'off', reason);
}
function isLocalPeer(ip) {
  return ip === '::1' || ip === '127.0.0.1' || ip.startsWith('::ffff:127.');
}
function startNativeAgent(room) {
  const agentPath = nativeAgentPath;
  if (process.platform !== 'darwin' || !agentPath || !existsSync(agentPath)) {
    revokeControl(room, 'Mac touch-control agent is not configured or not found.');
    return;
  }
  let child;
  try { child = spawn(agentPath, [], { stdio: ['pipe', 'pipe', 'pipe'] }); }
  catch (error) { revokeControl(room, 'Mac agent could not start: ' + error.message); return; }
  controlAgents.set(room, child);
  // No arbitrary native commands are executed from viewer messages.
  let done = false;
  let buffer = '';
  const timeout = setTimeout(() => {
    if (!done) revokeControl(room, 'Mac agent did not become ready.');
  }, 10000);
  timeout.unref();
  function fail(reason) {
    // Exit/error must revoke control even AFTER the agent sent its ready signal.
    if (controlAgents.get(room) !== child) return;
    clearTimeout(timeout);
    done = true;
    revokeControl(room, reason);
  }
  child.stdin.on('error', () => fail('Mac input pipe failed; control revoked.'));
  child.stderr.on('data', () => {}); // Drain stderr; never send internal paths to viewer.
  child.on('error', () => fail('Mac touch-control agent failed to start.'));
  child.on('exit', () => fail('Mac touch-control agent exited. Control revoked.'));
  child.stdout.on('data', (chunk) => {
    if (done || controlAgents.get(room) !== child) return;
    buffer += String(chunk);
    if (buffer.length > 4096) { fail('Invalid Mac agent response.'); return; }
    const index = buffer.indexOf('\n');
    if (index < 0) return;
    let message;
    try { message = JSON.parse(buffer.slice(0, index)); }
    catch { fail('Invalid Mac agent response.'); return; }
    if (message?.type !== 'ready' || message.displays !== 1) {
      fail(typeof message?.message === 'string' ? message.message.slice(0, 300) : 'Mac agent refused touch control.');
      return;
    }
    clearTimeout(timeout);
    done = true;
    const grant = grantFor(room);
    if (grant.phase !== 'starting' || !room.host || !room.viewer || room.captureSurface !== 'monitor') {
      revokeControl(room);
      return;
    }
    grant.activate();
    controlStatus(room, 'active', 'Touch-to-click enabled for 2 minutes. Revoke control on Mac to stop.');
  });
}
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
        if (previous && previous !== ws && previous.readyState === WebSocket.OPEN) {
          // An old socket is displaced. Never transfer an input grant across sockets.
          revokeControl(record, 'Touch control revoked when a device resumed its session.');
          previous.close(4001, 'Session moved');
        }
        send(ws, { type: 'resumed', role: data.role, code: record.code, expiresAt: record.expiresAt });
        notifyViewerReady(record);
      } else if (data.type === 'signal') {
        const entry = registry.forClient(ws);
        if (!entry) throw new Error('Not authenticated to a session.');
        const payload = data.payload;
        if (!payload || !['offer', 'answer', 'candidate'].includes(payload.type) ||
            typeof payload.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(payload.id)) {
          throw new Error('Invalid signal.');
        }
        if (payload.type === 'candidate' &&
            (!payload.candidate || typeof payload.candidate.candidate !== 'string')) {
          throw new Error('Invalid ICE candidate.');
        }
        if (['offer', 'answer'].includes(payload.type) &&
            (!payload.sdp || payload.sdp.type !== payload.type || typeof payload.sdp.sdp !== 'string')) {
          throw new Error('Invalid session description.');
        }
        if ((payload.type === 'offer' && entry.role !== 'host') ||
            (payload.type === 'answer' && entry.role !== 'viewer')) throw new Error('Invalid signaling direction.');
        const other = registry.peer(ws);
        if (other) send(other, { type: 'signal', payload });
      } else if (data.type === 'capture-state') {
        const entry = registry.forClient(ws);
        if (!entry || entry.role !== 'host' || typeof data.active !== 'boolean') {
          throw new Error('Only a paired host can change capture status.');
        }
        const room = entry.record;
        revokeControl(room, 'Touch control revoked because capture changed.');
        room.captureSurface = data.active ? (data.surface === 'monitor' ? 'monitor' : 'other') : null;
        send(registry.peer(ws), { type: 'capture-state', active: data.active });
      } else if (data.type === 'control-request') {
        const entry = registry.forClient(ws);
        if (!entry || entry.role !== 'viewer') throw new Error('Only the paired iPhone viewer can request control.');
        const room = entry.record;
        if (!room.host || room.captureSurface !== 'monitor') {
          throw new Error('Mac must be sharing its entire screen to enable touch control.');
        }
        if (!nativeAgentPath || process.platform !== 'darwin') {
          throw new Error('Mac companion is not configured. View-only mode remains available.');
        }
        grantFor(room).request();
        controlStatus(room, 'requested', 'iPhone requests touch-to-click. Approve on the Mac within 30 seconds.');
      } else if (data.type === 'control-approve') {
        const entry = registry.forClient(ws);
        if (!entry || entry.role !== 'host' || !isLocalPeer(ip)) {
          throw new Error('Touch control approval is allowed only from the paired host on this Mac.');
        }
        const room = entry.record;
        if (!room.viewer || room.captureSurface !== 'monitor') {
          throw new Error('Control requires a paired viewer and full-screen capture.');
        }
        grantFor(room).approve();
        controlStatus(room, 'starting', 'Mac is checking Accessibility permission…');
        startNativeAgent(room);
      } else if (data.type === 'control-revoke') {
        const entry = registry.forClient(ws);
        if (!entry || (entry.role !== 'host' && entry.role !== 'viewer')) {
          throw new Error('Only a paired device can end control.');
        }
        if (entry.role === 'host' && !isLocalPeer(ip)) {
          throw new Error('Mac must revoke control locally.');
        }
        revokeControl(entry.record, 'Touch control stopped by the paired device.');
      } else if (data.type === 'control-click') {
        const entry = registry.forClient(ws);
        if (!entry || entry.role !== 'viewer') throw new Error('Only the paired viewer can click.');
        const room = entry.record;
        const agent = controlAgents.get(room);
        if (!agent || !room.host || room.captureSurface !== 'monitor') {
          throw new Error('Mac touch control is unavailable.');
        }
        const click = grantFor(room).click(data.x, data.y);
        if (!agent.stdin.writable || agent.stdin.writableLength > 1024) {
          revokeControl(room, 'Mac control input channel is unavailable.');
          return;
        }
        agent.stdin.write(JSON.stringify(click) + '\n');
      } else if (data.type === 'request-video') {
        const entry = registry.forClient(ws);
        if (!entry || entry.role !== 'viewer') {
          throw new Error('Only an authenticated viewer can refresh the video.');
        }
        const hostSocket = registry.peer(ws);
        if (!hostSocket || hostSocket.readyState !== WebSocket.OPEN) {
          throw new Error('Mac host is unavailable. Reconnect the host first.');
        }
        if (!recoveryThrottle.permit(entry.record)) {
          throw new Error('Refresh requested recently. Wait a few seconds before trying again.');
        }
        send(hostSocket, { type: 'viewer-video-recovery-requested' });
        send(ws, { type: 'recovery-request-accepted' });
      } else if (data.type === 'stop') {
        const entry = registry.forClient(ws);
        if (entry) revokeControl(entry.record, 'Session ended.');
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
      revokeControl(entry.record, 'A device disconnected; touch control revoked.');
      if (entry.role === 'host') entry.record.captureSurface = null;
      const other = entry.role === 'host' ? entry.record.viewer : entry.record.host;
      send(other, { type: 'peer-disconnected' });
    }
  });
  ws.on('error', () => {});
});

const housekeeping = setInterval(() => {
  const now = Date.now();
  for (const room of registry.rooms.values()) {
    const grant = grantFor(room);
    if (grant.expired()) revokeControl(room, 'Touch control approval expired.');
    if (now >= room.expiresAt) {
      revokeControl(room, 'Session expired.');
      send(room.host, { type: 'session-ended' });
      send(room.viewer, { type: 'session-ended' });
    }
  }
  registry.prune();
  for (const [ip, entry] of attempts) if (now > entry.until) attempts.delete(ip);
}, 1000);
housekeeping.unref();
server.listen(port, host, () => {
  console.log('FLOATDESK research prototype at ' + (tls ? 'https://' : 'http://') + host + ':' + port);
  console.log(nativeAgentPath ? 'M2 experimental Mac click agent configured. Control requires local host approval and macOS Accessibility.' : 'VIEW ONLY; Mac click agent not configured.');
});
