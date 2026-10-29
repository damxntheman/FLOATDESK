// M14 research model only. No network or native integration. Callers MUST
// authenticate owner/viewer and bind them to sessions before invoking this API.
// IDs are labels, not secrets, cryptographic proofs, or owner confirmation.
import { randomBytes } from 'node:crypto';
import { performance } from 'node:perf_hooks';

const MAX_FRAME = 2048;
const MAX_SESSIONS = 128;
const MAX_GRANTS = 4096; // includes revoked IDs; never reuse during a generation
const MAX_PENDING = 1024;
const MAX_REVOCATION_SCOPES = 4096;
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const POLICY = Object.freeze({
  view: Object.freeze({ ops:['watch'], maxTTL:300000 }),
  click: Object.freeze({ ops:['click'], maxTTL:120000 }),
  'app-list': Object.freeze({ ops:['list'], maxTTL:300000 }),
  'app-launch': Object.freeze({ ops:['launch'], maxTTL:300000 }),
  terminal: Object.freeze({ ops:['help','date','uptime','system'], maxTTL:180000 }),
  files: Object.freeze({ ops:['list'], maxTTL:300000 })
});
const ISSUE_KEYS = ['version','generation','ownerId','sessionId','viewerId','sessionEpoch','revocationEpoch','grantId','capability','scope','operations','approvalDeadline','ttlMs'];
const ACTION_KEYS = ['version','generation','ownerId','sessionId','viewerId','sessionEpoch','revocationEpoch','grantId','capability','scope','operation','sequence'];
function deny() { throw new Error('Capability authorization denied.'); }
function identifier(value) { return typeof value === 'string' && ID.test(value); }
function frame(text, keys) {
  if (typeof text !== 'string' || Buffer.byteLength(text,'utf8') > MAX_FRAME) deny();
  let value;
  try { value=JSON.parse(text); } catch { deny(); }
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).length !== keys.length ||
      keys.some(key=>!Object.hasOwn(value,key)) ||
      // A single unambiguous compact JSON form rejects duplicate member names,
      // alternate number spellings and trailing content before any state change.
      JSON.stringify(value) !== text) deny();
  return value;
}
function validPolicy(capability, operations) {
  if (!Object.hasOwn(POLICY,capability) || !Array.isArray(operations) ||
      operations.length === 0 || operations.length > POLICY[capability].ops.length ||
      new Set(operations).size !== operations.length ||
      operations.some(op=>typeof op !== 'string' || !POLICY[capability].ops.includes(op))) deny();
  return POLICY[capability];
}

export class CapabilityLedger {
  #owner; #clock; #last = 0; #broken = false;
  #generation = randomBytes(16).toString('hex');
  #sessions = new Map(); #grants = new Map(); #pending = new Map(); #scopeCount = 0;
  constructor({ownerId,clock=()=>Math.floor(performance.now())}={}) {
    if (!identifier(ownerId) || typeof clock !== 'function') deny();
    this.#owner=ownerId; this.#clock=clock;
  }
  get generation() { return this.#generation; }
  #now() {
    if (this.#broken) deny();
    let now;
    try { now=this.#clock(); } catch { this.#broken=true; deny(); }
    if (!Number.isSafeInteger(now) || now < 0 || now < this.#last) {
      this.#broken=true; deny();
    }
    this.#last=now; return now;
  }
  #prunePending(now) {
    for (const [receipt,grant] of this.#pending) {
      if (!grant.active || now >= grant.expires) this.#pending.delete(receipt);
    }
  }
  #session(id) {
    const s=this.#sessions.get(id);
    if (!s || s.state !== 'active') deny();
    return s;
  }
  // Lifecycle methods are privileged local calls, NOT authenticated endpoints.
  startSession({sessionId,viewerId}={}) {
    if (!identifier(sessionId) || !identifier(viewerId) ||
        this.#sessions.has(sessionId) || this.#sessions.size >= MAX_SESSIONS) deny();
    this.#now();
    this.#sessions.set(sessionId,{viewerId,state:'active',epoch:0,revocations:new Map()});
    return 0;
  }
  #invalidate(sessionId, state) {
    const s=this.#sessions.get(sessionId);
    if (!s || s.state === 'stopped' || (state === 'disconnected' && s.state !== 'active')) deny();
    s.state=state; s.epoch++;
    for (const g of this.#grants.values()) if (g.sessionId === sessionId) g.active=false;
    // Drop receipts immediately: late asynchronous completions must fail.
    for (const [receipt,g] of this.#pending) if (g.sessionId === sessionId) this.#pending.delete(receipt);
  }
  disconnect(sessionId) { this.#invalidate(sessionId,'disconnected'); }
  stopSession(sessionId) { this.#invalidate(sessionId,'stopped'); }
  resumeSession({sessionId,viewerId}={}) {
    const s=this.#sessions.get(sessionId);
    if (!s || s.state !== 'disconnected' || s.viewerId !== viewerId) deny();
    this.#now(); s.epoch++; s.state='active'; return s.epoch;
  }
  // Only trusted owner authority reads epochs to bind a new approval.
  getRevocationEpoch(sessionId,capability,scope) {
    const s=this.#session(sessionId);
    if (!Object.hasOwn(POLICY,capability) || !identifier(scope)) deny();
    return s.revocations.get(JSON.stringify([capability,scope])) || 0;
  }
  // The issuer is a trusted future owner authority, not Node/viewer messages.
  issue(text) {
    const v=frame(text,ISSUE_KEYS);
    if (v.version !== 1 || v.generation !== this.#generation || v.ownerId !== this.#owner ||
        !identifier(v.sessionId) || !identifier(v.viewerId) || !identifier(v.grantId) ||
        !identifier(v.scope) || typeof v.capability !== 'string' ||
        this.#grants.has(v.grantId) || this.#grants.size >= MAX_GRANTS) deny();
    const s=this.#session(v.sessionId);
    if (s.viewerId !== v.viewerId || v.sessionEpoch !== s.epoch ||
        v.revocationEpoch !== this.getRevocationEpoch(v.sessionId,v.capability,v.scope)) deny();
    const policy=validPolicy(v.capability,v.operations);
    if (!Number.isSafeInteger(v.ttlMs) || v.ttlMs < 1 || v.ttlMs > policy.maxTTL) deny();
    const now=this.#now();
    this.#prunePending(now);
    // Deadline is captured by the trusted authority when the prompt begins.
    // Never refresh it on delivery of a queued approval.
    if (!Number.isSafeInteger(v.approvalDeadline) || v.approvalDeadline <= now ||
        v.approvalDeadline - now > 30000 || !Number.isSafeInteger(now + v.ttlMs)) deny();
    const key=JSON.stringify([v.capability,v.scope]);
    if (!s.revocations.has(key)) {
      if (this.#scopeCount >= MAX_REVOCATION_SCOPES) deny();
      s.revocations.set(key,0); this.#scopeCount++;
    }
    this.#grants.set(v.grantId,{sessionId:v.sessionId,viewerId:v.viewerId,epoch:s.epoch,
      capability:v.capability,scope:v.scope,revocationEpoch:v.revocationEpoch,operations:new Set(v.operations),
      expires:now+v.ttlMs,sequence:0,active:true});
  }
  // Revocation is a trusted authority call. Fences pending approvals even if
  // no grant has yet been installed. A finite tombstone budget never evicts.
  revokeScope(sessionId,capability,scope) {
    const s=this.#session(sessionId);
    if (!Object.hasOwn(POLICY,capability) || !identifier(scope)) deny();
    const key=JSON.stringify([capability,scope]);
    const exists=s.revocations.has(key);
    if (!exists && this.#scopeCount >= MAX_REVOCATION_SCOPES) {
      this.#invalidate(sessionId,'stopped'); // fail closed when revoke cannot be recorded
      deny();
    }
    const epoch=s.revocations.get(key) || 0;
    if (epoch >= Number.MAX_SAFE_INTEGER) deny();
    if (!exists) this.#scopeCount++;
    s.revocations.set(key,epoch+1);
    for (const g of this.#grants.values()) {
      if (g.sessionId===sessionId && g.capability===capability && g.scope===scope) g.active=false;
    }
    for (const [receipt,g] of this.#pending) if (!g.active) this.#pending.delete(receipt);
  }
  revoke(sessionId,grantId) {
    const grant=this.#grants.get(grantId);
    if (!grant || !grant.active || grant.sessionId !== sessionId) deny();
    this.revokeScope(sessionId,grant.capability,grant.scope);
  }
  #check(grant,now=this.#now()) {
    const s=this.#session(grant.sessionId);
    if (!grant.active || s.epoch !== grant.epoch || s.viewerId !== grant.viewerId ||
        this.getRevocationEpoch(grant.sessionId,grant.capability,grant.scope) !== grant.revocationEpoch ||
        now >= grant.expires) deny();
  }
  authorize(text) {
    const v=frame(text,ACTION_KEYS);
    if (v.version !== 1 || v.generation !== this.#generation || v.ownerId !== this.#owner ||
        !identifier(v.sessionId) || !identifier(v.viewerId) || !identifier(v.grantId) ||
        !identifier(v.scope) || typeof v.operation !== 'string' || typeof v.capability !== 'string' ||
        !Number.isSafeInteger(v.sequence) || v.sequence < 1) deny();
    const grant=this.#grants.get(v.grantId);
    if (!grant || grant.sessionId !== v.sessionId || grant.viewerId !== v.viewerId ||
        grant.capability !== v.capability || grant.scope !== v.scope || grant.epoch !== v.sessionEpoch ||
        grant.revocationEpoch !== v.revocationEpoch ||
        !grant.operations.has(v.operation) || v.sequence !== grant.sequence + 1) deny();
    this.#check(grant);
    const now=this.#now();
    this.#check(grant,now);
    this.#prunePending(now);
    if (this.#pending.size >= MAX_PENDING) deny();
    const receipt=Object.freeze(Object.create(null));
    grant.sequence=v.sequence;
    this.#pending.set(receipt,grant);
    return receipt;
  }
  // Cancel does not reset sequence or authorize any effect.
  cancel(receipt) { if (!this.#pending.delete(receipt)) deny(); }
  // A receipt is an in-process one-use identity, never a serializable token.
  // Check just before releasing a result or performing a separately guarded
  // effect; this cannot undo an operation already dispatched to another process.
  complete(receipt) {
    const grant=this.#pending.get(receipt);
    if (!grant) deny();
    this.#pending.delete(receipt);
    this.#check(grant);
    return true;
  }
}
