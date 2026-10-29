import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import vm from 'node:vm';
import { SessionRegistry } from '../src/registry.js';
import { RecoveryThrottle } from '../src/recovery.js';
import { ControlGrant } from '../src/control.js';
import { AppAccessGrant } from '../src/app-access.js';
import { TerminalPreviewGrant } from '../src/terminal-grant.js';
import { FilesGrant } from '../src/files-grant.js';

// Run the actual server dispatch with deterministic time and socket close states.
// Only network/OS boundaries are replaced; no native permission is exercised.
function harness() {
  let now = 0;
  let connection;
  let housekeeping;
  const brokers = [];
  const agents = [];
  class Clock extends Date { static now() { return now; } }
  class Socket extends EventEmitter {
    static OPEN = 1;
    readyState = 1;
    messages = [];
    send(json) { this.messages.push(JSON.parse(json)); }
    close() { this.readyState = 2; }
    request(data) { this.emit('message', Buffer.from(JSON.stringify(data))); }
    last(type) { return this.messages.filter(message => message.type === type).at(-1); }
  }
  const server = { on() {}, listen() {} };
  const context = vm.createContext({
    SessionRegistry: class extends SessionRegistry {
      constructor(_clock, options) { super(() => now, options); }
    },
    RecoveryThrottle,
    ControlGrant: class extends ControlGrant { constructor() { super(() => now); } },
    AppAccessGrant: class extends AppAccessGrant { constructor() { super(() => now); } },
    TerminalPreviewGrant: class extends TerminalPreviewGrant { constructor() { super(() => now); } },
    FilesGrant: class extends FilesGrant { constructor() { super(() => now); } },
    Date: Clock, WebSocket: Socket,
    WebSocketServer: class {
      on(type, callback) { if (type === 'connection') connection = callback; }
    },
    createHttpServer: () => server, createHttpsServer: () => server,
    fileURLToPath: () => '/unused', URL,
    process: { env: { FLOATDESK_NATIVE_FILES_BIN: '/fixture/helper', FLOATDESK_AGENT_BIN: '/fixture/agent' }, platform: 'darwin' },
    existsSync: () => true,
    spawn() {
      const child = new EventEmitter();
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.stdin = new EventEmitter();
      child.stdin.end = () => { throw new Error('fixture pipe failure'); };
      child.kill = () => { throw new Error('fixture signal failure'); };
      agents.push(child);
      return child;
    },
    startNativeFilesBroker() {
      const broker = {
        cancelled: 0,
        promise: Promise.resolve({ label: 'Fixture' }),
        cancel() { this.cancelled++; },
        list() { return new Promise(resolve => { this.resolveList = resolve; }); }
      };
      brokers.push(broker);
      return broker;
    },
    setInterval(callback) { housekeeping = callback; return { unref() {} }; },
    setTimeout() { return { unref() {} }; }, clearTimeout() {},
    console, Error
  });
  const source = readFileSync(new URL('../src/server.js', import.meta.url), 'utf8')
    .replace(/^import .*;\n/gm, '')
    .replace('import.meta.url', JSON.stringify(import.meta.url));
  vm.runInContext(source, context);
  function connect() {
    const socket = new Socket();
    connection(socket, { socket: { remoteAddress: '127.0.0.1' } });
    return socket;
  }
  const host = connect();
  host.request({ type: 'create' });
  const created = host.last('created');
  const viewer = connect();
  viewer.request({ type: 'join', code: created.code });
  const joined = viewer.last('joined');
  viewer.request({ type: 'terminal-request' });
  host.request({ type: 'terminal-approve' });
  assert.equal(viewer.last('terminal-state').state, 'active');
  return { host, viewer, created, joined, connect, housekeeping, brokers, agents, advance: value => { now = value; } };
}

test('request-triggered expiry revokes capabilities and sends session-ended before housekeeping', () => {
  const h = harness();
  h.advance(h.created.expiresAt);
  h.viewer.request({ type: 'request-video' });
  assert.equal(h.host.last('terminal-state').state, 'off');
  assert.equal(h.viewer.last('terminal-state').state, 'off');
  assert.equal(h.host.last('session-ended')?.type, 'session-ended');
  assert.equal(h.viewer.last('session-ended')?.type, 'session-ended');
  h.housekeeping();
  assert.equal(h.host.messages.filter(message => message.type === 'session-ended').length, 1);
});

test('resume revokes grants even while the displaced socket is closing', () => {
  const h = harness();
  h.viewer.close(); // close handshake has started; close event has not arrived
  const replacement = h.connect();
  replacement.request({ type: 'resume', role: 'viewer', code: h.created.code, token: h.joined.token });
  assert.equal(replacement.last('resumed')?.type, 'resumed');
  assert.equal(h.host.last('terminal-state').state, 'off');
  assert.equal(replacement.last('terminal-state').state, 'off');
  h.viewer.emit('close');
  replacement.request({ type: 'terminal-command', command: 'help' });
  assert.match(replacement.last('error').message, /not approved/);
});

test('async Files completion at session expiry cancels the broker and suppresses its result', async () => {
  const h = harness();
  h.advance(h.created.expiresAt - 1);
  h.viewer.request({ type: 'files-request' });
  h.host.request({ type: 'files-choose-root' });
  await Promise.resolve();
  assert.equal(h.viewer.last('files-state').state, 'active');
  h.viewer.request({ type: 'files-list', folder: '.' });
  h.advance(h.created.expiresAt);
  h.brokers[0].resolveList({ folder: '', entries: [], truncated: false });
  await Promise.resolve();
  assert.equal(h.brokers[0].cancelled, 1);
  assert.equal(h.viewer.last('files-list-result'), undefined);
  assert.equal(h.viewer.last('files-state').state, 'off');
  assert.equal(h.host.last('session-ended')?.type, 'session-ended');
});

test('viewer stop cannot revoke owner grants; host stop disposes once', () => {
  const h = harness();
  h.viewer.request({ type: 'stop' });
  assert.match(h.viewer.last('error').message, /Only the host/);
  assert.equal(h.host.last('terminal-state').state, 'active');
  h.host.request({ type: 'stop' });
  assert.equal(h.host.last('terminal-state').state, 'off');
  assert.equal(h.viewer.last('terminal-state').state, 'off');
  h.housekeeping();
  assert.equal(h.host.messages.filter(message => message.type === 'session-ended').length, 1);
});

test('native input cleanup errors cannot preserve grants or prevent session disposal', () => {
  const h = harness();
  h.host.request({ type: 'capture-state', active: true, surface: 'monitor' });
  h.viewer.request({ type: 'control-request' });
  h.host.request({ type: 'control-approve' });
  h.agents[0].stdout.emit('data', JSON.stringify({ type: 'ready', displays: 1 }) + '\n');
  assert.equal(h.viewer.last('control-state').state, 'active');
  h.host.request({ type: 'stop' });
  assert.equal(h.viewer.last('control-state').state, 'off');
  assert.equal(h.viewer.last('terminal-state').state, 'off');
  assert.equal(h.viewer.last('session-ended')?.type, 'session-ended');
  h.viewer.request({ type: 'control-click', x: 0.5, y: 0.5 });
  assert.match(h.viewer.last('error').message, /Only the paired viewer/);
});
