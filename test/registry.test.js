import test from 'node:test';
import assert from 'node:assert/strict';
import { SessionRegistry, generateCode } from '../src/registry.js';

test('pairing codes use eight characters from the expected alphabet', () => {
  for (let n = 0; n < 100; n++) assert.match(generateCode(), /^[A-HJ-NP-Z2-9]{8}$/);
});

test('create, join, detach and resume require a strong token', () => {
  const registry = new SessionRegistry();
  const host = {}, viewer = {}, replacement = {};
  const created = registry.create(host);
  assert.equal(created.code.length, 8);
  const joined = registry.join(viewer, created.code.toLowerCase());
  assert.equal(registry.peer(host), viewer);
  registry.detach(viewer);
  assert.equal(registry.peer(host), null);
  assert.throws(() => registry.resume(replacement, created.code, 'viewer', 'bad-token'), /authentication failed/);
  registry.resume(replacement, created.code, 'viewer', joined.token);
  assert.equal(registry.peer(host), replacement);
  assert.equal(registry.forClient(replacement).role, 'viewer');
});

test('pairing code expires before session token', () => {
  let now = 0;
  const registry = new SessionRegistry(() => now);
  const host = {}, viewer = {};
  const created = registry.create(host);
  now = 10 * 60 * 1000;
  assert.throws(() => registry.join(viewer, created.code), /expired/);
  registry.resume({}, created.code, 'host', created.token);
});

test('one viewer per session and host-only shutdown', () => {
  const registry = new SessionRegistry();
  const host = {}, viewer = {};
  const created = registry.create(host);
  registry.join(viewer, created.code);
  assert.throws(() => registry.join({}, created.code), /already paired/);
  assert.throws(() => registry.stop(viewer), /Only the host/);
  registry.stop(host);
  assert.equal(registry.forClient(viewer), null);
  assert.throws(() => registry.resume({}, created.code, 'host', created.token), /unavailable/);
});

test('session expires and is removed', () => {
  let now = 100;
  const registry = new SessionRegistry(() => now);
  const host = {};
  registry.create(host);
  now += 60 * 60 * 1000;
  registry.prune();
  assert.equal(registry.rooms.size, 0);
  assert.equal(registry.forClient(host), null);
});

test('old sockets cannot disconnect a resumed session', () => {
  const registry = new SessionRegistry();
  const host = {}, newHost = {};
  const created = registry.create(host);
  registry.resume(newHost, created.code, 'host', created.token);
  registry.detach(host);
  assert.equal(registry.forClient(newHost).role, 'host');
});
