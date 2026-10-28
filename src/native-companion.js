/**
 * M6: fail-closed macOS companion handshake, version 1.
 * The only permitted request is a fixed "hello"; its reply advertises NO
 * privileged capabilities. This is an architecture probe, not remote control.
 *
 * Deliberately NEVER pass arbitrary phone payloads or paths to the process.
 * The binary must be opted into by the Mac owner, and the request is issued
 * only from an authenticated, localhost Mac host socket.
 */
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';

export const PROTOCOL_VERSION = 1;
export const DECLARED_CAPABILITIES = Object.freeze({
  capture:false, input:false, files:false, terminal:false
});
const MAX_LINE_BYTES = 2048;

export function validateCompanionAck(payload, requestId) {
  if (typeof payload !== 'object' || payload === null ||
      Array.isArray(payload) ||
      payload.version !== PROTOCOL_VERSION ||
      payload.type !== 'hello-ack' ||
      payload.requestId !== requestId ||
      payload.platform !== 'macos') {
    throw new Error('Native companion protocol mismatch.');
  }
  const capabilities = payload.capabilities;
  if (!capabilities || typeof capabilities !== 'object' ||
      Array.isArray(capabilities) ||
      Object.keys(capabilities).length !== 4 ||
      Object.entries(DECLARED_CAPABILITIES).some(([key, falseValue]) =>
        capabilities[key] !== falseValue)) {
    throw new Error('Native companion capabilities were not approved.');
  }
  return { status:'ready', protocolVersion:PROTOCOL_VERSION,
    capabilities:{...DECLARED_CAPABILITIES} };
}

export function probeNativeCompanion({
  platform = process.platform,
  binary = process.env.FLOATDESK_COMPANION_BIN || '',
  exists = existsSync,
  spawnProcess = spawn,
  timeoutMs = 5000,
  makeRequestId = () => randomBytes(16).toString('hex')
} = {}) {
  if (platform !== 'darwin' || typeof binary !== 'string' ||
      !binary.startsWith('/') || !binary || !exists(binary)) {
    throw new Error('Native companion probe is not configured.');
  }
  const requestId = makeRequestId();
  if (!/^[0-9a-f]{32}$/.test(requestId)) {
    throw new Error('Invalid companion request identifier.');
  }

  let child;
  try { child = spawnProcess(binary, [], {stdio:['pipe','pipe','pipe']}); }
  catch { throw new Error('Native companion could not start.'); }

  return new Promise((resolve, reject) => {
    let finished = false;
    let output = '';
    let timer;
    function settle(error, result) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      try { child.stdin.end(); } catch {}
      try { if (!child.killed) child.kill(); } catch {}
      if (error) reject(error);
      else resolve(result);
    }
    function failure() {
      settle(new Error('Native companion handshake failed.'));
    }
    timer = setTimeout(failure, Math.max(1,Math.min(timeoutMs,10000)));
    // Keep the timeout referenced until the handshake settles; an unref'd
    // test-only subprocess may otherwise leave an unresolved probe promise.
    child.on('error',failure);
    child.on('exit',() => {
      if (!finished) failure();
    });
    child.stdin.on('error',failure);
    child.stderr.on('data',() => {}); // drain, never log local machine details
    child.stdout.on('data',chunk => {
      if (finished) return;
      output += String(chunk);
      if (Buffer.byteLength(output,'utf8') > MAX_LINE_BYTES) {
        failure();
        return;
      }
      const lineEnd = output.indexOf('\n');
      if (lineEnd === -1) return;
      // Exactly one JSON message, no logs or extra output.
      if (output.slice(lineEnd + 1).trim()) return failure();
      try {
        const payload = JSON.parse(output.slice(0,lineEnd));
        settle(null,validateCompanionAck(payload,requestId));
      } catch {
        failure();
      }
    });
    const frame = JSON.stringify({
      version:PROTOCOL_VERSION,type:'hello',requestId
    }) + '\n';
    try {
      if (!child.stdin.writable || child.stdin.writableLength > 0 ||
          !child.stdin.write(frame)) failure();
    } catch {
      failure();
    }
  });
}
