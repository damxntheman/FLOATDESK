import test from 'node:test';
import assert from 'node:assert/strict';
import { ControlGrant } from '../src/control.js';

test('control requires a fresh request, owner approval and agent readiness', () => {
  let now = 1000;
  const grant = new ControlGrant(() => now);
  assert.throws(() => grant.click(.5, .5), /not authorized/);
  assert.throws(() => grant.approve(), /expired/);
  grant.request();
  assert.throws(() => grant.request(), /already pending/);
  grant.approve();
  assert.throws(() => grant.click(.5, .5), /not authorized/);
  grant.activate();
  assert.deepEqual(grant.click(.5, .5), { type: 'click', x: .5, y: .5 });
  assert.throws(() => grant.click(.5, .5), /rate limit/);
  now += 120;
  assert.deepEqual(grant.click(0, 1), { type: 'click', x: 0, y: 1 });
  for (const p of [[-1, 0], [0, 2], [NaN, .3], ['.5', .5], [Infinity, .5]]) {
    now += 120;
    assert.throws(() => grant.click(...p), /Invalid normalized/);
  }
  now += 120000;
  assert.equal(grant.expired(), true);
  assert.throws(() => grant.click(.5, .5), /not authorized/);
  grant.revoke();
  assert.equal(grant.phase, 'off');
});

test('expired request cannot be approved, and revoked grant cannot be used', () => {
  let now = 0;
  const grant = new ControlGrant(() => now);
  grant.request();
  now = 30001;
  assert.equal(grant.expired(), true);
  assert.throws(() => grant.approve(), /expired/);
  assert.equal(grant.phase, 'off');
  grant.request();
  grant.approve();
  grant.activate();
  grant.revoke();
  assert.throws(() => grant.click(.2, .8), /not authorized/);
});
