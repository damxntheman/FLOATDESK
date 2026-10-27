import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AppAccessGrant } from '../src/app-access.js';
import { discoverMacApps, publicCatalog, launchCatalogApp } from '../src/mac-apps.js';

test('app access is denied by default, expires and rate-limits launch', () => {
  let now = 1000;
  const grant = new AppAccessGrant(() => now, {
    requestMs: 100, grantMs: 500, actionIntervalMs: 120
  });
  assert.throws(() => grant.check(), /not approved/);
  grant.request();
  assert.throws(() => grant.check(), /not approved/);
  now += 101;
  assert.equal(grant.expired(), true);
  assert.throws(() => grant.approve(), /expired/);
  grant.request();
  grant.approve();
  grant.useAction();
  assert.throws(() => grant.useAction(), /wait/);
  now += 120;
  grant.useAction();
  now += 500;
  assert.equal(grant.expired(), true);
  assert.throws(() => grant.check(), /expired/);
  grant.revoke();
  assert.equal(grant.phase, 'off');
});

test('discover only top-level .app directories and reveal names without paths', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'floatdesk-apps-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'Finder.app'));
  mkdirSync(join(root, 'ABC.app'));
  mkdirSync(join(root, 'hidden'));
  mkdirSync(join(root, 'Nested'));
  mkdirSync(join(root, 'Nested', 'Secret.app'));
  mkdirSync(join(root, '.dot.app'));
  symlinkSync(join(root, 'Finder.app'), join(root, 'Alias.app'));
  const apps = discoverMacApps({ platform:'darwin', roots:[root,join(root,'missing')], includeFinder:false });
  assert.deepEqual(apps.map(x => x.name), ['ABC','Finder']);
  assert.equal(publicCatalog(apps).every(x => Object.keys(x).sort().join(',') === 'experience,id,name'), true);
  assert.equal(apps.length, 2);
  assert.equal(discoverMacApps({ platform:'linux', roots:[root] }).length, 0);
});

test('launch only catalog IDs using /usr/bin/open with no shell arguments', async () => {
  const apps = [{ id:'a'.repeat(24), name:'Finder', path:'/System/Applications/Finder.app' }];
  const calls = [];
  const executor = async (...args) => { calls.push(args); };
  assert.deepEqual(await launchCatalogApp(apps[0].id, { platform:'darwin',apps,executor }), {
    id: apps[0].id, name:'Finder'
  });
  assert.deepEqual(calls, [[
    '/usr/bin/open', ['-a','/System/Applications/Finder.app'],
    { timeout:8000, windowsHide:true }
  ]]);
  await assert.rejects(
    launchCatalogApp('../../bin/sh', {platform:'darwin',apps,executor}), /Invalid app identifier/
  );
  await assert.rejects(
    launchCatalogApp('b'.repeat(24), {platform:'darwin',apps,executor}), /no longer available/
  );
  await assert.rejects(
    launchCatalogApp('a'.repeat(24), {platform:'linux',apps,executor}), /Mac host/
  );
  assert.equal(calls.length, 1);
});
