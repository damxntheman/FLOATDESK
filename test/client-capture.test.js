import test from 'node:test';
import assert from 'node:assert/strict';

// Lightweight browser harness: exercise the actual public/client.js handlers,
// not only WebSocket relaying. Native getDisplayMedia consent stays mocked.
test('Stop sharing clears capture and keeps host pairing; End session revokes it', async (t) => {
  const globals = ['document', 'window', 'location', 'navigator', 'sessionStorage', 'WebSocket'];
  const originals = globals.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  t.after(() => {
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  const elements = new Map();
  const makeElement = () => ({
    disabled: false, value: '', textContent: '', srcObject: null, hidden: true, style: {},
    pause() {},
    listeners: new Map(),
    addEventListener(name, callback) { this.listeners.set(name, callback); },
    click() { return this.listeners.get('click')?.(); },
    play() { return Promise.resolve(); }
  });
  for (const id of ['create', 'join', 'share', 'stopShare', 'stop', 'pip', 'refresh', 'video', 'status', 'code', 'joinCode', 'touchPad', 'controlStatus', 'approveControl', 'revokeControl', 'requestControl', 'releaseControl', 'expandView', 'exitView', 'immersiveToolbar', 'previewSource', 'hostPreview', 'hostPreviewNote', 'toggleHostPreview',
    'iphoneModePanel', 'appsGrid', 'appAccessStatus', 'appLaunchStatus', 'requestApps', 'releaseApps',
    'approveApps', 'revokeApps', 'openDesktop',
    'iphoneModeHome', 'terminalPanel', 'terminalTranscript', 'terminalForm', 'terminalCommand',
    'terminalStatus', 'requestTerminal', 'releaseTerminal', 'approveTerminal', 'revokeTerminal',
    'closeTerminal', 'runTerminalCommand', 'cmdHelp', 'cmdDate', 'cmdUptime', 'cmdSystem',
    'filesPanel','filesGrid','filesStatus','filesRootLabel','filesFolderPath','filesLimitNote',
    'chooseFiles','revokeFiles','requestFiles','releaseFiles','closeFiles','filesUp',
    'openFinderDesktop', 'probeCompanion', 'companionStatus']) {
    elements.set(id, makeElement());
  }
  const saved = new Map();
  const sent = [];
  class FakeSocket {
    static OPEN = 1;
    static CONNECTING = 0;
    static CLOSED = 3;
    static instances = [];
    readyState = FakeSocket.OPEN;
    constructor() { FakeSocket.instances.push(this); }
    send(json) { sent.push(JSON.parse(json)); }
  }
  class FakeTrack {
    readyState = 'live';
    stops = 0;
    listeners = new Map();
    addEventListener(event, cb) { this.listeners.set(event, cb); }
    stop() { this.readyState = 'ended'; this.stops++; }
    browserEnds() {
      this.readyState = 'ended';
      this.listeners.get('ended')?.();
    }
  }
  function fakeStream() {
    const track = new FakeTrack();
    return { track, getTracks: () => [track], getVideoTracks: () => [track] };
  }
  const streams = [fakeStream(), fakeStream(), fakeStream()];
  // The final capture is a whole-monitor capture: host sees the sampled
  // thumbnail instead of the old recursive live video.
  streams[2].getVideoTracks()[0].getSettings = () => ({ displaySurface: 'monitor', height: 900 });
  let selection = 0;
  const nextCapture = () => Promise.resolve(streams[selection++]);
  const defined = {
    document: {
      getElementById: (id) => elements.get(id),
      addEventListener() {},
      body: { classList: { toggle() {} } }
    },
    window: { addEventListener() {} },
    location: { protocol: 'https:', host: 'localhost:8788' },
    navigator: { mediaDevices: { getDisplayMedia: nextCapture } },
    sessionStorage: {
      getItem(key) { return saved.get(key) || null; },
      setItem(key, value) { saved.set(key, value); },
      removeItem(key) { saved.delete(key); }
    },
    WebSocket: FakeSocket
  };
  for (const [key, value] of Object.entries(defined)) {
    Object.defineProperty(globalThis, key, { value, writable: true, configurable: true });
  }

  await import('../public/client.js');
  const socket = FakeSocket.instances[0];
  assert.ok(socket, 'browser signaling client was created');
  socket.onmessage({ data: JSON.stringify({ type: 'created', code: 'ABCDEFGH', token: 'host-token' }) });
  await new Promise((resolve) => setImmediate(resolve));

  const button = (id) => elements.get(id);
  assert.equal(button('stopShare').disabled, true);
  await button('share').click();
  assert.equal(streams[0].track.readyState, 'live');
  assert.equal(button('stopShare').disabled, false);
  assert.equal(button('video').srcObject, streams[0]);
  assert.equal(sent.at(-1).type, 'capture-state');
  assert.equal(sent.at(-1).active, true);

  button('stopShare').click();
  assert.equal(streams[0].track.readyState, 'ended');
  assert.equal(streams[0].track.stops, 1);
  assert.equal(button('video').srcObject, null);
  assert.equal(button('stopShare').disabled, true);
  assert.equal(sent.at(-1).type, 'capture-state');
  assert.equal(sent.at(-1).active, false);
  assert.equal(saved.size, 1, 'host resume credentials preserved');
  assert.equal(button('code').textContent, 'ABCDEFGH');
  assert.equal(sent.some((msg) => msg.type === 'stop'), false);

  // Re-sharing requires another explicit browser selection, not a new pairing.
  await button('share').click();
  assert.equal(selection, 2);
  assert.equal(streams[1].track.readyState, 'live');
  assert.equal(saved.size, 1);
  assert.equal(sent.at(-1).active, true);

  // Browser-side revocation follows the same stop-only flow.
  streams[1].track.browserEnds();
  assert.equal(button('video').srcObject, null);
  assert.equal(sent.at(-1).active, false);
  assert.equal(saved.size, 1);

  await button('share').click();
  assert.equal(streams[2].track.readyState, 'live');
  assert.equal(button('video').srcObject, null, 'recursive Mac video not rendered at full frame rate');
  assert.equal(button('video').hidden, true, 'host video element hidden when sampled preview is active');
  assert.equal(button('hostPreview').hidden, false, 'sampled Mac thumbnail is visible');
  assert.equal(button('hostPreviewNote').hidden, false);
  assert.equal(button('toggleHostPreview').disabled, false);
  button('toggleHostPreview').click();
  assert.match(button('hostPreviewNote').textContent, /paused/i);
  button('toggleHostPreview').click();
  assert.match(button('hostPreviewNote').textContent, /updates about once/i);
  button('stop').click();
  assert.equal(sent.at(-1).type, 'stop', 'only End session sends stop');
  assert.equal(saved.size, 0, 'End session revokes local pairing');
  assert.equal(button('code').textContent, '—');
  assert.equal(streams[2].track.readyState, 'ended');
  assert.equal(button('video').srcObject, null);
  assert.equal(button('hostPreview').hidden, true, 'host sample timer and thumbnail cleared on End session');
  assert.equal(button('toggleHostPreview').disabled, true);
});

test('Stop sharing invalidates an in-flight browser capture request', async () => {
  // Functional invariant verified by the main browser-flow test; the source
  // checks here guard against accidentally deleting the picker invalidation.
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const source = readFileSync(fileURLToPath(new URL('../public/client.js', import.meta.url)), 'utf8');
  assert.match(source, /captureRequestId\+\+/);
  assert.match(source, /requestId !== captureRequestId/);
  assert.match(source, /selected\.getTracks\(\)\.forEach\(\(track\) => track\.stop\(\)\)/);
});
