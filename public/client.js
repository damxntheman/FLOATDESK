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
let pendingCandidates = [];
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
function closePeer() {
  pendingCandidates = [];
  if (peer) peer.close();
  peer = null;
  if (!identity || identity.role !== 'host') video.srcObject = null;
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
  socket.onmessage = async (event) => {
    let data;
    try { data = JSON.parse(event.data); } catch { return; }
    try { await handleMessage(data); } catch (error) { status('Media error: ' + error.message); }
  };
}
function makePeer() {
  closePeer();
  peer = new RTCPeerConnection({ iceServers: [] });
  peer.onicecandidate = (event) => {
    if (event.candidate) send({ type: 'signal', payload: { type: 'candidate', candidate: event.candidate } });
  };
  peer.onconnectionstatechange = () => {
    if (peer) status('Video connection: ' + peer.connectionState);
  };
  peer.ontrack = (event) => {
    if (event.streams[0]) {
      video.srcObject = event.streams[0];
      buttons.pip.disabled = false;
      video.play().catch(() => status('Tap the video to start playback.'));
    }
  };
  return peer;
}
async function flushCandidates() {
  if (!peer || !peer.remoteDescription) return;
  const batch = pendingCandidates.splice(0);
  for (const candidate of batch) await peer.addIceCandidate(candidate);
}
async function offer() {
  if (!stream || !viewerReady || !identity || identity.role !== 'host') return;
  const pc = makePeer();
  stream.getTracks().forEach((track) => pc.addTrack(track, stream));
  const description = await pc.createOffer();
  await pc.setLocalDescription(description);
  send({ type: 'signal', payload: { type: 'offer', sdp: pc.localDescription } });
}
async function receiveSignal(payload) {
  if (!identity) return;
  if (payload.type === 'offer' && identity.role === 'viewer') {
    const pc = makePeer();
    await pc.setRemoteDescription(payload.sdp);
    await flushCandidates();
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    send({ type: 'signal', payload: { type: 'answer', sdp: pc.localDescription } });
  } else if (payload.type === 'answer' && identity.role === 'host' && peer) {
    await peer.setRemoteDescription(payload.sdp);
    await flushCandidates();
  } else if (payload.type === 'candidate' && payload.candidate) {
    if (peer && peer.remoteDescription) await peer.addIceCandidate(payload.candidate);
    else pendingCandidates.push(payload.candidate);
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
      stream = null;
      closePeer();
      status('Screen sharing stopped.');
    }, { once: true });
    video.srcObject = stream;
    await video.play().catch(() => {});
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
