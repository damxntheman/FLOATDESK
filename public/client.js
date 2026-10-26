import { CandidateBuffer } from './ice-queue.js';

const $ = (id) => document.getElementById(id);
const buttons = {
  create: $('create'), join: $('join'), share: $('share'), stop: $('stop'), pip: $('pip')
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

const status = (message) => { $('status').textContent = message; };
function remember(value) {
  identity = value;
  if (value) sessionStorage.setItem(stateKey, JSON.stringify(value));
  else sessionStorage.removeItem(stateKey);
  buttons.share.disabled = !value || value.role !== 'host';
  buttons.stop.disabled = !value || value.role !== 'host';
  buttons.create.disabled = Boolean(value);
  buttons.join.disabled = Boolean(value);
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
  }
}
function resetSession() {
  closePeer();
  if (stream) stream.getTracks().forEach((track) => track.stop());
  stream = null;
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
  stream.getTracks().forEach((track) => pc.addTrack(track, stream));
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
  } else if (data.type === 'signal') {
    await receiveSignal(data.payload);
  } else if (data.type === 'peer-disconnected') {
    if (identity && identity.role === 'host') viewerReady = false;
    closePeer();
    status('Other device disconnected. Session credentials retained.');
  } else if (data.type === 'capture-state' && identity?.role === 'viewer') {
    if (!data.active) {
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
    if (/authentication failed|Session unavailable/i.test(data.message)) resetSession();
  }
}
buttons.create.addEventListener('click', () => send({ type: 'create' }));
buttons.join.addEventListener('click', () => send({ type: 'join', code: $('joinCode').value.trim().toUpperCase() }));
buttons.share.addEventListener('click', async () => {
  if (!identity || identity.role !== 'host') return;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
    status('Screen capture unavailable: use a compatible desktop browser over HTTPS or localhost.');
    return;
  }
  try {
    if (stream) stream.getTracks().forEach((track) => track.stop());
    stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 15 }, audio: false });
    const track = stream.getVideoTracks()[0];
    track.addEventListener('ended', () => {
      // A previous capture may finish stopping after a replacement has started.
      if (!stream || stream.getVideoTracks()[0] !== track) return;
      stream = null;
      closePeer();
      send({ type: 'capture-state', active: false });
      status('Screen sharing stopped.');
    }, { once: true });
    video.srcObject = stream;
    await video.play().catch(() => {});
    send({ type: 'capture-state', active: true });
    status('Sharing locally. Waiting for viewer or connecting…');
    await offer();
  } catch (error) { status('Screen share not started: ' + error.message); }
});
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
