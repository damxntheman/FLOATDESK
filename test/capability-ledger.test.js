import test from 'node:test';
import assert from 'node:assert/strict';
import { CapabilityLedger } from '../src/capability-ledger.js';

const encode = value => JSON.stringify(value);
function setup() {
  let now = 1000;
  const ledger = new CapabilityLedger({ ownerId:'owner', clock:()=>now });
  const generation = ledger.generation;
  ledger.startSession({ sessionId:'session', viewerId:'viewer' });
  const grant = { version:1, generation, ownerId:'owner', sessionId:'session', viewerId:'viewer', sessionEpoch:0, revocationEpoch:0, grantId:'grant', capability:'files', scope:'root_1', operations:['list'], approvalDeadline:31000, ttlMs:5000 };
  const operation = {version:1, generation, ownerId:'owner', sessionId:'session', viewerId:'viewer', sessionEpoch:0, revocationEpoch:0, grantId:'grant', capability:'files', scope:'root_1', operation:'list', sequence:1};
  return { ledger, grant, operation, time:value=>{ now=value; } };
}

test('valid scoped grant and operation require a matching current session',()=>{
  const f=setup(); f.ledger.issue(encode(f.grant));
  const receipt=f.ledger.authorize(encode(f.operation));
  assert.equal(f.ledger.complete(receipt),true);
  assert.throws(()=>f.ledger.complete(receipt));
});

test('rejects malformed, oversized, noncanonical and unknown frames',()=>{
  const f=setup();
  for (const frame of ['{', ' '.repeat(2049), '{}', JSON.stringify(f.grant,null,2), '{"version":1,"version":1}', encode({...f.grant, extra:true}),encode({...f.grant,version:2})]) assert.throws(()=>f.ledger.issue(frame));
  assert.throws(()=>f.ledger.issue({}));
});

test('identity, session, generation, capability, operation and scope cannot be substituted',()=>{
  const f=setup(); f.ledger.issue(encode(f.grant));
  for (const change of [{ownerId:'wrong'},{viewerId:'wrong'},{sessionId:'other'},{generation:'old'},{capability:'click'},{scope:'root_2'},{operation:'write'}, {sequence:0}]) assert.throws(()=>f.ledger.authorize(encode({...f.operation,...change})));
  assert.equal(f.ledger.complete(f.ledger.authorize(encode(f.operation))),true);
});

test('replay, duplicates, gaps, and reused grant IDs are denied',()=>{
  const f=setup(); f.ledger.issue(encode(f.grant));
  assert.throws(()=>f.ledger.issue(encode(f.grant)));
  assert.throws(()=>f.ledger.authorize(encode({...f.operation,sequence:2})));
  f.ledger.authorize(encode(f.operation));
  assert.throws(()=>f.ledger.authorize(encode(f.operation)));
  f.ledger.authorize(encode({...f.operation,sequence:2}));
  f.ledger.revoke('session','grant');
  assert.throws(()=>f.ledger.issue(encode(f.grant)));
});

test('expiry boundary and revoke fence delayed completion',()=>{
  const f=setup(); f.ledger.issue(encode(f.grant));
  const receipt=f.ledger.authorize(encode(f.operation));
  f.time(6000); assert.throws(()=>f.ledger.complete(receipt));
  assert.throws(()=>f.ledger.authorize(encode({...f.operation,sequence:2})));
  const g=setup(); g.ledger.issue(encode(g.grant));
  const pending=g.ledger.authorize(encode(g.operation)); g.ledger.revoke('session','grant');
  assert.throws(()=>g.ledger.complete(pending)); assert.throws(()=>g.ledger.authorize(encode({...g.operation,sequence:2})));
});

test('disconnect, stop and resume fence grants and pending operations',()=>{
  for(const end of ['disconnect','stopSession']) {
    const f=setup(); f.ledger.issue(encode(f.grant)); const r=f.ledger.authorize(encode(f.operation));
    f.ledger[end]('session'); assert.throws(()=>f.ledger.complete(r));
    assert.throws(()=>f.ledger.authorize(encode({...f.operation,sequence:2})));
    if(end==='disconnect') {
      assert.throws(()=>f.ledger.resumeSession({sessionId:'session',viewerId:'other'}));
      const epoch=f.ledger.resumeSession({sessionId:'session',viewerId:'viewer'});
      assert.equal(epoch,2);
      assert.throws(()=>f.ledger.authorize(encode({...f.operation,sequence:2})));
      assert.throws(()=>f.ledger.issue(encode({...f.grant,grantId:'delayed'})));
      f.ledger.issue(encode({...f.grant,grantId:'fresh',sessionEpoch:epoch}));
    } else assert.throws(()=>f.ledger.resumeSession({sessionId:'session',viewerId:'viewer'}));
  }
});

test('fresh service generation rejects old grants, requests and receipts',()=>{
  const f=setup(); f.ledger.issue(encode(f.grant)); const r=f.ledger.authorize(encode(f.operation));
  const next=new CapabilityLedger({ownerId:'owner',clock:()=>1000});
  assert.notEqual(next.generation,f.ledger.generation);
  next.startSession({sessionId:'session',viewerId:'viewer'});
  assert.throws(()=>next.issue(encode(f.grant))); assert.throws(()=>next.authorize(encode(f.operation))); assert.throws(()=>next.complete(r));
});

test('PiP view cannot confer input, file writes, shell, or keyboard',()=>{
  const f=setup(); const g={...f.grant,capability:'view',operations:['watch']}; f.ledger.issue(encode(g));
  assert.throws(()=>f.ledger.authorize(encode({...f.operation,capability:'click',operation:'click'})));
  for(const change of [{capability:'click',operations:['keyboard']},{capability:'files',operations:['write']},{capability:'terminal',operations:['shell']},{capability:'view',operations:['click']},{capability:'unknown',operations:['watch']}]) assert.throws(()=>f.ledger.issue(encode({...f.grant,grantId:'other',...change})));
});

test('clock faults, backward time, unsafe TTL and invalid scopes fail closed',()=>{
  for(const ttlMs of [0,-1,Infinity,Number.MAX_SAFE_INTEGER,300001]) {const f=setup();assert.throws(()=>f.ledger.issue(encode({...f.grant,ttlMs})));}
  for(const scope of ['', '../secret', '/absolute', 'a'.repeat(65),null]) {const f=setup();assert.throws(()=>f.ledger.issue(encode({...f.grant,scope})));}
  const f=setup(); f.ledger.issue(encode(f.grant)); f.time(999); assert.throws(()=>f.ledger.authorize(encode(f.operation))); f.time(1001); assert.throws(()=>f.ledger.authorize(encode(f.operation)));
});


test('stopped disconnected sessions cannot be resumed; forged and cancelled receipts fail',()=>{
  const f=setup(); f.ledger.issue(encode(f.grant));
  const r=f.ledger.authorize(encode(f.operation));
  assert.throws(()=>f.ledger.complete({}));
  f.ledger.cancel(r); assert.throws(()=>f.ledger.complete(r));
  f.ledger.disconnect('session'); f.ledger.stopSession('session');
  assert.throws(()=>f.ledger.resumeSession({sessionId:'session',viewerId:'viewer'}));
});


test('revocation fences delayed unseen approvals only within the same capability and scope',()=>{
  const f=setup(); f.ledger.issue(encode(f.grant));
  f.ledger.issue(encode({...f.grant,grantId:'second'}));
  f.ledger.issue(encode({...f.grant,grantId:'another',scope:'root_2'}));
  f.ledger.revoke('session','grant');
  assert.throws(()=>f.ledger.issue(encode({...f.grant,grantId:'delayed'})));
  assert.throws(()=>f.ledger.authorize(encode({...f.operation,grantId:'second'})));
  const r=f.ledger.authorize(encode({...f.operation,grantId:'another',scope:'root_2'}));
  assert.equal(f.ledger.complete(r),true);
  assert.equal(f.ledger.getRevocationEpoch('session','files','root_1'),1);
  f.ledger.issue(encode({...f.grant,grantId:'new',revocationEpoch:1}));
  assert.throws(()=>f.ledger.revoke('session','grant'));
  assert.equal(f.ledger.complete(f.ledger.authorize(encode({...f.operation,grantId:'new',revocationEpoch:1}))),true);
});

test('bounded session, grant and pending stores reject exhaustion without evicting authority state',()=>{
  const sessions=setup();
  for(let i=0;i<127;i++) sessions.ledger.startSession({sessionId:`s${i}`,viewerId:'viewer'});
  assert.throws(()=>sessions.ledger.startSession({sessionId:'overflow',viewerId:'viewer'}));
  sessions.ledger.stopSession('session');
  assert.throws(()=>sessions.ledger.startSession({sessionId:'session',viewerId:'viewer'}));
  const grants=setup();
  for(let i=0;i<4096;i++) grants.ledger.issue(encode({...grants.grant,grantId:`g${i}`}));
  assert.throws(()=>grants.ledger.issue(encode({...grants.grant,grantId:'overflow'})));
  grants.ledger.revoke('session','g0');
  assert.throws(()=>grants.ledger.issue(encode({...grants.grant,grantId:'g0',revocationEpoch:1})));
  const pending=setup(); pending.ledger.issue(encode(pending.grant));
  let first;
  for(let i=1;i<=1024;i++) { const receipt=pending.ledger.authorize(encode({...pending.operation,sequence:i})); if(i===1) first=receipt; }
  assert.throws(()=>pending.ledger.authorize(encode({...pending.operation,sequence:1025})));
  pending.ledger.cancel(first);
  const next=pending.ledger.authorize(encode({...pending.operation,sequence:1025}));
  assert.equal(pending.ledger.complete(next),true);
});

test('invalid clocks poison the instance and unsafe arithmetic never grants',()=>{
  for(const clock of [()=>NaN,()=>Infinity,()=>-1,()=>{throw Error('clock');}]) {
    const ledger=new CapabilityLedger({ownerId:'owner',clock});
    assert.throws(()=>ledger.startSession({sessionId:'s',viewerId:'v'}));
    assert.throws(()=>ledger.startSession({sessionId:'s',viewerId:'v'}));
  }
  const ledger=new CapabilityLedger({ownerId:'owner',clock:()=>Number.MAX_SAFE_INTEGER});
  ledger.startSession({sessionId:'s',viewerId:'v'});
  assert.throws(()=>ledger.issue(encode({version:1,generation:ledger.generation,ownerId:'owner',sessionId:'s',viewerId:'v',sessionEpoch:0,revocationEpoch:0,grantId:'g',capability:'files',scope:'root',operations:['list'],approvalDeadline:Number.MAX_SAFE_INTEGER,ttlMs:1})));
});

test('malformed operation frames and sequence errors do not consume valid sequence',()=>{
  const f=setup(); f.ledger.issue(encode(f.grant));
  for(const data of ['{', 'x'.repeat(2049),JSON.stringify(f.operation,null,2),encode({...f.operation,unknown:'x'}),encode({...f.operation,sequence:Number.MAX_SAFE_INTEGER}),encode({...f.operation,sequence:1.5}),encode({...f.operation,revocationEpoch:1}),encode({...f.operation,capability:'__proto__'})]) assert.throws(()=>f.ledger.authorize(data));
  assert.equal(f.ledger.complete(f.ledger.authorize(encode(f.operation))),true);
});

test('revoking an empty scope cancels pending approvals without affecting other scopes',()=>{
  const f=setup();
  f.ledger.revokeScope('session','files','root_1');
  assert.throws(()=>f.ledger.issue(encode(f.grant)));
  f.ledger.issue(encode({...f.grant,revocationEpoch:1}));
  f.ledger.issue(encode({...f.grant,grantId:'other',scope:'root_2'}));
  f.ledger.revokeScope('session','files','root_1');
  assert.throws(()=>f.ledger.authorize(encode({...f.operation,revocationEpoch:1})));
  assert.equal(f.ledger.complete(f.ledger.authorize(encode({...f.operation,grantId:'other',scope:'root_2'}))),true);
  assert.throws(()=>f.ledger.revokeScope('session','__proto__','root_1'));
  assert.equal(f.ledger.getRevocationEpoch('session','files','root_1'),2);
});

test('scope exhaustion permanently stops the affected session and preserves other sessions',()=>{
  const f=setup();
  f.ledger.issue(encode(f.grant));
  const pending=f.ledger.authorize(encode(f.operation));
  f.ledger.startSession({sessionId:'other_session',viewerId:'viewer'});
  for(let i=0;i<4095;i++) f.ledger.revokeScope('session','files',`scope_${i}`);
  assert.throws(()=>f.ledger.revokeScope('session','files','overflow'));
  assert.throws(()=>f.ledger.issue(encode({...f.grant,grantId:'delayed',scope:'overflow'})));
  assert.throws(()=>f.ledger.complete(pending));
  assert.throws(()=>f.ledger.resumeSession({sessionId:'session',viewerId:'viewer'}));
  assert.equal(f.ledger.getRevocationEpoch('other_session','files','root_2'),0);
});

test('expired abandoned receipts do not exhaust pending capacity',()=>{
  const f=setup(); f.ledger.issue(encode({...f.grant,ttlMs:1}));
  let old;
  for(let i=1;i<=1024;i++) { const r=f.ledger.authorize(encode({...f.operation,sequence:i})); if(i===1) old=r; }
  f.time(1001);
  f.ledger.issue(encode({...f.grant,grantId:'new'}));
  const current=f.ledger.authorize(encode({...f.operation,grantId:'new'}));
  assert.throws(()=>f.ledger.complete(old));
  assert.equal(f.ledger.complete(current),true);
});


test('delayed approval expires at prompt deadline even without revocation',()=>{
  const f=setup(); f.time(31000);
  assert.throws(()=>f.ledger.issue(encode(f.grant)));
  const g=setup();
  assert.throws(()=>g.ledger.issue(encode({...g.grant,approvalDeadline:31001})));
  assert.throws(()=>g.ledger.issue(encode({...g.grant,approvalDeadline:1000})));
  assert.throws(()=>g.ledger.issue(encode({...g.grant,approvalDeadline:null})));
  g.time(30999); g.ledger.issue(encode(g.grant));
});

test('authorization fails when deadline arrives during capacity housekeeping',()=>{
  let readings=[1000,1000,5999,6000];
  const ledger=new CapabilityLedger({ownerId:'owner',clock:()=>readings.shift() ?? 6000});
  ledger.startSession({sessionId:'session',viewerId:'viewer'});
  const common={version:1,generation:ledger.generation,ownerId:'owner',sessionId:'session',viewerId:'viewer',sessionEpoch:0,revocationEpoch:0,grantId:'grant',capability:'files',scope:'root_1'};
  ledger.issue(encode({...common,operations:['list'],approvalDeadline:31000,ttlMs:5000}));
  assert.throws(()=>ledger.authorize(encode({...common,operation:'list',sequence:1})));
});
