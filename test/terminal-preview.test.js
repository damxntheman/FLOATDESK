import test from 'node:test';
import assert from 'node:assert/strict';
import { experienceFor, publicExperience } from '../src/app-experiences.js';
import { runTerminalPreview } from '../src/terminal-preview.js';
import { TerminalPreviewGrant } from '../src/terminal-grant.js';

test('only trusted canonical macOS Terminal bundle maps to phone-native preview', () => {
  const canonical = { id: 'a'.repeat(24), name:'Terminal', path:'/System/Applications/Utilities/Terminal.app' };
  const fake = { ...canonical, path:'/Applications/Terminal.app' };
  assert.equal(experienceFor(canonical).type, 'mobile-terminal-preview');
  assert.equal(experienceFor(canonical).isFullShell, false);
  assert.equal(experienceFor(fake).type, 'desktop-launch');
  assert.equal(experienceFor({name:'Finder',path:'/System/Library/CoreServices/Finder.app'}).type, 'mobile-files');
  assert.equal(experienceFor({name:'Finder',path:'/Applications/Finder.app'}).type, 'desktop-launch');
  assert.equal(experienceFor({name:'Finder',path:'/System/Library/CoreServices/Finder.app'}).type, 'desktop-launch');
  assert.deepEqual(publicExperience(canonical), {
    id:canonical.id,name:'Terminal',experience:'mobile-terminal-preview'
  });
  assert.equal(JSON.stringify(publicExperience(canonical)).includes('/System/Applications'),false);
});
test('Mac diagnostics commands are read-only and allowlisted; no shell or paths', () => {
  const env = {platform:'darwin', now:()=>new Date('2026-10-27T00:00:00Z'),
    uptime:()=>90060, arch:()=>'arm64', release:()=>'25.0'};
  assert.match(runTerminalPreview('help',env)[0],/read-only/);
  assert.deepEqual(runTerminalPreview('date',env),['2026-10-27T00:00:00.000Z']);
  assert.deepEqual(runTerminalPreview('uptime',env),['Mac uptime: 1d 1h 1m']);
  assert.deepEqual(runTerminalPreview('system',env),['macOS / Darwin · arm64 · kernel 25.0']);
  for(const command of ['ls','pwd','whoami','cd','rm','cat','open','bash','zsh','git','sudo','echo','help;ls','help && ls','../bin/sh','help\nls','']) {
    assert.throws(()=>runTerminalPreview(command,env),/Unsupported command/);
  }
  assert.throws(()=>runTerminalPreview('help',{...env,platform:'linux'}),/only from a Mac/);
});
test('terminal diagnostics authorization is separately expiring and rate limited', () => {
  let now=1000;
  const g=new TerminalPreviewGrant(()=>now);
  assert.throws(()=>g.check(),/not approved/);
  g.request();
  assert.throws(()=>g.useAction(),/not approved/);
  g.approve();
  g.useAction();
  assert.throws(()=>g.useAction(),/wait/);
  now+=301;
  g.useAction();
  now+=180000;
  assert.equal(g.expired(),true);
  assert.throws(()=>g.check(),/expired/);
  g.revoke();
  assert.equal(g.phase,'off');
});
