import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateRelativeFolder, listSafeMetadata } from '../src/files-policy.js';

test('read-only Files Mode rejects absolute, traversal, hidden and invalid paths', () => {
  assert.deepEqual(validateRelativeFolder('.'), []);
  assert.deepEqual(validateRelativeFolder('Music/Projects'), ['Music','Projects']);
  for(const value of [null, '', undefined]) {
    if(value === '') assert.deepEqual(validateRelativeFolder(value), []);
    else assert.throws(()=>validateRelativeFolder(value),/Invalid folder/);
  }
  for(const value of ['../', 'Music/../Private','/etc','./Documents','a//b','~/.ssh',
    '.ssh','a/.private','a\\b','a\0b','a/'.repeat(20),'a/\nb']) {
    assert.throws(()=>validateRelativeFolder(value),/Invalid folder/);
  }
});
test('lists ONLY metadata under an owner-selected root, skipping symlinks', t => {
  const base = mkdtempSync(join(tmpdir(),'floatdesk-root-'));
  const outer = mkdtempSync(join(tmpdir(),'floatdesk-private-'));
  t.after(()=>{rmSync(base,{recursive:true,force:true});rmSync(outer,{recursive:true,force:true})});
  mkdirSync(join(base,'Music'));
  mkdirSync(join(base,'Music','Projects'));
  writeFileSync(join(base,'Music','track.txt'),'secret contents');
  writeFileSync(join(base,'.secret'),'hidden contents');
  writeFileSync(join(outer,'token.txt'),'do not expose');
  symlinkSync(outer,join(base,'leak'));
  symlinkSync(join(base,'Music'),join(base,'internalLink'));
  const listing = listSafeMetadata(base);
  assert.deepEqual(listing.entries,[{name:'Music',kind:'folder'}]);
  assert.equal(JSON.stringify(listing).includes('secret contents'),false);
  assert.equal(JSON.stringify(listing).includes(outer),false);
  const sub = listSafeMetadata(base,'Music');
  assert.deepEqual(sub.entries,[{name:'Projects',kind:'folder'},{name:'track.txt',kind:'file'}]);
  assert.throws(()=>listSafeMetadata(base,'leak'),/Symlink/);
  assert.throws(()=>listSafeMetadata(base,'internalLink'),/Symlink/);
  assert.throws(()=>listSafeMetadata(base,'../'),/Invalid folder/);
  assert.throws(()=>listSafeMetadata(base,'Music/track.txt'),/Not a folder/);
});
test('metadata listing limits output and does not include hidden entries', t => {
  const root=mkdtempSync(join(tmpdir(),'floatdesk-bounded-'));
  t.after(()=>rmSync(root,{recursive:true,force:true}));
  for(let i=0;i<130;i++) writeFileSync(join(root,'f'+String(i).padStart(3,'0')),'x');
  const listing=listSafeMetadata(root);
  assert.equal(listing.entries.length,100);
  assert.equal(listing.truncated,true);
});
