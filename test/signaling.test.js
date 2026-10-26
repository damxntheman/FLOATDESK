import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import WebSocket from 'ws';

// A full signaling smoke test: real HTTP listener, WebSocket clients and role separation.
test('WebSocket pairing, authorized relaying and session resumption', { timeout: 15000 }, async (t) => {
  const port = 20000 + Math.floor(Math.random() * 30000);
  const origin = 'http://127.0.0.1:' + port;
  const child = spawn(process.execPath, ['src/server.js'], {
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  child.stdout.on('data', (data) => { output += data.toString(); });
  child.stderr.on('data', (data) => { output += data.toString(); });
  const clients = [];
  t.after(() => {
    for (const client of clients) client.terminate();
    child.kill();
  });
  const ready = await new Promise((resolve, reject) => {
    const deadline = setTimeout(() => reject(new Error('Server did not start: ' + output)), 6000);
    const timer = setInterval(() => {
      if (output.includes('research prototype at')) {
        clearTimeout(deadline); clearInterval(timer); resolve(true);
      } else if (child.exitCode !== null) {
        clearTimeout(deadline); clearInterval(timer); reject(new Error('Server exited: ' + output));
      }
    }, 25);
  });
  assert.equal(ready, true);

  async function connect() {
    const ws = new WebSocket(origin.replace('http:', 'ws:') + '/signal', { origin });
    clients.push(ws);
    await new Promise((resolve, reject) => {
      ws.once('open', resolve);
      ws.once('error', reject);
    });
    return ws;
  }
  function receive(ws, type) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        ws.off('message', onMessage);
        reject(new Error('No ' + type + ' message received'));
      }, 3000);
      function onMessage(bytes) {
        const data = JSON.parse(bytes.toString());
        if (data.type === type) {
          clearTimeout(timer); ws.off('message', onMessage); resolve(data);
        }
      }
      ws.on('message', onMessage);
    });
  }
  function send(ws, data) { ws.send(JSON.stringify(data)); }

  const host = await connect();
  const createdMessage = receive(host, 'created');
  send(host, { type: 'create' });
  const created = await createdMessage;
  assert.match(created.code, /^[A-HJ-NP-Z2-9]{8}$/);

  const stranger = await connect();
  const deniedMessage = receive(stranger, 'error');
  send(stranger, { type: 'signal', payload: { type: 'offer', sdp: {} } });
  const denied = await deniedMessage;
  assert.match(denied.message, /Not authenticated/);

  const viewer = await connect();
  const joinedMessage = receive(viewer, 'joined');
  const readyMessage = receive(host, 'viewer-ready');
  send(viewer, { type: 'join', code: created.code });
  const joined = await joinedMessage;
  await readyMessage;
  assert.ok(joined.token);
  const relayMessage = receive(viewer, 'signal');
  send(host, { type: 'signal', payload: { type: 'offer', id: 'a1b2c3d4-1111-4111-8111-a1b2c3d4e5f6', sdp: { type: 'offer', sdp: 'v=0' } } });
  assert.equal((await relayMessage).payload.type, 'offer');
  const rejectedViewerCapture = receive(viewer, 'error');
  send(viewer, { type: 'capture-state', active: false });
  assert.match((await rejectedViewerCapture).message, /Only a paired host/);
  const captureMessage = receive(viewer, 'capture-state');
  send(host, { type: 'capture-state', active: true });
  assert.equal((await captureMessage).active, true);
  const badSignalMessage = receive(host, 'error');
  send(host, { type: 'signal', payload: { type: 'offer', id: 'invalid', sdp: { type: 'offer', sdp: '' } } });
  assert.match((await badSignalMessage).message, /Invalid signal/);

  const disconnectMessage = receive(host, 'peer-disconnected');
  viewer.close();
  await disconnectMessage;
  const resumed = await connect();
  const resumedMessage = receive(resumed, 'resumed');
  const readyAgain = receive(host, 'viewer-ready');
  send(resumed, { type: 'resume', role: 'viewer', code: created.code, token: joined.token });
  assert.equal((await resumedMessage).role, 'viewer');
  await readyAgain;
  const endMessage = receive(resumed, 'session-ended');
  send(host, { type: 'stop' });
  await endMessage;
});
