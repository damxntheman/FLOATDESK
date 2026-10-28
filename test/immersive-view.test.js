import test from 'node:test';
import assert from 'node:assert/strict';

// Run the actual viewer event handlers against a tiny DOM, keeping all input
// local and never sending Mac clicks during this layout-only regression.
test('control approval expands mobile viewer, exit revokes and leaves pairing intact', async (t) => {
  const globals = ['document', 'window', 'location', 'navigator', 'sessionStorage', 'WebSocket'];
  const before = globals.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]);
  t.after(() => {
    for (const [name, descriptor] of before) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  });
  const list = new Map();
  function el() {
    return {
      disabled: false, hidden: true, textContent: '', srcObject: null, controls: true, style: {},
      listeners: {},
      addEventListener(type, cb) { this.listeners[type] = cb; },
      click() { return this.listeners.click?.(); },
      play() { return Promise.resolve(); }
    };
  }
  const ids = [
    'create', 'join', 'share', 'stopShare', 'stop', 'pip', 'refresh', 'video',
    'status', 'code', 'joinCode', 'touchPad', 'controlStatus',
    'approveControl', 'revokeControl', 'requestControl', 'releaseControl',
    'expandView', 'exitView', 'immersiveToolbar', 'previewSource', 'hostPreview', 'hostPreviewNote', 'toggleHostPreview',
    'iphoneModePanel', 'appsGrid', 'appAccessStatus', 'appLaunchStatus', 'requestApps', 'releaseApps',
    'approveApps', 'revokeApps', 'openDesktop',
    'iphoneModeHome', 'terminalPanel', 'terminalTranscript', 'terminalForm', 'terminalCommand',
    'terminalStatus', 'requestTerminal', 'releaseTerminal', 'approveTerminal', 'revokeTerminal',
    'closeTerminal', 'runTerminalCommand', 'cmdHelp', 'cmdDate', 'cmdUptime', 'cmdSystem',
    'filesPanel','filesGrid','filesStatus','filesRootLabel','filesFolderPath','filesLimitNote',
    'chooseFiles','revokeFiles','requestFiles','releaseFiles','closeFiles','filesUp',
    'openFinderDesktop', 'probeCompanion', 'companionStatus', 'inspectNativeHost',
    'nativeHostStatus', 'nativeHostServices'
  ];
  ids.forEach((id) => list.set(id, el()));
  const classes = new Set();
  const saved = new Map();
  const sent = [];
  let socket;
  class FakeSocket {
    static OPEN = 1;
    static CONNECTING = 0;
    static CLOSED = 3;
    readyState = 1;
    constructor() { socket = this; }
    send(json) { sent.push(JSON.parse(json)); }
  }
  const define = {
    document: {
      body: {
        classList: {
          toggle(name, active) { if (active) classes.add(name); else classes.delete(name); },
          contains(name) { return classes.has(name); }
        }
      },
      getElementById(id) { return list.get(id); },
      addEventListener() {}
    },
    window: { addEventListener() {} },
    location: { protocol: 'https:', host: 'example.invalid:8788' },
    navigator: {},
    sessionStorage: {
      getItem(key) { return saved.get(key) || null; },
      setItem(key, value) { saved.set(key, value); },
      removeItem(key) { saved.delete(key); }
    },
    WebSocket: FakeSocket
  };
  for (const [key, value] of Object.entries(define)) {
    Object.defineProperty(globalThis, key, { value, writable: true, configurable: true });
  }
  await import('../public/client.js');
  const view = (id) => list.get(id);
  async function message(payload) {
    socket.onmessage({ data: JSON.stringify(payload) });
    await new Promise((resolve) => setImmediate(resolve));
  }
  await message({ type: 'joined', code: 'ABCDEFGH', token: 'viewer-token' });
  assert.equal(view('expandView').disabled, false);
  assert.equal(classes.has('control-focus'), false);

  // A normal tap on the preview or Expand desktop enters read-only view.
  view('video').srcObject = {};
  view('video').click();
  assert.equal(classes.has('control-focus'), true);
  assert.equal(view('immersiveToolbar').hidden, false);
  assert.equal(view('video').controls, false);
  view('exitView').click();
  assert.equal(classes.has('control-focus'), false);
  assert.equal(sent.length, 0, 'view-only exit must not request control or send input');

  await message({ type: 'control-state', state: 'requested', message: 'Await Mac owner approval' });
  assert.equal(classes.has('control-focus'), false, 'pending request must not activate touch');
  assert.equal(view('touchPad').hidden, true);
  await message({ type: 'control-state', state: 'active', message: 'Mac approved control' });
  assert.equal(classes.has('control-focus'), true, 'approval must expand viewer');
  assert.equal(view('immersiveToolbar').hidden, false);
  assert.equal(view('touchPad').hidden, false, 'only approved control enables tap surface');
  assert.equal(view('exitView').textContent, 'Exit & revoke');
  assert.equal(view('video').controls, false);
  // Simulate the iPhone's actual touch (pointerdown) path. A subsequent
  // synthetic click must not send a second revocation.
  view('exitView').listeners.pointerdown({
    preventDefault() {}, stopPropagation() {}
  });
  assert.deepEqual(sent.at(-1), { type: 'control-revoke' });
  const revokedCount = sent.length;
  view('exitView').click();
  assert.equal(sent.length, revokedCount, 'touch must not double revoke');
  assert.equal(view('touchPad').hidden, true);
  assert.equal(classes.has('control-focus'), false);
  assert.equal(view('immersiveToolbar').hidden, true);
  assert.equal(view('video').controls, true);
  assert.equal(saved.size, 1, 'viewer pairing must survive leaving touch view');
  assert.equal(sent.some((m) => m.type === 'stop'), false);
  await message({ type: 'control-state', state: 'off', message: 'Revoked' });
  assert.equal(classes.has('control-focus'), false);

  // Agent approval can recur; device disconnect must leave immersive view.
  await message({ type: 'control-state', state: 'active' });
  assert.equal(classes.has('control-focus'), true);
  socket.onclose();
  assert.equal(classes.has('control-focus'), false);
  assert.equal(view('touchPad').hidden, true);
});

test('landscape control bar reserves a non-touch desktop strip and debug dot is removed', async () => {
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const css = readFileSync(fileURLToPath(new URL('../public/styles.css', import.meta.url)), 'utf8');
  const html = readFileSync(fileURLToPath(new URL('../public/index.html', import.meta.url)), 'utf8');
  const client = readFileSync(fileURLToPath(new URL('../public/client.js', import.meta.url)), 'utf8');
  assert.match(css, /body\.control-focus #desktopMonitor\{[\s\S]*?top:calc\(54px/);
  assert.match(css, /body\.control-focus #immersiveToolbar\{[\s\S]*?top:0/);
  assert.match(css, /@media \(orientation:landscape\)[\s\S]*?body\.control-focus #desktopMonitor\{top:calc\(48px/);
  assert.doesNotMatch(html, /touchMarker/);
  assert.doesNotMatch(client, /touchMarker|markerTimer/);
});
