import test from 'node:test';
import assert from 'node:assert/strict';
import { fitCamera, projectPoint, controllerLandmark, cropRect, outputPixel } from '../../src/capture/calibration.js';
import { fitTimeMap, timeMap, exportTimes } from '../../src/capture/format.js';
const camera={position:[.3,1.6,3.7],rotation:[-4,8,2],fov:51,center:[0,0]};
const points=Array.from({length:18},(_,i)=>[-.7+(i%3)*.65,.6+(Math.floor(i/3)%3)*.7,-.5+Math.floor(i/9)*.85+(i%2)*.14]);
const observations=points.map((world,i)=>({world,pixel:projectPoint(world,camera),heldOut:i>=14}));
test('unknown focal fixed camera fit recovers portrait projection and held-out frames',()=>{
  const result=fitCamera(observations);
  assert.ok(result.valid&&result.validated);assert.ok(result.fitRms<.001);assert.ok(result.heldOutRms<.001);
  assert.ok(Math.abs(result.camera.fov-camera.fov)<.001);assert.ok(Math.hypot(...result.camera.position.map((v,i)=>v-camera.position[i]))<.001);
});
test('pose-only camera solve respects known intrinsics and reports bad points',()=>{
  const result=fitCamera(observations,{initial:{...camera,position:[0,1.5,3]},fitFocal:false});assert.equal(result.camera.fov,51);assert.ok(result.fitRms<.001);
  const bad=observations.map((o,i)=>i===0?{...o,pixel:[100,100]}:o);const failed=fitCamera(bad,{initial:camera});assert.equal(failed.valid,false);assert.ok(failed.errors[0]>100);
});
test('invalid, planar, collinear and too few calibration points fail explicitly',()=>{
  assert.throws(()=>fitCamera(observations.slice(0,3)),/at least 8/);
  assert.throws(()=>fitCamera(observations.map(o=>({...o,world:[o.world[0],o.world[1],0]}))),/Degenerate/);
  assert.throws(()=>fitCamera(observations.map(o=>({...o,world:[0,0,0]}))),/Degenerate/);
  assert.throws(()=>fitCamera([{world:[NaN,0,0],pixel:[1,1]}]),/Invalid/);
});
test('grip landmark offset rotates in grip local space; portrait crop never stretches',()=>{
  const landmark=controllerLandmark({p:[1,2,3],q:[0,Math.SQRT1_2,0,Math.SQRT1_2]},[0,0,-.1]);assert.ok(Math.abs(landmark[0]-.9)<1e-10);assert.ok(Math.abs(landmark[2]-3)<1e-10);
  assert.throws(()=>controllerLandmark(null,[0,0,0]),/valid tracked grip/);
  const crop=cropRect(1920,1080);assert.equal(crop.sh,1080);assert.equal(crop.sw/crop.sh,9/16);
  const p=projectPoint([0,0,-1],{position:[0,0,0],rotation:[0,0,0],fov:60,center:[20,-30]});assert.deepEqual(p,[560,930]);
});
test('two sync anchors and deterministic export timestamps align both ends',()=>{
  const mapping=fitTimeMap({video:2,scene:0},{video:122,scene:120.024});assert.ok(Math.abs(timeMap(122,mapping)-120.024)<1e-9);
  assert.ok(Math.abs(mapping.a-1.0002)<1e-9);assert.throws(()=>fitTimeMap({video:0,scene:0},{video:0,scene:5}),/at least/);
  const times=exportTimes({start:2,end:6,fps:60});assert.equal(times.count,240);assert.equal(times.at(239),2+239/60);
});
test('responsive letterboxing maps calibration clicks to canonical output pixels',()=>{
  const rect={left:10,top:20,width:300,height:600};assert.deepEqual(outputPixel(160,320,rect),[540,960]);
  assert.throws(()=>outputPixel(160,21,rect),/letterbox/);
});
