import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { probeNativeCompanion, validateCompanionAck,
  DECLARED_CAPABILITIES } from '../src/native-companion.js';

const ID='a'.repeat(32);
const ack = override => ({
  version:1,type:'hello-ack',requestId:ID,platform:'macos',
  capabilities:{capture:false,input:false,files:false,terminal:false},
  ...override
});

function fakeChild(reply, {signal='data',exitCode=null}={}) {
  const child=new EventEmitter();
  child.stdout=new EventEmitter();
  child.stderr=new EventEmitter();
  child.killed=false;
  child.kill=()=>{child.killed=true};
  child.stdin=new EventEmitter();
  child.stdin.writable=true;
  child.stdin.writableLength=0;
  child.stdin.end=()=>{child.ended=true};
  child.stdin.write=frame=>{
    child.sent=JSON.parse(frame);
    setImmediate(()=>{
      if (signal === 'error') child.emit('error',new Error('mock failure'));
      else if (signal === 'exit') child.emit('exit',exitCode);
      else if (signal === 'data') child.stdout.emit('data',reply);
    });
    return true;
  };
  return child;
}

const options = (child, extra={}) => ({
  platform:'darwin',binary:'/approved/floatdesk-companion-probe',
  exists:()=>true,spawnProcess:(file,args,opts)=>{
    assert.equal(file,'/approved/floatdesk-companion-probe');
    assert.deepEqual(args,[]);
    assert.deepEqual(opts,{stdio:['pipe','pipe','pipe']});
    return child;
  },makeRequestId:()=>ID,...extra
});

test('M6 handshake is versioned, local-process-only and advertises zero privileges', async () => {
  const child=fakeChild(JSON.stringify(ack())+'\n');
  const result=await probeNativeCompanion(options(child));
  assert.deepEqual(child.sent,{version:1,type:'hello',requestId:ID});
  assert.deepEqual(result,{
    status:'ready',protocolVersion:1,capabilities:{...DECLARED_CAPABILITIES}
  });
  assert.equal(child.ended,true);
  assert.equal(child.killed,true);
});

test('native companion rejects wrong protocol, unmatched requests and privileged claims', () => {
  for(const override of [
    {version:2}, {type:'grant-control'}, {requestId:'b'.repeat(32)},
    {platform:'ios'}, {capabilities:{...DECLARED_CAPABILITIES,files:true}},
    {capabilities:{...DECLARED_CAPABILITIES,terminal:true}},
    {capabilities:{...DECLARED_CAPABILITIES,arbitrary:true}},
    {capabilities:{}}
  ]) {
    assert.throws(()=>validateCompanionAck(ack(override),ID),/mismatch|not approved/);
  }
});

test('native companion refuses unsupported hosts, relative paths and non-opt-in launch', () => {
  assert.throws(()=>probeNativeCompanion({platform:'linux'}),/not configured/);
  assert.throws(()=>probeNativeCompanion({platform:'darwin',binary:'probe'}),/not configured/);
  assert.throws(()=>probeNativeCompanion({platform:'darwin',binary:'/unconfigured',
    exists:()=>false}),/not configured/);
  assert.throws(()=>probeNativeCompanion({platform:'darwin',
    binary:'/configured',exists:()=>true,makeRequestId:()=> 'bad'}),
    /identifier/);
});

test('no response, oversized output, malformed JSON or process crash fail closed', async () => {
  for(const [body,settings] of [
    ['not json\n',{}],
    [JSON.stringify(ack({capabilities:{...DECLARED_CAPABILITIES,input:true}}))+'\n',{}],
    ['x'.repeat(2300),{}],
    [JSON.stringify(ack())+'\nInjected output',{}],
    ['',{signal:'error'}],
    ['',{signal:'exit'}]
  ]) {
    const child=fakeChild(body,settings);
    await assert.rejects(probeNativeCompanion(options(child)),/handshake failed/);
    assert.equal(child.killed,true);
  }
});

test('native probe can time out without leaving child running', async () => {
  const child=fakeChild('',{signal:'none'});
  await assert.rejects(probeNativeCompanion(options(child,{timeoutMs:10})),/handshake failed/);
  assert.equal(child.killed,true);
});
