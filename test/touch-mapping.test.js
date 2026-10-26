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
  assert.equal(normalizedVideoPoint(v,1,450),null);
  const p=normalizedVideoPoint(v,800,450);
  assert.deepEqual(p,{x:.5,y:.5});
  assert.equal(normalizedVideoPoint(v,1599,450),null);
});
test('Mac 16:10 display stays correctly mapped in portrait and landscape iPhone viewports', () => {
  const portrait = video(2560, 1600, { left:0, top:0, width:390, height:844 });
  assert.deepEqual(normalizedVideoPoint(portrait, 195, 422), { x:.5, y:.5 });
  assert.equal(normalizedVideoPoint(portrait, 195, 100), null, 'portrait black space is not clickable');
  const landscape = video(2560, 1600, { left:0, top:0, width:844, height:390 });
  assert.deepEqual(normalizedVideoPoint(landscape, 422, 195), { x:.5, y:.5 });
  assert.equal(normalizedVideoPoint(landscape, 0, 195), null, 'landscape side bars are not clickable');
});
test('rejects invalid or not-yet-initialized video geometry', () => {
  assert.equal(normalizedVideoPoint(video(0,0,{left:0,top:0,width:100,height:100}),25,25),null);
  assert.equal(normalizedVideoPoint(video(100,100,{left:0,top:0,width:0,height:100}),25,25),null);
});
