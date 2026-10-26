import test from 'node:test';
import assert from 'node:assert/strict';
import { RecoveryThrottle } from '../src/recovery.js';

test('room recovery cooldown rejects rapid duplicate renegotiation', () => {
  let time = 1000;
  const throttle = new RecoveryThrottle(5000, () => time);
  const room = {};
  assert.equal(throttle.permit(room), true);
  assert.equal(throttle.permit(room), false);
  time += 4999;
  assert.equal(throttle.permit(room), false);
  time++;
  assert.equal(throttle.permit(room), true);
});

test('recovery requests are isolated by room and reject invalid objects', () => {
  const throttle = new RecoveryThrottle();
  assert.equal(throttle.permit(null), false);
  assert.equal(throttle.permit({}), true);
  assert.equal(throttle.permit({}), true);
  assert.throws(() => new RecoveryThrottle(-5), /Invalid cooldown/);
});
