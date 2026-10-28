import { CandidateBuffer } from './ice-queue.js';
import { normalizedVideoPoint } from './touch-mapping.js';

const $ = (id) => document.getElementById(id);
const buttons = {
  create: $('create'), join: $('join'), share: $('share'), stopShare: $('stopShare'), stop: $('stop'), pip: $('pip'), refresh: $('refresh'),
  requestControl: $('requestControl'), releaseControl: $('releaseControl'), approveControl: $('approveControl'), revokeControl: $('revokeControl'),
  expandView: $('expandView'), exitView: $('exitView'), toggleHostPreview: $('toggleHostPreview'),
  requestApps: $('requestApps'), releaseApps: $('releaseApps'), approveApps: $('approveApps'),
  revokeApps: $('revokeApps'), openDesktop: $('openDesktop'),
  approveTerminal: $('approveTerminal'), revokeTerminal: $('revokeTerminal'),
  requestTerminal: $('requestTerminal'), releaseTerminal: $('releaseTerminal'),
  closeTerminal: $('closeTerminal'), runTerminalCommand: $('runTerminalCommand'),
  cmdHelp: $('cmdHelp'), cmdDate: $('cmdDate'), cmdUptime: $('cmdUptime'),
  cmdSystem: $('cmdSystem'),
  chooseFiles: $('chooseFiles'), revokeFiles: $('revokeFiles'),
  requestFiles: $('requestFiles'), releaseFiles: $('releaseFiles'),
  closeFiles: $('closeFiles'), filesUp: $('filesUp'),
  openFinderDesktop: $('openFinderDesktop'),
  probeCompanion: $('probeCompanion'),
  inspectNativeHost: $('inspectNativeHost')
};
const video = $('video');
const stateKey = 'floatdesk-prototype-session-v1';
let identity = null;
try { identity = JSON.parse(sessionStorage.getItem(stateKey) || 'null'); } catch {}
let socket;
let peer;
let stream;
let viewerReady = false;
let pendingCandidates = new CandidateBuffer();
let negotiationId = null;
let incomingMessages = Promise.resolve();
let backoffMs = 1000;
let reconnectTimer = null;
let intentionallyStopped = false;
let captureRequestId = 0;
let capturePending = false;
let controlPhase = 'off';
let appAccessPhase = 'off';
let terminalPhase = 'off';
let filesPhase = 'off';
let filesFolder = '';
let filesPending = null;
let finderAppId = null;
const filesPanel = $('filesPanel');
const filesGrid = $('filesGrid');
const appPanel = $('iphoneModePanel');
const appHome = $('iphoneModeHome');
const terminalPanel = $('terminalPanel');
const transcript = $('terminalTranscript');
const terminalForm = $('terminalForm');
const terminalInput = $('terminalCommand');
const terminalCommands = new Set(['help', 'date', 'uptime', 'system']);
function filesPlaceholder(message) {
  const p = document.createElement('p');
  p.className = 'hint';
  p.textContent = message;
  filesGrid.replaceChildren(p);
}
function openFilesExperience(id) {
  if (identity?.role !== 'viewer' || appAccessPhase !== 'active') return;
  finderAppId = id;
  appHome.hidden = true;
  terminalPanel.hidden = true;
  filesPanel.hidden = false;
  buttons.openFinderDesktop.disabled = false;
}
function closeFilesExperience() {
  filesPanel.hidden = true;
  appHome.hidden = false;
}
function showFilesState(phase, message = '') {
  const previous = filesPhase;
  filesPhase = phase;
  const viewer = identity?.role === 'viewer';
  const host = identity?.role === 'host';
  buttons.chooseFiles.disabled = !host || phase !== 'requested';
  buttons.revokeFiles.disabled = !host || phase === 'off';
  buttons.requestFiles.disabled = !viewer || phase !== 'off';
  buttons.releaseFiles.disabled = !viewer || phase === 'off';
  $('filesStatus').textContent = message || (phase === 'active'
    ? 'Read-only folder names approved for five minutes.'
    : phase === 'selecting' ? 'Choose a folder in the Mac dialog.'
    : phase === 'requested' ? 'Waiting for the Mac owner to choose a folder.'
    : 'Request permission to browse a selected Mac folder.');
  if (phase === 'off' && previous !== 'off') {
    filesFolder = '';
    filesPending = null;
    $('filesRootLabel').textContent = 'Selected folder';
    $('filesFolderPath').textContent = '/';
    buttons.filesUp.disabled = true;
    $('filesLimitNote').hidden = true;
    filesPlaceholder('Folder access ended. Request a new Mac selection.');
  }
}
function requestFilesFolder(folder) {
  if (identity?.role !== 'viewer' || filesPhase !== 'active' || filesPending !== null) return;
  filesPending = folder;
  if (!send({type:'files-list', folder:folder || '.'})) filesPending = null;
}
function renderFilesDirectory(data) {
  if (!Array.isArray(data?.entries) || typeof data.folder !== 'string' ||
      data.folder !== (filesPending || '')) return;
  filesPending = null;
  filesFolder = data.folder;
  $('filesFolderPath').textContent = filesFolder ? '/' + filesFolder : '/';
  buttons.filesUp.disabled = !filesFolder;
  $('filesLimitNote').hidden = !data.truncated;
  filesGrid.replaceChildren();
  const items = data.entries.slice(0, 100);
  if (!items.length) return filesPlaceholder('This folder is empty.');
  for (const entry of items) {
    if (typeof entry?.name !== 'string' || !entry.name ||
        entry.name.startsWith('.') || entry.name.length > 160 ||
        entry.name.includes('/') || entry.name.includes('\\') ||
        !['folder','file'].includes(entry.kind)) continue;
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'files-item';
    tile.disabled = entry.kind !== 'folder';
    const glyph = document.createElement('span');
    glyph.className = 'file-icon';
    glyph.textContent = entry.kind === 'folder' ? '▣' : '▤';
    const title = document.createElement('span');
    title.className = 'file-name';
    title.textContent = entry.name;
    const kind = document.createElement('span');
    kind.className = 'file-kind';
    kind.textContent = entry.kind === 'folder' ? '›' : 'File';
    tile.append(glyph,title,kind);
    if (!tile.disabled) tile.addEventListener('click', () => {
      if (filesPhase !== 'active') return;
      requestFilesFolder(filesFolder ? filesFolder + '/' + entry.name : entry.name);
    });
    filesGrid.append(tile);
  }
  if (!filesGrid.children.length) filesPlaceholder('No supported entries to display.');
}
function addTerminalLine(text, kind = '') {
  const node = document.createElement('p');
  node.textContent = String(text).slice(0, 240);
  if (kind) node.className = kind;
  transcript.append(node);
  while (transcript.children.length > 90) {
    transcript.firstElementChild.remove();
  }
  transcript.scrollTop = transcript.scrollHeight;
}
function openTerminalExperience() {
  if (identity?.role !== 'viewer' || appAccessPhase !== 'active') return;
  appHome.hidden = true;
  terminalPanel.hidden = false;
  filesPanel.hidden = true;
  if (terminalPhase !== 'active') {
    $('terminalStatus').textContent = 'Read-only Terminal Preview requires separate Mac approval.';
  }
}
function closeTerminalExperience() {
  terminalPanel.hidden = true;
  appHome.hidden = false;
}
function showTerminalState(phase, message = '') {
  const previous = terminalPhase;
  terminalPhase = phase;
  const viewer = identity?.role === 'viewer';
  const host = identity?.role === 'host';
  buttons.approveTerminal.disabled = !host || phase !== 'requested';
  buttons.revokeTerminal.disabled = !host || phase === 'off';
  buttons.requestTerminal.disabled = !viewer || phase !== 'off';
  buttons.releaseTerminal.disabled = !viewer || phase === 'off';
  terminalInput.disabled = !viewer || phase !== 'active';
  buttons.runTerminalCommand.disabled = !viewer || phase !== 'active';
  for (const key of ['cmdHelp', 'cmdDate', 'cmdUptime', 'cmdSystem']) {
    buttons[key].disabled = !viewer || phase !== 'active';
  }
  $('terminalStatus').textContent = message || (phase === 'active'
    ? 'Read-only Mac diagnostics approved for 3 minutes.'
    : phase === 'requested' ? 'Waiting for approval on your Mac.'
    : 'Terminal Preview is off; request permission from your Mac.');
  if (phase === 'off' && previous !== 'off') {
    transcript.replaceChildren();
    addTerminalLine('Terminal Preview ended. Output cleared.');
  }
}
function sendTerminalCommand(value) {
  if (identity?.role !== 'viewer' || terminalPhase !== 'active') return;
  const command = String(value ?? '').trim().toLowerCase();
  if (!terminalCommands.has(command)) {
    addTerminalLine('Only help, date, uptime and system are available in read-only Preview.', 'command-error');
    return;
  }
  if (send({ type:'terminal-command', command })) {
    addTerminalLine('> ' + command, 'command-line');
    terminalInput.value = '';
  }
}
const appsGrid = $('appsGrid');
function showAppPlaceholder(message) {
  const text = document.createElement('p');
  text.className = 'hint';
  text.textContent = message;
  appsGrid.replaceChildren(text);
}
function renderAppCatalog(apps) {
  appsGrid.replaceChildren();
  if (!Array.isArray(apps) || !apps.length) {
    showAppPlaceholder('No applications found in the standard Mac app folders.');
    return;
  }
  for (const app of apps.slice(0, 120)) {
    if (typeof app?.id !== 'string' || !/^[0-9a-f]{24}$/.test(app.id) ||
        typeof app.name !== 'string' || app.name.length > 90) continue;
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'iphone-app-card';
    tile.title = 'Open ' + app.name + ' on Mac';
    const glyph = document.createElement('span');
    glyph.className = 'iphone-app-glyph';
    glyph.textContent = app.name.trim().slice(0, 1).toUpperCase() || '⌘';
    const label = document.createElement('span');
    label.className = 'iphone-app-name';
    label.textContent = app.name;
    tile.append(glyph, label);
    tile.addEventListener('click', () => {
      if (identity?.role !== 'viewer' || appAccessPhase !== 'active') return;
      if (app.experience === 'mobile-terminal-preview') {
        openTerminalExperience();
        return;
      }
      if (app.experience === 'mobile-files') {
        openFilesExperience(app.id);
        return;
      }
      if (send({ type:'app-launch', id:app.id })) {
        $('appLaunchStatus').textContent = 'Opening ' + app.name + ' on the Mac…';
      }
    });
    appsGrid.append(tile);
  }
  if (!appsGrid.children.length) showAppPlaceholder('No valid apps were returned.');
}
function showAppAccessState(phase, message = '') {
  const previous = appAccessPhase;
  appAccessPhase = phase;
  const viewer = identity?.role === 'viewer';
  const host = identity?.role === 'host';
  appPanel.hidden = !viewer;
  buttons.requestApps.disabled = !viewer || phase !== 'off';
  buttons.releaseApps.disabled = !viewer || phase === 'off';
  buttons.approveApps.disabled = !host || phase !== 'requested';
  buttons.revokeApps.disabled = !host || phase === 'off';
  $('appAccessStatus').textContent = message || (
    phase === 'active' ? 'Mac app access enabled (5 minutes).' :
    phase === 'requested' ? 'Waiting for approval on your Mac.' :
    'Ask the Mac owner to approve app access to see installed applications.'
  );
  if (phase === 'off' && previous !== 'off') {
    closeTerminalExperience();
    closeFilesExperience();
    showAppPlaceholder('Mac app access ended. Request permission again.');
    $('appLaunchStatus').textContent = '';
  }
  if (phase === 'active' && previous !== 'active' && viewer) {
    send({ type:'app-list' });
  }
}
const touchPad = $('touchPad');
const immersiveToolbar = $('immersiveToolbar');
const hostPreview = $('hostPreview');
const previewSource = $('previewSource');
const previewNote = $('hostPreviewNote');
let immersiveOpen = false;
let previewTimer = null;
let hostPreviewPaused = false;
// A one-frame-per-second thumbnail keeps an on-Mac monitor preview useful,
// without fully rendering a recursively captured live video element.
function clearHostPreview() {
  if (previewTimer !== null) clearInterval(previewTimer);
  previewTimer = null;
  previewSource.pause?.();
  previewSource.srcObject = null;
  hostPreview.hidden = true;
  previewNote.hidden = true;
  video.hidden = false;
  buttons.toggleHostPreview.disabled = true;
  buttons.toggleHostPreview.textContent = 'Pause Mac preview';
}
function drawHostPreview() {
  if (hostPreviewPaused || identity?.role !== 'host' ||
      previewSource.srcObject !== stream || !stream) return;
  const width = previewSource.videoWidth;
  const height = previewSource.videoHeight;
  if (!(width > 0 && height > 0) || previewSource.readyState < 2) return;
  const scale = Math.min(480 / width, 300 / height);
  const outputWidth = Math.max(1, Math.round(width * scale));
  const outputHeight = Math.max(1, Math.round(height * scale));
  if (hostPreview.width !== outputWidth) hostPreview.width = outputWidth;
  if (hostPreview.height !== outputHeight) hostPreview.height = outputHeight;
  hostPreview.getContext('2d')?.drawImage(previewSource, 0, 0, outputWidth, outputHeight);
}
function startHostPreview(selected) {
  clearHostPreview();
  hostPreviewPaused = false;
  video.srcObject = null;
  video.hidden = true;
  hostPreview.hidden = false;
  previewNote.hidden = false;
  previewNote.textContent = 'Mac thumbnail updates about once a second to minimize screen-capture feedback. iPhone video remains live.';
  buttons.toggleHostPreview.disabled = false;
  previewSource.srcObject = selected;
  previewSource.play?.().catch(() => {});
  // Sampling is deliberately far cheaper than the old live recursive Mac
  // preview and never changes the captured track sent to the viewer.
  drawHostPreview();
  previewTimer = setInterval(drawHostPreview, 1000);
}
// iPhone Safari cannot reliably fullscreen an arbitrary element. Use a
// viewport-filling interactive layout instead of fullscreening <video> alone,
// which would hide the touch overlay and the exit/revoke button.
function setImmersiveView(open) {
  const allowed = identity?.role === 'viewer';
  immersiveOpen = Boolean(open && allowed);
  document.body.classList.toggle('control-focus', immersiveOpen);
  immersiveToolbar.hidden = !immersiveOpen;
  buttons.expandView.disabled = !allowed || immersiveOpen;
  buttons.exitView.textContent = controlPhase === 'active' ? 'Exit & revoke' : 'Exit view';
  video.controls = !immersiveOpen;
}
function showControlState(phase, message = '') {
  const wasActive = controlPhase === 'active';
  controlPhase = phase;
  const host = identity?.role === 'host';
  const viewer = identity?.role === 'viewer';
  buttons.approveControl.disabled = !host || phase !== 'requested';
  buttons.revokeControl.disabled = !host || !['requested', 'starting', 'active'].includes(phase);
  buttons.requestControl.disabled = !viewer || phase !== 'off';
  buttons.releaseControl.disabled = !viewer || !['requested', 'starting', 'active'].includes(phase);
  touchPad.hidden = !(viewer && phase === 'active');
  $('controlStatus').textContent = message || (phase === 'off' ? 'View-only mode. Remote control is off.' : 'Touch control: ' + phase);
  // When the Mac approves control, immediately enlarge the phone viewer.
  // When control is revoked/expired, restore the page and disable taps.
  if (viewer && phase === 'active') setImmersiveView(true);
  else if (wasActive && phase !== 'active') setImmersiveView(false);
  else if (!viewer && immersiveOpen) setImmersiveView(false);
  else buttons.expandView.disabled = !viewer || immersiveOpen;
}

function syncHostCaptureControls() {
  const isHost = identity?.role === 'host';
  const active = stream?.getVideoTracks().some((track) => track.readyState === 'live') || false;
  buttons.share.disabled = !isHost || capturePending;
  buttons.stopShare.disabled = !isHost || (!active && !capturePending);
  if (!isHost || !active) buttons.toggleHostPreview.disabled = true;
}

const status = (message) => { $('status').textContent = message; };
function remember(value) {
  identity = value;
  if (value) sessionStorage.setItem(stateKey, JSON.stringify(value));
  else sessionStorage.removeItem(stateKey);
  syncHostCaptureControls();
  buttons.stop.disabled = !value || value.role !== 'host';
  buttons.probeCompanion.disabled = !value || value.role !== 'host';
  buttons.inspectNativeHost.disabled = !value || value.role !== 'host';
  buttons.create.disabled = Boolean(value);
  buttons.join.disabled = Boolean(value);
  buttons.refresh.disabled = !value || value.role !== 'viewer';
  buttons.openDesktop.disabled = !value || value.role !== 'viewer' || !video.srcObject;
  showControlState(controlPhase);
  showAppAccessState(appAccessPhase);
  showTerminalState(terminalPhase);
  showFilesState(filesPhase);
}
function send(data) {
  if (!socket || socket.readyState !== WebSocket.OPEN) { status('Signaling unavailable. Reconnecting…'); return false; }
  socket.send(JSON.stringify(data));
  return true;
}
function closePeer(preserveId = null) {
  const oldPeer = peer;
  peer = null;
  negotiationId = null;
  pendingCandidates.retain(preserveId);
  if (oldPeer) oldPeer.close();
  if (!identity || identity.role !== 'host') {
    video.srcObject = null;
    buttons.pip.disabled = true;
    buttons.openDesktop.disabled = true;
  }
}
function stopCapture(message = 'Screen sharing stopped.') {
  // Invalidate an in-flight screen picker so an older request cannot restart
  // screen capture after the owner explicitly stopped it.
  captureRequestId++;
  capturePending = false;
  const previous = stream;
  stream = null;
  closePeer();
  video.srcObject = null;
  clearHostPreview();
  if (previous) {
    previous.getTracks().forEach((track) => track.stop());
    send({ type: 'capture-state', active: false });
  }
  syncHostCaptureControls();
  status(message);
}
function resetSession() {
  showControlState('off', 'Remote control off.');
  showAppAccessState('off', 'Session ended; app access revoked.');
  showTerminalState('off', 'Session ended; Terminal Preview revoked.');
  showFilesState('off', 'Session ended; Files permission revoked.');
  closeTerminalExperience();
  closeFilesExperience();
  // Ending a session must also invalidate any pending capture permission picker.
  captureRequestId++;
  capturePending = false;
  const previous = stream;
  stream = null;
  closePeer();
  video.srcObject = null;
  clearHostPreview();
  if (previous) previous.getTracks().forEach((track) => track.stop());
  viewerReady = false;
  remember(null);
  $('code').textContent = '—';
  buttons.pip.disabled = true;
}
function connect() {
  if (socket && [WebSocket.OPEN, WebSocket.CONNECTING].includes(socket.readyState)) return;
  const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
  socket = new WebSocket(scheme + '//' + location.host + '/signal');
  socket.onopen = () => {
    backoffMs = 1000;
    status('Connected to signaling server');
    if (identity) send({ type: 'resume', ...identity });
  };
  socket.onclose = () => {
    if (identity?.role === 'viewer' && controlPhase === 'active') {
      showControlState('off', 'Connection lost. Touch control disabled.');
    }
    if (identity?.role === 'viewer' && appAccessPhase !== 'off') {
      showAppAccessState('off', 'Connection lost; Mac app access needs fresh approval.');
    }
    if (identity?.role === 'viewer' && terminalPhase !== 'off') {
      showTerminalState('off', 'Connection lost; Terminal Preview disabled.');
    }
    if (identity?.role === 'viewer' && filesPhase !== 'off') {
      showFilesState('off', 'Connection lost; Files permission disabled.');
    }
    status('Signaling disconnected. Retrying…');
    clearTimeout(reconnectTimer);
    if (!intentionallyStopped) {
      reconnectTimer = setTimeout(connect, backoffMs);
      backoffMs = Math.min(10000, backoffMs * 2);
    }
  };
  socket.onerror = () => {};
  // Preserve WebSocket message order while asynchronous SDP work completes.
  socket.onmessage = (event) => {
    incomingMessages = incomingMessages.then(async () => {
      let data;
      try { data = JSON.parse(event.data); } catch { return; }
      await handleMessage(data);
    }).catch((error) => { status('Media error: ' + error.message); });
  };
}
function makePeer(id) {
  closePeer(id);
  negotiationId = id;
  const pc = new RTCPeerConnection({ iceServers: [] });
  peer = pc;
  pc.onicecandidate = (event) => {
    if (peer !== pc) return;
    if (event.candidate) {
      send({ type: 'signal', payload: { type: 'candidate', id, candidate: event.candidate } });
    }
  };
  pc.onconnectionstatechange = () => {
    if (peer !== pc) return;
    status('WebRTC video connection: ' + pc.connectionState);
    if (['failed', 'closed'].includes(pc.connectionState)) buttons.pip.disabled = true;
  };
  pc.ontrack = (event) => {
    if (peer !== pc || !event.streams[0]) return;
    video.srcObject = event.streams[0];
    buttons.pip.disabled = false;
    buttons.openDesktop.disabled = identity?.role !== 'viewer';
    video.play().catch(() => status('Tap the video to start playback.'));
    event.track.addEventListener('ended', () => {
      if (peer === pc) {
        buttons.pip.disabled = true;
        status('Remote video track ended.');
      }
    }, { once: true });
  };
  return pc;
}
async function flushCandidates(id) {
  if (!peer || negotiationId !== id || !peer.remoteDescription) return;
  for (const candidate of pendingCandidates.take(id)) {
    try { await peer.addIceCandidate(candidate); }
    catch (error) { status('ICE negotiation problem: ' + error.message); }
  }
}
async function offer() {
  if (!stream || !viewerReady || !identity || identity.role !== 'host') return;
  const id = crypto.randomUUID();
  const pc = makePeer(id);
  stream.getTracks().forEach((track) => {
    const sender = pc.addTrack(track, stream);
    if (track.kind === 'video' && sender?.getParameters && sender?.setParameters) {
      // Soft cap: reduce native Retina encoding work and avoid multi-second
      // buffering under constrained LAN / M1 GPU load. Keep aspect ratio.
      const params = sender.getParameters();
      if (params.encodings?.length) {
        const baseEncoding = params.encodings[0];
        const sourceHeight = track.getSettings?.().height || 900;
        baseEncoding.maxBitrate = 1800000;
        baseEncoding.maxFramerate = 12;
        baseEncoding.scaleResolutionDownBy = Math.max(1, sourceHeight / 900);
        sender.setParameters(params).catch(() => {
          // Some WebRTC stacks reject encoding limits; video still works.
        });
      }
    }
  });
  const description = await pc.createOffer();
  if (peer !== pc) return;
  await pc.setLocalDescription(description);
  if (peer !== pc) return;
  send({ type: 'signal', payload: { type: 'offer', id, sdp: pc.localDescription } });
}
async function receiveSignal(payload) {
  if (!identity || typeof payload.id !== 'string') return;
  const id = payload.id;
  if (payload.type === 'offer' && identity.role === 'viewer') {
    const pc = makePeer(id);
    await pc.setRemoteDescription(payload.sdp);
    if (peer !== pc) return;
    await flushCandidates(id);
    const answer = await pc.createAnswer();
    if (peer !== pc) return;
    await pc.setLocalDescription(answer);
    if (peer !== pc) return;
    send({ type: 'signal', payload: { type: 'answer', id, sdp: pc.localDescription } });
  } else if (payload.type === 'answer' && identity.role === 'host' && peer && id === negotiationId) {
    await peer.setRemoteDescription(payload.sdp);
    await flushCandidates(id);
  } else if (payload.type === 'candidate' && payload.candidate) {
    // Host ignores stale answers/ICE; viewer may receive ICE before the offer.
    if (identity.role === 'host' && id !== negotiationId) return;
    if (peer && id === negotiationId && peer.remoteDescription) {
      try { await peer.addIceCandidate(payload.candidate); }
      catch (error) { status('ICE negotiation problem: ' + error.message); }
    } else {
      pendingCandidates.queue(id, payload.candidate);
    }
  }
}
async function handleMessage(data) {
  if (data.type === 'created' || data.type === 'joined') {
    const role = data.type === 'created' ? 'host' : 'viewer';
    remember({ role, code: data.code, token: data.token });
    $('code').textContent = data.code;
    status(role === 'host' ? 'Pairing code ready. Share your screen.' : 'Paired. Waiting for host video…');
  } else if (data.type === 'resumed') {
    $('code').textContent = data.code;
    status('Session authenticated. Video may need to reconnect.');
  } else if (data.type === 'viewer-ready') {
    viewerReady = true;
    await offer();
  } else if (data.type === 'viewer-video-recovery-requested' && identity?.role === 'host') {
    if (!stream || stream.getVideoTracks().every((track) => track.readyState !== 'live')) {
      send({ type: 'capture-state', active: false });
      status('Refresh requested, but screen capture has stopped. Share screen again with consent.');
    } else {
      viewerReady = true;
      await offer();
    }
  } else if (data.type === 'control-state') {
    showControlState(data.state, data.message);
  } else if (data.type === 'app-access-state') {
    showAppAccessState(data.state, data.message);
  } else if (data.type === 'app-list-result') {
    if (identity?.role === 'viewer' && appAccessPhase === 'active') {
      renderAppCatalog(data.apps);
    }
  } else if (data.type === 'app-launch-result') {
    if (identity?.role === 'viewer' && appAccessPhase === 'active') {
      $('appLaunchStatus').textContent = data.name + ' was opened on your Mac.';
    }
  } else if (data.type === 'native-host-status-result') {
    if (identity?.role === 'host' && data.inventory?.version === 1 &&
        Array.isArray(data.inventory.services)) {
      const inventory = data.inventory;
      const message = inventory.verification;
      $('nativeHostStatus').textContent = typeof message === 'string'
        ? message.slice(0, 180) : 'Native service status is informational only.';
      const box = $('nativeHostServices');
      box.replaceChildren();
      for (const service of inventory.services.slice(0, 8)) {
        if (typeof service?.title !== 'string' || typeof service?.status !== 'string') continue;
        const item = document.createElement('p');
        item.className = 'hint';
        item.textContent = service.title.slice(0, 60) + ': ' + service.status.slice(0, 30);
        box.append(item);
      }
    }
  } else if (data.type === 'companion-result') {
    if (identity?.role === 'host') {
      $('companionStatus').textContent = typeof data.message === 'string'
        ? data.message.slice(0, 220) : 'Native companion status unavailable.';
    }
  } else if (data.type === 'terminal-state') {
    showTerminalState(data.state, data.message);
  } else if (data.type === 'terminal-output') {
    if (identity?.role === 'viewer' && terminalPhase === 'active' && Array.isArray(data.lines)) {
      for (const line of data.lines.slice(0, 8)) addTerminalLine(line);
    }
  } else if (data.type === 'files-state') {
    showFilesState(data.state, data.message);
  } else if (data.type === 'files-root') {
    if (identity?.role === 'viewer' && filesPhase === 'active') {
      $('filesRootLabel').textContent = typeof data.label === 'string'
        ? data.label.slice(0, 80) : 'Selected folder';
      filesFolder = '';
      filesPending = null;
      requestFilesFolder('');
    }
  } else if (data.type === 'files-list-result') {
    if (identity?.role === 'viewer' && filesPhase === 'active') renderFilesDirectory(data);
  } else if (data.type === 'recovery-request-accepted') {
    status('Refresh accepted. Waiting for a new WebRTC video connection…');
  } else if (data.type === 'signal') {
    await receiveSignal(data.payload);
  } else if (data.type === 'peer-disconnected') {
    showControlState('off', 'Other device disconnected. Control revoked.');
    showAppAccessState('off', 'Mac disconnected. App access revoked.');
    showTerminalState('off', 'Mac disconnected. Terminal Preview revoked.');
    showFilesState('off', 'Mac disconnected. Files access revoked.');
    if (identity && identity.role === 'host') viewerReady = false;
    closePeer();
    status('Other device disconnected. Session credentials retained.');
  } else if (data.type === 'capture-state' && identity?.role === 'viewer') {
    if (!data.active) {
      showControlState('off', 'Host stopped sharing. Touch control revoked.');
      closePeer();
      status('Host stopped sharing. Waiting for new capture consent.');
    } else {
      status('Host enabled screen capture. Establishing video…');
    }
  } else if (data.type === 'session-ended') {
    resetSession();
    status('Host ended this session.');
  } else if (data.type === 'error') {
    status(data.message);
    if (identity?.role === 'viewer') {
      if (!terminalPanel.hidden) addTerminalLine(data.message, 'command-error');
      else if (!filesPanel.hidden) {
        $('filesStatus').textContent = data.message;
        filesPending = null;
      }
      else $('appLaunchStatus').textContent = data.message;
    }
    if (/authentication failed|Session unavailable/i.test(data.message)) resetSession();
  }
}
buttons.create.addEventListener('click', () => send({ type: 'create' }));
buttons.join.addEventListener('click', () => send({ type: 'join', code: $('joinCode').value.trim().toUpperCase() }));
buttons.share.addEventListener('click', async () => {
  if (identity?.role !== 'host' || capturePending) return;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
    status('Screen capture unavailable: use a compatible desktop browser over HTTPS or localhost.');
    return;
  }
  // Don't stop an existing capture until new browser consent was granted.
  const requestId = ++captureRequestId;
  capturePending = true;
  syncHostCaptureControls();
  try {
    const selected = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 12, max: 15 } }, audio: false });
    // A pending chooser may resolve after Stop sharing or End session.
    if (requestId !== captureRequestId || identity?.role !== 'host') {
      selected.getTracks().forEach((track) => track.stop());
      return;
    }
    capturePending = false;
    const previous = stream;
    stream = selected;
    if (previous) previous.getTracks().forEach((track) => track.stop());
    const track = selected.getVideoTracks()[0];
    if (!track || track.readyState !== 'live') {
      stopCapture('Screen capture did not start. Select a window to try again.');
      return;
    }
    track.addEventListener('ended', () => {
      // Ignore delayed ended events from an already-replaced capture.
      if (stream?.getVideoTracks()[0] !== track) return;
      stopCapture();
    }, { once: true });
    const surface = track.getSettings?.().displaySurface || 'unknown';
    // Restored Mac-side feedback: entire-monitor capture uses a sampled, small
    // local thumbnail rather than the high-rate mirror that caused lag.
    if (surface === 'monitor') {
      startHostPreview(selected);
    } else {
      clearHostPreview();
      video.srcObject = selected;
    }
    syncHostCaptureControls();
    if (video.srcObject) await video.play().catch(() => {});
    if (requestId !== captureRequestId || stream !== selected) return;
    send({ type: 'capture-state', active: true, surface });
    if (surface !== 'monitor') showControlState('off', 'View only. Select an entire screen for touch control.');
    status('Sharing locally. Waiting for viewer or connecting…');
    await offer();
  } catch (error) {
    if (requestId !== captureRequestId) return;
    capturePending = false;
    syncHostCaptureControls();
    status(stream ? 'Sharing unchanged: ' + error.message : 'Screen share not started: ' + error.message);
  }
});
buttons.stopShare.addEventListener('click', () => {
  if (identity?.role !== 'host') return;
  if (!stream && !capturePending) return;
  stopCapture();
});
buttons.toggleHostPreview.addEventListener('click', () => {
  if (identity?.role !== 'host' || hostPreview.hidden || !stream) return;
  hostPreviewPaused = !hostPreviewPaused;
  if (hostPreviewPaused) {
    if (previewTimer !== null) clearInterval(previewTimer);
    previewTimer = null;
    previewSource.pause?.();
    buttons.toggleHostPreview.textContent = 'Resume Mac preview';
    previewNote.textContent = 'Mac preview paused to reduce load. The iPhone stream continues.';
  } else {
    buttons.toggleHostPreview.textContent = 'Pause Mac preview';
    previewNote.textContent = 'Mac thumbnail updates about once a second to minimize screen-capture feedback. iPhone video remains live.';
    previewSource.play?.().catch(() => {});
    drawHostPreview();
    previewTimer = setInterval(drawHostPreview, 1000);
  }
});
buttons.refresh.addEventListener('click', () => {
  if (identity?.role !== 'viewer') return;
  if (send({ type: 'request-video' })) status('Requesting new video from the Mac…');
});
buttons.inspectNativeHost.addEventListener('click', () => {
  if (identity?.role !== 'host') return;
  if (send({type:'native-host-status'})) {
    $('nativeHostStatus').textContent = 'Inspecting local service configuration…';
  }
});
buttons.probeCompanion.addEventListener('click', () => {
  if (identity?.role !== 'host') return;
  if (send({type:'companion-probe'})) {
    $('companionStatus').textContent = 'Checking opt-in native companion…';
  }
});
buttons.requestFiles.addEventListener('click', () => send({type:'files-request'}));
buttons.releaseFiles.addEventListener('click', () => send({type:'files-revoke'}));
buttons.chooseFiles.addEventListener('click', () => send({type:'files-choose-root'}));
buttons.revokeFiles.addEventListener('click', () => send({type:'files-revoke'}));
buttons.closeFiles.addEventListener('click', closeFilesExperience);
buttons.filesUp.addEventListener('click', () => {
  if (filesPhase !== 'active' || !filesFolder) return;
  const parts = filesFolder.split('/');
  parts.pop();
  requestFilesFolder(parts.join('/'));
});
buttons.openFinderDesktop.addEventListener('click', () => {
  if (identity?.role !== 'viewer' || appAccessPhase !== 'active' || !finderAppId) return;
  if (send({type:'app-launch', id:finderAppId})) {
    $('filesStatus').textContent = 'Opening Finder on your Mac. Choose Desktop Mode to view it.';
  }
});
buttons.requestTerminal.addEventListener('click', () => send({ type:'terminal-request' }));
buttons.releaseTerminal.addEventListener('click', () => send({ type:'terminal-revoke' }));
buttons.approveTerminal.addEventListener('click', () => send({ type:'terminal-approve' }));
buttons.revokeTerminal.addEventListener('click', () => send({ type:'terminal-revoke' }));
buttons.closeTerminal.addEventListener('click', closeTerminalExperience);
terminalForm.addEventListener('submit', (event) => {
  event.preventDefault();
  sendTerminalCommand(terminalInput.value);
});
for (const command of terminalCommands) {
  const id = 'cmd' + command[0].toUpperCase() + command.slice(1);
  buttons[id].addEventListener('click', () => sendTerminalCommand(command));
}
buttons.requestApps.addEventListener('click', () => send({ type:'app-access-request' }));
buttons.releaseApps.addEventListener('click', () => send({ type:'app-access-revoke' }));
buttons.approveApps.addEventListener('click', () => send({ type:'app-access-approve' }));
buttons.revokeApps.addEventListener('click', () => send({ type:'app-access-revoke' }));
buttons.openDesktop.addEventListener('click', () => {
  if (identity?.role !== 'viewer') return;
  if (!video.srcObject) {
    $('appLaunchStatus').textContent = 'Ask your Mac to share its screen before opening Desktop Mode.';
    return;
  }
  setImmersiveView(true); // read-only until Mac separately approves touch control
});
buttons.requestControl.addEventListener('click', () => send({ type: 'control-request' }));
buttons.approveControl.addEventListener('click', () => send({ type: 'control-approve' }));
buttons.revokeControl.addEventListener('click', () => send({ type: 'control-revoke' }));
buttons.releaseControl.addEventListener('click', () => send({ type: 'control-revoke' }));
buttons.expandView.addEventListener('click', () => {
  if (identity?.role === 'viewer') setImmersiveView(true);
});
function exitImmersiveControl() {
  if (!immersiveOpen) return;
  // Never leave a live touch layer attached while an exit request is pending.
  // Server ack still determines whether native Mac control was truly revoked.
  const active = controlPhase === 'active' && identity?.role === 'viewer';
  if (active) {
    const sent = send({ type: 'control-revoke' });
    showControlState('off', sent
      ? 'Control disabled on phone; revocation requested from Mac.'
      : 'No connection to Mac. Check Mac Revoke control or Stop sharing.');
  }
  setImmersiveView(false);
}
buttons.exitView.addEventListener('pointerdown', (event) => {
  // iPhone may compose WebRTC video above adjacent DOM. Make the separate
  // top-level safety button act immediately on touch rather than waiting for
  // a synthetic click delayed/cancelled by mobile gesture handling.
  event.preventDefault();
  event.stopPropagation?.();
  exitImmersiveControl();
});
buttons.exitView.addEventListener('click', exitImmersiveControl);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && immersiveOpen) exitImmersiveControl();
});
video.addEventListener('click', () => {
  // The viewer can enlarge the preview before requesting control, too.
  if (identity?.role === 'viewer' && video.srcObject && controlPhase !== 'active') {
    setImmersiveView(true);
  }
});
let touchStart = null;
touchPad.addEventListener('pointerdown', (event) => {
  if (controlPhase !== 'active' || identity?.role !== 'viewer') return;
  event.preventDefault();
  touchStart = { id: event.pointerId, x: event.clientX, y: event.clientY };
  touchPad.setPointerCapture?.(event.pointerId);
});
touchPad.addEventListener('pointerup', (event) => {
  if (!touchStart || event.pointerId !== touchStart.id) return;
  event.preventDefault();
  const travel = Math.hypot(event.clientX - touchStart.x, event.clientY - touchStart.y);
  touchStart = null;
  if (travel > 14 || controlPhase !== 'active') return; // avoid accidental taps while swiping
  const point = normalizedVideoPoint(video, event.clientX, event.clientY);
  if (!point) {
    status('Tap ignored: outside the video picture. Try a visible desktop target.');
    return;
  }
  // No transient tap circle: the remote desktop responds visually to the
  // actual Mac click; keep the phone view free of debug decorations.
  send({ type: 'control-click', ...point });
});
touchPad.addEventListener('pointercancel', () => { touchStart = null; });
buttons.stop.addEventListener('click', () => {
  send({ type: 'stop' });
  resetSession();
  status('Session ended.');
});
buttons.pip.addEventListener('click', async () => {
  try {
    if (video.requestPictureInPicture) await video.requestPictureInPicture();
    else if (video.webkitSupportsPresentationMode && video.webkitSupportsPresentationMode('picture-in-picture')) {
      video.webkitSetPresentationMode('picture-in-picture');
    } else status('This browser does not expose Picture-in-Picture for this stream.');
  } catch (error) { status('PiP refused: ' + error.message); }
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && (!socket || socket.readyState === WebSocket.CLOSED)) connect();
});
window.addEventListener('pagehide', () => { /* Mobile suspension is not a user-initiated logout. */ });
remember(identity);
connect();
