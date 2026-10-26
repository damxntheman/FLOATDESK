import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizedVideoPoint } from '../public/touch-mapping.js';

const video = (w, h, rect) => ({ videoWidth:w,videoHeight:h,getBoundingClientRect:()=>rect });
test('normalizes taps on a full-size desktop video', () => {
  const v=video(1920,1080,{left:100,top:200,width:400,height:225});
  assert.deepEqual(normalizedVideoPoint(v,300,312.5),{x:.5,y:.5});
  assert.equal(normalizedVideoPoint(v,99,312),null);
});
test('rejects letterbox taps and maps actual picture bounds', () => {
  const v=video(1600,1000,{left:0,top:0,width:1600,height:900});
  assert.equal(normalizedVideoPoint(v,100,1),null);
  const p=normalizedVideoPoint(v,800,450);
  assert.deepEqual(p,{x:.5,y:.5});
  assert.equal(normalizedVideoPoint(v,800,899),null);
});
test('rejects invalid or not-yet-initialized video geometry', () => {
  assert.equal(normalizedVideoPoint(video(0,0,{left:0,top:0,width:100,height:100}),25,25),null);
  assert.equal(normalizedVideoPoint(video(100,100,{left:0,top:0,width:0,height:100}),25,25),null);
});
