import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FilesGrant } from '../src/files-grant.js';
import { verifyPickedRoot, openMacFolderPicker } from '../src/folder-picker.js';

test('Mac-picked root requires actual directory and refuses broad system roots', t => {
  const root=mkdtempSync(join(tmpdir(), 'floatdesk-approved-'));
  t.after(()=>rmSync(root,{recursive:true,force:true}));
  mkdirSync(join(root,'Projects'));
  assert.equal(verifyPickedRoot(join(root,'Projects')).root,join(root,'Projects'));
  for(const p of ['/','/System','/private','/Library','/Users','relative','/a\nb','']) {
    assert.throws(()=>verifyPickedRoot(p),/folder|root|invalid/i);
  }
});
test('Files grant cannot be activated before Mac selection and expires independently', () => {
  let now=1000;
  const grant=new FilesGrant(()=>now);
  grant.request();
  assert.throws(()=>grant.approveWithSelection(null),/choose a folder/);
  grant.approveWithSelection({root:'/example/Projects',label:'Projects'});
  grant.check();
  grant.useAction();
  assert.throws(()=>grant.useAction(),/wait/);
  now+=81;
  grant.useAction();
  now+=5*60*1000;
  assert.throws(()=>grant.check(),/expired/);
});
test('native picker cannot be invoked on unsupported or unconfigured hosts', () => {
  assert.throws(()=>openMacFolderPicker({platform:'linux',binary:'/anything'}),/not configured/);
  assert.throws(()=>openMacFolderPicker({platform:'darwin',binary:''}),/not configured/);
});
test('picker result is validated locally; cancellation never grants access', async () => {
  class FakeChild {
    constructor() {
      this.stdout={on:(e,fn)=>{if(e==='data')this.out=fn}};
      this.stderr={on() {}};
      this.callbacks={};
    }
    on(e,fn) {this.callbacks[e]=fn}
    kill(){this.killed=true}
  }
  let child;
  const pick=(body)=> {
    const handle=openMacFolderPicker({
      platform:'darwin',binary:'/fake/helper',exists:()=>true,
      spawnProcess:()=>{child=new FakeChild();return child},
      verify:p=>({root:p,label:'Selected'})
    });
    child.out(body);
    child.callbacks.exit(0);
    return handle.promise;
  };
  assert.deepEqual(await pick('{"type":"chosen","path":"/Users/me/Projects"}\n'),
    {root:'/Users/me/Projects',label:'Selected'});
  await assert.rejects(pick('{"type":"cancelled"}\n'),/cancelled/);
  await assert.rejects(pick('{"type":"chosen","path":"../../../etc"}\n'),/Invalid|selection/);
});
