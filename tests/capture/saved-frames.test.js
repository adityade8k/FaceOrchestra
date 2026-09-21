import test from 'node:test';
import assert from 'node:assert/strict';
import { projectPoint } from '../../src/capture/calibration.js';
import { defaultCamera } from '../../src/capture/alignment.js';
import { cameraMatchError, fitSavedFrames, normalizeFrameMatches, savedFrameObservations } from '../../src/capture/savedFrames.js';

const truth={position:[.3,1.6,3.7],rotation:[-4,8,2],fov:51,center:[0,0]};
const points=Array.from({length:12},(_,i)=>{
  const world=[-.6+(i%3)*.6,.6+(Math.floor(i/3)%3)*.65,-.5+Math.floor(i/6)*.85+(i%2)*.14];
  return {world,pixel:projectPoint(world,truth)};
});

test('each matched pose improves an early estimate; four varied poses recover a common fixed camera',()=>{
  let camera=defaultCamera();
  for(let count=2;count<=12;count+=2){
    const subset=points.slice(0,count),before=cameraMatchError(subset,camera),result=fitSavedFrames(subset,camera);
    assert.ok(result.applied);assert.ok(result.rms<=before);
    assert.equal(result.status,count<8?'provisional':'refined');camera=result.camera;
  }
  assert.ok(cameraMatchError(points,camera)<.001);assert.ok(Math.abs(camera.fov-truth.fov)<.001);
  // Check an unseen pose, not just the measurements used by the fit.
  const withheld=[.2,1.9,.3],actual=projectPoint(withheld,camera),expected=projectPoint(withheld,truth);
  assert.ok(Math.hypot(...actual.map((v,i)=>v-expected[i]))<.001);
});
test('too few and planar matches stay provisional; contradictory matches do not replace the camera',()=>{
  assert.equal(fitSavedFrames([],truth).applied,false);
  assert.equal(fitSavedFrames(points.slice(0,1),truth).status,'collecting');
  const planar=points.map(p=>{const world=[...p.world.slice(0,2),0];return {world,pixel:projectPoint(world,truth)};});
  assert.equal(fitSavedFrames(planar,defaultCamera()).status,'provisional');
  const bad=points.map((p,i)=>({...p,pixel:[i%2?900:100,i%3?200:1700]}));
  const rejected=fitSavedFrames(bad,truth);assert.equal(rejected.status,'rejected');assert.equal(rejected.applied,false);assert.deepEqual(rejected.camera,truth);
});
test('frame matches survive JSON, deduplicate hand/frame edits and migrate timestamp-only projects',()=>{
  assert.deepEqual(normalizeFrameMatches(undefined,[1]),[]);
  const first={videoTime:1,sampleTime:.99,points:[{hand:'left',pixel:[50,90]},{hand:'right',pixel:[700,800]}]};
  const last={...first,points:[{hand:'left',pixel:[60,100]},{hand:'left',pixel:[70,110]},{hand:'right',pixel:[Infinity,3]}]};
  const normalized=normalizeFrameMatches([first,{...first,videoTime:2},last],[1]);
  assert.deepEqual(normalized,[{videoTime:1,sampleTime:.99,points:[{hand:'left',pixel:[70,110]}]}]);
  assert.deepEqual(normalizeFrameMatches(JSON.parse(JSON.stringify(normalized)),[1]),normalized);
});
test('timing changes re-sample real grip poses; gaps, tracking loss and out-of-range frames cannot supply matches',()=>{
  const timeline={frames:[{t:0}],duration:10,seek:t=>({segment:t===6?1:0,gap:t===5,xr:{controllers:[{handedness:'left',grip:t===4?null:{p:[t,1,0]}}]}})};
  const frames=[{videoTime:3,sampleTime:2.99,points:[{hand:'left',pixel:[500,800]}]}];
  assert.deepEqual(savedFrameObservations(frames,timeline,{a:1,b:0},0)[0].world,[2.99,1,0]);
  assert.deepEqual(savedFrameObservations(frames,timeline,{a:1,b:1},0)[0].world,[3.99,1,0]);
  for(const time of [-1,4,5,6,11])assert.deepEqual(savedFrameObservations([{...frames[0],sampleTime:time}],timeline,{a:1,b:0},0),[]);
});
