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
import { AppAccessGrant } from './app-access.js';
import { discoverMacApps, publicCatalog, launchCatalogApp } from './mac-apps.js';
import { TerminalPreviewGrant } from './terminal-grant.js';
import { runTerminalPreview } from './terminal-preview.js';
import { FilesGrant } from './files-grant.js';
import { openMacFolderPicker } from './folder-picker.js';
import { listSafeMetadata } from './files-policy.js';

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
const appGrants = new WeakMap();
const terminalGrants = new WeakMap();
const filesGrants = new WeakMap();
const filesRoots = new WeakMap();
const filesPickers = new WeakMap();
const nativePickerPath = process.env.FLOATDESK_FOLDER_PICKER_BIN || '';
const nativeAgentPath = process.env.FLOATDESK_AGENT_BIN || '';
function appGrantFor(room) {
  if (!appGrants.has(room)) appGrants.set(room, new AppAccessGrant());
  return appGrants.get(room);
}
function appStatus(room, state, message = '') {
  send(room.host, { type: 'app-access-state', state, message });
  send(room.viewer, { type: 'app-access-state', state, message });
}
function revokeAppAccess(room, reason = 'Mac app access is off.') {
  if (!room) return;
  const grant = appGrantFor(room);
  const previously = grant.phase;
  grant.revoke();
  if (previously !== 'off') appStatus(room, 'off', reason);
}
function terminalGrantFor(room) {
  if (!terminalGrants.has(room)) terminalGrants.set(room, new TerminalPreviewGrant());
  return terminalGrants.get(room);
}
function terminalStatus(room, state, message = '') {
  send(room.host, { type:'terminal-state', state, message });
  send(room.viewer, { type:'terminal-state', state, message });
}
function revokeTerminal(room, reason = 'Terminal Preview disabled.') {
  if (!room) return;
  const grant = terminalGrantFor(room);
  const previous = grant.phase;
  grant.revoke();
  if (previous !== 'off') terminalStatus(room, 'off', reason);
}
function filesGrantFor(room) {
  if (!filesGrants.has(room)) filesGrants.set(room, new FilesGrant());
  return filesGrants.get(room);
}
function filesStatus(room, state, message = '') {
  send(room.host, { type:'files-state', state, message });
  send(room.viewer, { type:'files-state', state, message });
}
function revokeFiles(room, reason = 'Files access is off.') {
  if (!room) return;
  const job = filesPickers.get(room);
  if (job) {
    filesPickers.delete(room);
    job.cancel(); // abandon picker; stale responses cannot reactivate access
  }
  filesRoots.delete(room);
  const grant = filesGrantFor(room);
  const before = grant.phase;
  grant.revoke();
  if (before !== 'off') filesStatus(room, 'off', reason);
}
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
          revokeAppAccess(record, 'Mac app access revoked when a device resumed its session.');
          revokeTerminal(record, 'Terminal Preview disabled when device resumed.');
          revokeFiles(record, 'Files access revoked when device resumed.');
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
      } else if (data.type === 'app-access-request') {
        const entry = registry.forClient(ws);
        if (!entry || entry.role !== 'viewer') throw new Error('Only the paired phone can request Mac app access.');
        const room = entry.record;
        if (!room.host || process.platform !== 'darwin') {
          throw new Error('iPhone Mode app control requires a connected Mac host.');
        }
        appGrantFor(room).request();
        appStatus(room, 'requested', 'Phone requests Mac app access. Approve locally within 30 seconds.');
      } else if (data.type === 'app-access-approve') {
        const entry = registry.forClient(ws);
        if (!entry || entry.role !== 'host' || !isLocalPeer(ip)) {
          throw new Error('Only the connected Mac host can approve app access locally.');
        }
        const room = entry.record;
        if (!room.viewer) throw new Error('A paired phone is required.');
        appGrantFor(room).approve();
        appStatus(room, 'active', 'Mac approved application access for 5 minutes.');
      } else if (data.type === 'app-access-revoke') {
        const entry = registry.forClient(ws);
        if (!entry || !['host','viewer'].includes(entry.role) ||
            (entry.role === 'host' && !isLocalPeer(ip))) {
          throw new Error('Only the paired phone or local Mac host can revoke app access.');
        }
        revokeAppAccess(entry.record, 'Mac app access revoked.');
      } else if (data.type === 'app-list') {
        const entry = registry.forClient(ws);
        if (!entry || entry.role !== 'viewer') throw new Error('Only the paired phone can browse Mac apps.');
        appGrantFor(entry.record).check();
        send(ws, { type:'app-list-result', apps:publicCatalog(discoverMacApps()) });
      } else if (data.type === 'app-launch') {
        const entry = registry.forClient(ws);
        if (!entry || entry.role !== 'viewer') throw new Error('Only the paired phone can launch Mac apps.');
        const room = entry.record;
        if (!room.host || room.host.readyState !== WebSocket.OPEN) {
          throw new Error('Mac host has disconnected.');
        }
        appGrantFor(room).useAction();
        // Resolve the ID against a *fresh local catalog*. The phone never
        // sends launch paths, shell commands or executable arguments.
        const catalog = discoverMacApps();
        const id = data.id;
        launchCatalogApp(id, { apps:catalog })
          .then(({ id:launchedId, name }) => {
            if (registry.forClient(ws)?.record === room && appGrantFor(room).phase === 'active') {
              send(ws, { type:'app-launch-result', id:launchedId, name });
            }
          })
          .catch(() => failure(ws, 'Mac could not open that app. Confirm it is installed and accessible.'));
      } else if (data.type === 'terminal-request') {
        const entry = registry.forClient(ws);
        if (!entry || entry.role !== 'viewer') {
          throw new Error('Only the paired phone can request Terminal Preview.');
        }
        const room = entry.record;
        if (!room.host || room.host.readyState !== WebSocket.OPEN || process.platform !== 'darwin') {
          throw new Error('Terminal Preview requires a connected Mac host.');
        }
        terminalGrantFor(room).request();
        terminalStatus(room, 'requested', 'Phone requests read-only Terminal Preview. Approve on Mac within 30 seconds.');
      } else if (data.type === 'terminal-approve') {
        const entry = registry.forClient(ws);
        if (!entry || entry.role !== 'host' || !isLocalPeer(ip)) {
          throw new Error('Terminal Preview can only be approved on the local Mac.');
        }
        const room = entry.record;
        if (!room.viewer || room.viewer.readyState !== WebSocket.OPEN) {
          throw new Error('Terminal Preview requires a paired, connected phone.');
        }
        terminalGrantFor(room).approve();
        terminalStatus(room, 'active', 'Read-only Mac diagnostics approved for 3 minutes; this is not a shell.');
      } else if (data.type === 'terminal-revoke') {
        const entry = registry.forClient(ws);
        if (!entry || !['host', 'viewer'].includes(entry.role) ||
            (entry.role === 'host' && !isLocalPeer(ip))) {
          throw new Error('Only paired devices may revoke Terminal Preview.');
        }
        revokeTerminal(entry.record, 'Terminal Preview permission revoked.');
      } else if (data.type === 'terminal-command') {
        const entry = registry.forClient(ws);
        if (!entry || entry.role !== 'viewer') {
          throw new Error('Only paired phone may request Terminal Preview output.');
        }
        const room = entry.record;
        if (!room.host || room.host.readyState !== WebSocket.OPEN) {
          throw new Error('Mac host disconnected.');
        }
        const grant = terminalGrantFor(room);
        grant.check();
        // Allowlist validator runs before using the rate-limited capability.
        const lines = runTerminalPreview(data.command);
        grant.useAction();
        send(ws, { type:'terminal-output', command:data.command, lines });
      } else if (data.type === 'files-request') {
        const entry = registry.forClient(ws);
        if (!entry || entry.role !== 'viewer') {
          throw new Error('Only a paired phone can request Files Mode access.');
        }
        const room = entry.record;
        if (!room.host || room.host.readyState !== WebSocket.OPEN || process.platform !== 'darwin' ||
            !nativePickerPath || !existsSync(nativePickerPath)) {
          throw new Error('A connected Mac with a native folder picker is required for Files Mode.');
        }
        filesGrantFor(room).request();
        filesStatus(room, 'requested', 'Phone requests read-only folder names. Choose a folder on this Mac within 30 seconds.');
      } else if (data.type === 'files-choose-root') {
        const entry = registry.forClient(ws);
        if (!entry || entry.role !== 'host' || !isLocalPeer(ip)) {
          throw new Error('Only the local Mac owner can choose a Files Mode folder.');
        }
        const room = entry.record;
        if (!room.viewer || room.viewer.readyState !== WebSocket.OPEN) {
          throw new Error('A connected paired phone is required.');
        }
        if (filesPickers.has(room)) throw new Error('Folder picker is already open.');
        const grant = filesGrantFor(room);
        grant.beginSelection();
        let job;
        try {
          job = openMacFolderPicker({ binary:nativePickerPath });
        } catch {
          revokeFiles(room, 'Unable to open Mac folder picker. Files access is off.');
          throw new Error('Mac folder picker unavailable.');
        }
        filesPickers.set(room, job);
        filesStatus(room, 'selecting', 'Choose a specific folder in the native Mac dialog. Cancel to deny access.');
        job.promise.then(selection => {
          if (filesPickers.get(room) !== job) return;
          filesPickers.delete(room);
          if (registry.forClient(ws)?.record !== room || !room.viewer ||
              grant.phase !== 'selecting') {
            revokeFiles(room, 'Folder permission expired or Mac disconnected.');
            return;
          }
          try {
            grant.approveWithSelection(selection);
            filesRoots.set(room, selection.root); // never returned to phone
            filesStatus(room, 'active', 'Read-only folder names shared for five minutes.');
            send(room.viewer, { type:'files-root', label:selection.label });
          } catch {
            revokeFiles(room, 'Mac folder selection expired; Files access is off.');
          }
        }).catch(() => {
          if (filesPickers.get(room) !== job) return;
          filesPickers.delete(room);
          revokeFiles(room, 'Mac folder selection cancelled or failed.');
        });
      } else if (data.type === 'files-revoke') {
        const entry = registry.forClient(ws);
        if (!entry || !['host','viewer'].includes(entry.role) ||
            (entry.role === 'host' && !isLocalPeer(ip))) {
          throw new Error('Only a paired phone or local Mac owner can revoke Files Mode.');
        }
        revokeFiles(entry.record, 'Read-only Files access revoked.');
      } else if (data.type === 'files-list') {
        const entry = registry.forClient(ws);
        if (!entry || entry.role !== 'viewer') {
          throw new Error('Only the paired phone can browse selected Mac folder names.');
        }
        const room = entry.record;
        const grant = filesGrantFor(room);
        grant.check();
        const selectedRoot = filesRoots.get(room);
        if (!selectedRoot) throw new Error('Mac has not selected a folder.');
        try {
          grant.useAction();
          const result = listSafeMetadata(selectedRoot, data.folder === undefined ? '.' : data.folder);
          send(ws, { type:'files-list-result', ...result });
        } catch {
          // Never send internal Mac paths, OS error strings or file contents.
          throw new Error('Folder unavailable, invalid, or requested too quickly.');
        }
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
        if (entry) {
          revokeControl(entry.record, 'Session ended.');
          revokeAppAccess(entry.record, 'Session ended.');
          revokeTerminal(entry.record, 'Session ended.');
          revokeFiles(entry.record, 'Session ended.');
        }
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
      revokeAppAccess(entry.record, 'A device disconnected; Mac app access revoked.');
      revokeTerminal(entry.record, 'A device disconnected; Terminal Preview revoked.');
      revokeFiles(entry.record, 'A device disconnected; Files access revoked.');
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
    if (appGrantFor(room).expired()) revokeAppAccess(room, 'Mac app access expired. Request permission again.');
    if (terminalGrantFor(room).expired()) revokeTerminal(room, 'Terminal Preview expired. Request fresh approval.');
    if (filesGrantFor(room).expired()) revokeFiles(room, 'Files Mode permission expired. Request again.');
    if (now >= room.expiresAt) {
      revokeControl(room, 'Session expired.');
      revokeAppAccess(room, 'Session expired.');
      revokeTerminal(room, 'Session expired.');
      revokeFiles(room, 'Session expired.');
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
