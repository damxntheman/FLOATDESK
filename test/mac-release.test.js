import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const script=fileURLToPath(new URL('../scripts/verify-mac-release.sh',import.meta.url));
const validDetails=[
  'Executable=/fixture/FLOATDESK.app/Contents/MacOS/FloatdeskMacHost',
  'CodeDirectory v=20500 size=123 flags=0x10000(runtime) hashes=1+7 location=embedded',
  'Authority=Developer ID Application: Fixture Developer (ABCDEFGHIJ)',
  'TeamIdentifier=ABCDEFGHIJ'
].join('\n');

function check(details=validDetails,{signature=0,assessment=0}={}) {
  const root=mkdtempSync(join(tmpdir(),'floatdesk-release-'));
  try {
    const app=join(root,'runtime.app');
    mkdirSync(app);
    const bin=join(root,'bin'); mkdirSync(bin);
    const fixture=join(root,'details'); writeFileSync(fixture,details+'\n');
    writeFileSync(join(bin,'codesign'),'#!/bin/bash\nif [[ "$1" == "-dv" ]]; then cat "$FLOATDESK_TEST_DETAILS"; else exit "$FLOATDESK_TEST_SIGNATURE"; fi\n',{mode:0o700});
    writeFileSync(join(bin,'spctl'),'#!/bin/bash\nexit "$FLOATDESK_TEST_ASSESSMENT"\n',{mode:0o700});
    return spawnSync('bash',[script,app],{encoding:'utf8',env:{...process.env,
      PATH:bin+delimiter+process.env.PATH,FLOATDESK_EXPECTED_TEAM_ID:'ABCDEFGHIJ',
      FLOATDESK_TEST_DETAILS:fixture,FLOATDESK_TEST_SIGNATURE:String(signature),
      FLOATDESK_TEST_ASSESSMENT:String(assessment)}});
  } finally { rmSync(root,{recursive:true,force:true}); }
}

test('release gate requires hardened runtime flags, not runtime in a path',()=>{
  const result=check(validDetails.replace('flags=0x10000(runtime)','flags=0x0(none)')
    .replace('/fixture/FLOATDESK.app','/fixture/runtime.app'));
  assert.equal(result.status,3);
  assert.match(result.stderr,/no hardened runtime/);
});

test('release gate requires an exact team field and Developer ID authority field',()=>{
  for (const details of [
    validDetails.replace('TeamIdentifier=ABCDEFGHIJ','TeamIdentifier=ABCDEFGHIJEXTRA'),
    validDetails.replace('TeamIdentifier=ABCDEFGHIJ','Executable=TeamIdentifier=ABCDEFGHIJ'),
    validDetails.replace('Authority=Developer ID Application:','Executable=Authority=Developer ID Application:'),
    validDetails.replace('Authority=Developer ID Application:','Authority=Developer ID Application Forgery:')
  ]) {
    const result=check(details);
    assert.equal(result.status,3);
    assert.match(result.stderr,/expected Developer ID Application team/);
  }
});

test('release gate accepts valid flags but retains manual approval and rejects tool failures',()=>{
  const valid=check();
  assert.equal(valid.status,0,valid.stderr);
  assert.match(valid.stdout,/Manual security and real-device release approval STILL required/);
  assert.equal(check(validDetails,{signature:1}).status,3);
  assert.equal(check(validDetails,{assessment:1}).status,4);
  assert.equal(check(validDetails.replace('0x10000(runtime)','0x10001(host,runtime)')).status,0);
});
