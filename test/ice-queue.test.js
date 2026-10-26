import test from 'node:test';
import assert from 'node:assert/strict';
import { CandidateBuffer } from '../public/ice-queue.js';

test('out-of-order ICE is buffered and consumed only for matching negotiation', () => {
  const buffer = new CandidateBuffer();
  const early = { candidate: 'candidate:before-offer' };
  assert.equal(buffer.queue('session-a', early), true);
  buffer.retain('session-a');
  assert.deepEqual(buffer.take('session-a'), [early]);
  assert.deepEqual(buffer.take('session-a'), []);
});

test('stale ICE is discarded when a newer negotiation becomes current', () => {
  const buffer = new CandidateBuffer();
  buffer.queue('old-offer', { candidate: 'stale' });
  buffer.queue('new-offer', { candidate: 'fresh' });
  buffer.retain('new-offer');
  assert.deepEqual(buffer.take('old-offer'), []);
  assert.equal(buffer.take('new-offer')[0].candidate, 'fresh');
});

test('candidate buffer is bounded against unexpected peer traffic', () => {
  const buffer = new CandidateBuffer(2, 2);
  assert.equal(buffer.queue('first', { candidate: '1' }), true);
  buffer.queue('second', { candidate: '2' });
  buffer.queue('third', { candidate: '3' });
  assert.deepEqual(buffer.take('first'), []);
  assert.equal(buffer.queue('third', { candidate: '4' }), true);
  assert.equal(buffer.queue('third', { candidate: '5' }), false);
  assert.equal(buffer.take('third').length, 2);
  assert.equal(buffer.queue('', {}), false);
});
