// M7: Node IPC client for an owner-operated native Mac Files broker.
// No filesystem path is passed to or obtained from the child. The broker
// uses NSOpenPanel to obtain the selected directory and maintains its own FD.
// IPC is read-only metadata, versioned, bounded and fail-closed.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { validateRelativeFolder } from './files-policy.js';

const MAX_FRAME = 32768;
const MAX_ITEMS = 100;
const VERSION = 1;
const own = (value, names) => value && typeof value === 'object' &&
  !Array.isArray(value) && Object.keys(value).sort().join(',') === names.slice().sort().join(',');

function safeName(value) {
  return typeof value === 'string' && value.length > 0 &&
    Buffer.byteLength(value, 'utf8') <= 160 &&
    !value.startsWith('.') && !value.includes('/') && !value.includes('\\') &&
    !/[\u0000-\u001f\u007f]/u.test(value);
}
function checkReady(reply) {
  if (!own(reply,['version','type','label']) || reply.version !== VERSION ||
      reply.type !== 'selected' || !safeName(reply.label) ||
      Buffer.byteLength(reply.label,'utf8') > 80) throw Error('Invalid native Files selection.');
  return {label:reply.label};
}
function checkListing(reply, request) {
  if (!own(reply,['version','type','requestId','folder','entries','truncated']) ||
      reply.version !== VERSION || reply.type !== 'listing' ||
      reply.requestId !== request.id ||
      reply.folder !== request.relative || typeof reply.truncated !== 'boolean' ||
      !Array.isArray(reply.entries) || reply.entries.length > MAX_ITEMS) {
    throw Error('Invalid native Files listing.');
  }
  for (const item of reply.entries) {
    if (!own(item,['name','kind']) || !safeName(item.name) ||
        !['file','folder'].includes(item.kind)) {
      throw Error('Invalid native Files entry.');
    }
  }
  return {folder:reply.folder,entries:reply.entries,truncated:reply.truncated};
}

export function startNativeFilesBroker({
  platform=process.platform,
  binary=process.env.FLOATDESK_NATIVE_FILES_BIN || '',
  exists=existsSync,
  spawnProcess=spawn,
  selectionMs=90000,
  listMs=5000,
  randomId=()=>randomBytes(8).toString('hex'),
  onEnd=()=>{}
}={}) {
  if (platform !== 'darwin' || typeof binary !== 'string' ||
      !binary.startsWith('/') || !binary || !exists(binary)) {
    throw Error('Native Files broker is not configured on this Mac.');
  }
  let child;
  try { child=spawnProcess(binary,[],{stdio:['pipe','pipe','pipe']}); }
  catch { throw Error('Mac native Files broker could not start.'); }
  let active=true;
  let ready=false;
  let buffer='';
  let selectionTimer;
  let pending=null;
  let selectedResolve,selectedReject;
  const promise=new Promise((resolve,reject)=>{
    selectedResolve=resolve;selectedReject=reject;
  });

  function fail(reason) {
    if (!active) return;
    active=false;
    clearTimeout(selectionTimer);
    if (pending) {
      clearTimeout(pending.timer);
      pending.reject(new Error(reason));
      pending=null;
    }
    if (!ready) selectedReject(new Error(reason));
    try { child.stdin.end(); } catch {}
    try { if (!child.killed) child.kill(); } catch {}
    if (ready) {
      try { onEnd(reason); } catch {}
    }
  }
  function send(frame) {
    if (!active || !child.stdin.writable) throw Error('Native Files broker is unavailable.');
    const payload=JSON.stringify(frame)+'\n';
    if (Buffer.byteLength(payload,'utf8') > 2048) throw Error('Files request exceeds native IPC limit.');
    try { child.stdin.write(payload); }
    catch { fail('Native Files broker pipe failed.'); throw Error('Native Files broker pipe failed.'); }
  }
  function handle(reply) {
    if (!ready) {
      if (own(reply,['version','type']) && reply.version===VERSION &&
          reply.type==='cancelled') {
        fail('Mac folder selection cancelled.');
        return;
      }
      if (own(reply,['version','type']) && reply.version===VERSION && reply.type==='denied') {
        fail('Mac folder selection denied.');
        return;
      }
      const selected=checkReady(reply);
      ready=true;
      clearTimeout(selectionTimer);
      selectedResolve(selected);
      return;
    }
    if (!pending) throw Error('Unsolicited native Files response.');
    const request=pending;
    const listing=checkListing(reply,request);
    clearTimeout(request.timer);
    pending=null;
    request.resolve(listing);
  }
  child.stdout.on('data',chunk=>{
    if (!active) return;
    buffer+=String(chunk);
    if (Buffer.byteLength(buffer,'utf8')>MAX_FRAME) {
      fail('Native Files broker exceeded output limit.');
      return;
    }
    while (active && buffer.includes('\n')) {
      const split=buffer.indexOf('\n');
      const line=buffer.slice(0,split);
      buffer=buffer.slice(split+1);
      if (!line || Buffer.byteLength(line,'utf8')>MAX_FRAME) {
        fail('Invalid native Files response.');
        return;
      }
      try { handle(JSON.parse(line)); }
      catch { fail('Invalid native Files response.'); return; }
    }
  });
  child.stderr.on('data',()=>{}); // drain without leaking local details
  child.on('error',()=>fail('Native Files broker crashed.'));
  child.on('exit',()=>fail('Native Files broker exited.'));
  child.stdin.on('error',()=>fail('Native Files broker pipe failed.'));
  selectionTimer=setTimeout(()=>fail('Mac folder selection timed out.'),
    Math.max(1,Math.min(90000,selectionMs)));

  return {
    promise,
    list(folder='.') {
      if (!active || !ready) return Promise.reject(Error('Native Files broker is not approved.'));
      if (pending) return Promise.reject(Error('Native Files listing is already pending.'));
      let relative;
      try { relative=validateRelativeFolder(folder).join('/'); }
      catch { return Promise.reject(Error('Invalid relative folder.')); }
      const id=randomId();
      if (typeof id !== 'string' || !/^[0-9a-f]{16}$/.test(id)) {
        return Promise.reject(Error('Invalid native Files request ID.'));
      }
      return new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>fail('Native Files listing timed out.'),
          Math.max(1,Math.min(10000,listMs)));
        pending={id,relative,resolve,reject,timer};
        try { send({version:VERSION,type:'list',requestId:id,folder:relative || '.'}); }
        catch(error) {
          if (pending) {clearTimeout(timer);pending=null;reject(error);}
        }
      });
    },
    cancel() { fail('Native Files access revoked.'); }
  };
}
