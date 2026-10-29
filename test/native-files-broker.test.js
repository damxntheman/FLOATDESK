import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { startNativeFilesBroker } from '../src/native-files-broker.js';

class Child extends EventEmitter {
  constructor() {
    super();
    this.stdout=new EventEmitter();
    this.stderr=new EventEmitter();
    this.writes=[];
    this.killed=false;
    this.stdin=new EventEmitter();
    this.stdin.writable=true;
    this.stdin.end=()=>{this.ended=true};
    this.stdin.write=data=>{this.writes.push(JSON.parse(data));return true};
  }
  kill(){this.killed=true}
  reply(data){this.stdout.emit('data',JSON.stringify(data)+'\n')}
}
const RID='a'.repeat(16);
function make(opts={}) {
  const child=new Child();
  const broker=startNativeFilesBroker({
    platform:'darwin',binary:'/opt/floatdesk/native-files',
    exists:()=>true,spawnProcess:(bin,args,settings)=>{
      assert.equal(bin,'/opt/floatdesk/native-files');
      assert.deepEqual(args,[]);
      assert.deepEqual(settings,{stdio:['pipe','pipe','pipe']});
      return child;
    },randomId:()=>RID,...opts
  });
  return {child,broker};
}
const selected=()=>({version:1,type:'selected',label:'Projects'});
const listing=(folder='')=>({
  version:1,type:'listing',requestId:RID,folder,truncated:false,
  entries:[{name:'Audio',kind:'folder'},{name:'mix.flp',kind:'file'}]
});

test('native broker only accepts Mac-owner selection and relative read-only list requests',async()=>{
  const {child,broker}=make();
  child.reply(selected());
  assert.deepEqual(await broker.promise,{label:'Projects'});
  const response=broker.list('.');
  assert.deepEqual(child.writes,[{version:1,type:'list',requestId:RID,folder:'.'}]);
  child.reply(listing());
  assert.deepEqual(await response,{folder:'',entries:listing().entries,truncated:false});
  await assert.rejects(broker.list('../private'),/Invalid relative folder/);
  await assert.rejects(broker.list('/etc'),/Invalid relative folder/);
  await assert.rejects(broker.list('.hidden'),/Invalid relative folder/);
  assert.equal(child.killed,false);
  broker.cancel();
  assert.equal(child.killed,true);
  await assert.rejects(broker.list('.'),/not approved/);
});
test('no Files broker without opt-in Mac binary',()=>{
  assert.throws(()=>startNativeFilesBroker({platform:'linux'}),/not configured/);
  assert.throws(()=>startNativeFilesBroker({platform:'darwin',binary:'relative'}),/not configured/);
  assert.throws(()=>startNativeFilesBroker({platform:'darwin',binary:'/not/installed',exists:()=>false}),/not configured/);
});
test('pending selection cancellation, invalid selection and native denial fail closed',async()=>{
  for(const response of [
    {version:1,type:'cancelled'},
    {version:1,type:'denied'},
    {version:1,type:'selected',label:'../private'},
    {...selected(),root:'/Users/private'}
  ]) {
    const {child,broker}=make();
    child.reply(response);
    await assert.rejects(broker.promise,/cancelled|denied|Invalid/);
    assert.equal(child.killed,true);
  }
});
test('forged native file listings are rejected and broker exits',async()=>{
  for(const forged of [
    {...listing(),folder:'../'},
    {...listing(),requestId:'b'.repeat(16)},
    {...listing(),entries:[{name:'.ssh',kind:'folder'}]},
    {...listing(),entries:[{name:'Secret',kind:'symbolicLink'}]},
    {...listing(),entries:[{name:'File',kind:'file',path:'/private'}]},
    {...listing(),entries:Array(101).fill({name:'file',kind:'file'})},
    {...listing(),capabilities:{terminal:true}},
    {version:1,type:'error',requestId:RID,message:'denied'}
  ]) {
    const {child,broker}=make();
    child.reply(selected());
    await broker.promise;
    const p=broker.list('.');
    child.reply(forged);
    await assert.rejects(p,/Invalid native Files response/);
    assert.equal(child.killed,true);
  }
});
test('only one listing at a time; child exit and cancellation revoke in-flight work',async()=>{
  const {child,broker}=make();
  child.reply(selected());
  await broker.promise;
  const pending=broker.list('Audio');
  await assert.rejects(broker.list('.'),/already pending/);
  child.emit('exit',1);
  await assert.rejects(pending,/exited/);
  assert.equal(child.killed,true);
});
test('select and list timeouts kill subprocess and deny access',async()=>{
  const one=make({selectionMs:15});
  await assert.rejects(one.broker.promise,/timed out/);
  assert.equal(one.child.killed,true);
  const two=make({listMs:15});
  two.child.reply(selected());
  await two.broker.promise;
  await assert.rejects(two.broker.list('.'),/timed out/);
  assert.equal(two.child.killed,true);
});

test('child death after approval notifies owner and closes native scope',async()=>{
  const notifications=[];
  const {child,broker}=make({onEnd:reason=>notifications.push(reason)});
  child.reply(selected());
  await broker.promise;
  child.emit('exit',1);
  assert.deepEqual(notifications,['Native Files broker exited.']);
  assert.equal(child.killed,true);
});
test('cancel after approval is idempotent and notifies only once',async()=>{
  const reasons=[];
  const {child,broker}=make({onEnd:reason=>reasons.push(reason)});
  child.reply(selected());
  await broker.promise;
  broker.cancel();
  broker.cancel();
  assert.deepEqual(reasons,['Native Files access revoked.']);
});

test('UTF-8 names survive arbitrary byte boundaries in native stdout',async()=>{
  const {child,broker}=make();
  const selection={...selected(),label:'Café 🎵'};
  const response={...listing(),entries:[{name:'音楽 🎵.flp',kind:'file'}]};
  function bytewise(frame) {
    for (const byte of Buffer.from(JSON.stringify(frame)+'\n')) {
      child.stdout.emit('data',Buffer.from([byte]));
    }
  }
  bytewise(selection);
  assert.deepEqual(await broker.promise,{label:selection.label});
  const pending=broker.list('.');
  bytewise(response);
  assert.deepEqual((await pending).entries,response.entries);
  broker.cancel();
});

test('malformed UTF-8 is rejected instead of exposing replacement filenames',async()=>{
  const {child,broker}=make();
  const frame=Buffer.from(JSON.stringify(selected())+'\n');
  frame[frame.indexOf('Projects')]=0xff;
  child.stdout.emit('data',frame);
  await assert.rejects(broker.promise,/Invalid native Files response/);
  assert.equal(child.killed,true);
});

test('incomplete UTF-8 and over-limit frames fail closed',async()=>{
  const truncated=make({selectionMs:20});
  truncated.child.stdout.emit('data',Buffer.from([0x7b,0xc3]));
  truncated.child.stdout.emit('end');
  await assert.rejects(truncated.broker.promise,/output ended/);
  assert.equal(truncated.child.killed,true);
  const oversized=make();
  oversized.child.stdout.emit('data',Buffer.alloc(32768,0x61));
  oversized.child.stdout.emit('data',Buffer.from([0xc3]));
  await assert.rejects(oversized.broker.promise,/output limit/);
  assert.equal(oversized.child.killed,true);
});
