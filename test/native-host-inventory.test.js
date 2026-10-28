import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectNativeServices, SERVICES} from '../src/native-host-inventory.js';

const GOOD='/Users/example/Build/floatdesk-native-files';
const valid = ()=>({
  mode:0o100755,isFile:()=>true,isSymbolicLink:()=>false
});
const inspect=(env={},lstat=valid,platform='darwin')=>
  inspectNativeServices({env,platform,lstat});

test('inventory is opt-in, sanitizes paths, preserves PiP independently',()=>{
  const r=inspect();
  assert.equal(r.services.length,4);
  assert.equal(r.services.every(x=>x.status==='disabled'),true);
  assert.equal(r.pip.transport,'browser-webrtc');
  assert.equal(r.pip.viewOnly,true);
  assert.equal(JSON.stringify(r).includes('FLOATDESK_'),false);
  assert.deepEqual(SERVICES.map(x=>x.id),[
    'nativeFiles','legacyPicker','touchAgent','companionProbe']);
});
test('configured service inventory is NOT proof of signing or TCC permission',()=>{
  const r=inspect({FLOATDESK_NATIVE_FILES_BIN:GOOD});
  assert.equal(r.services[0].status,'configured');
  assert.equal(r.services[1].status,'disabled');
  assert.equal(r.mode,'research');
  assert.match(r.verification,/unverified/);
  assert.equal(JSON.stringify(r).includes(GOOD),false);
});
test('invalid native binaries are rejected or reported missing without revealing paths',()=>{
  const env={FLOATDESK_NATIVE_FILES_BIN:GOOD};
  for(const make of [
    ()=>({...valid(),mode:0o100777}),
    ()=>({...valid(),mode:0o100644}),
    ()=>({...valid(),isSymbolicLink:()=>true}),
    ()=>({...valid(),isFile:()=>false})
  ]) assert.equal(inspect(env,make).services[0].status,'invalid');
  assert.equal(inspect(env,()=>{throw Error('private Mac path')}).services[0].status,'missing');
  assert.equal(inspect({FLOATDESK_NATIVE_FILES_BIN:'relative'},valid).services[0].status,'invalid');
  assert.equal(inspect({FLOATDESK_NATIVE_FILES_BIN:GOOD},valid,'linux').services[0].status,'unsupported');
  assert.equal(JSON.stringify(inspect(env,()=>{throw Error('secret')})).includes('secret'),false);
});
