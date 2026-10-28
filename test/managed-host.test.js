import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

// Purely local regression: the wrapper MUST reject a LAN listener regardless
// of caller flags. Does not start the actual 8788 PiP streaming service.
test('M10 managed child rejects LAN and TLS escalation', async () => {
  for (const env of [
    {HOST:'0.0.0.0',PORT:'8789'},
    {HOST:'127.0.0.1',PORT:'8788'},
    {HOST:'127.0.0.1',PORT:'8789',TLS_CERT_FILE:'/tmp/sensitive'}
  ]) {
    const child = spawn(process.execPath,['src/managed-host.js'],{
      env:{PATH:process.env.PATH,...env},stdio:['ignore','ignore','pipe']
    });
    const code = await new Promise((resolve,reject)=>{
      child.on('error',reject);
      child.on('exit',resolve);
    });
    assert.equal(code,2,'invalid managed configuration must exit before server import');
  }
});
test('M10 managed child exits when owner stdin pipe closes', async () => {
  // The child receives the same scrubbed configuration as Swift. Its owner
  // pipe closes immediately before any launch delay can grant lasting access.
  const child=spawn(process.execPath,['src/managed-host.js'],{
    env:{PATH:process.env.PATH,HOST:'127.0.0.1',PORT:'8789'},
    stdio:['pipe','ignore','pipe']
  });
  child.stdin.end();
  const code=await Promise.race([
    new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve)}),
    new Promise((_,reject)=>setTimeout(()=>reject(new Error('orphaned child exceeded timeout')),4500))
  ]);
  assert.equal(code,0);
});
