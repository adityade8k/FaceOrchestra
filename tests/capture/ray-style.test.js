import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { DEFAULT_RAY_STYLE, normalizeRayStyle } from '../../src/capture/rayStyle.js';
import { ReplayScene } from '../../src/capture/ReplayScene.js';

test('old projects retain ray defaults, explicit zero survives, and malformed styles stay bounded',()=>{
  assert.deepEqual(normalizeRayStyle(),DEFAULT_RAY_STYLE);assert.deepEqual(normalizeRayStyle(null),DEFAULT_RAY_STYLE);
  assert.deepEqual(normalizeRayStyle({leftColor:'#AB12EF',rightColor:'invalid',opacity:0,length:0}),{leftColor:'#ab12ef',rightColor:DEFAULT_RAY_STYLE.rightColor,opacity:0,length:0});
  assert.deepEqual(normalizeRayStyle({opacity:Infinity,length:NaN}),DEFAULT_RAY_STYLE);
  assert.deepEqual(normalizeRayStyle({leftColor:['#123456'],rightColor:{}}),DEFAULT_RAY_STYLE);
  const saved=normalizeRayStyle({leftColor:'#123456',rightColor:'#fedcba',opacity:.32,length:2.75});
  assert.deepEqual(normalizeRayStyle(JSON.parse(JSON.stringify(saved))),saved);
  assert.equal(normalizeRayStyle({opacity:3,length:20}).opacity,1);assert.equal(normalizeRayStyle({length:20}).length,10);
  assert.equal(normalizeRayStyle({opacity:-1,length:-3}).length,0);
});

test('styled rays stay anchored to target-ray poses, preserve thickness and leave grip guides unchanged',()=>{
  const replay=new ReplayScene({}),pose={p:[1,2,3],q:[0,Math.SQRT1_2,0,Math.SQRT1_2]};
  const frame={nodes:{},xr:{viewer:null,controllers:['left','right'].map(handedness=>({handedness,grip:pose,ray:pose}))}};
  const sphereColor=replay.proxies.get('left').material.color.getHexString();
  replay.setRayStyle({leftColor:'#ff00ff',rightColor:'#00ffff',opacity:.37,length:2.25});replay.apply(frame);
  for(const [hand,ray] of replay.controllerRays){
    assert.equal(ray.material.color.getHexString(),hand==='left'?'ff00ff':'00ffff');assert.equal(ray.material.opacity,.37);
    assert.equal(ray.scale.x,1);assert.equal(ray.scale.y,1);
    const origin=ray.localToWorld(new Vector3(0,0,0)),end=ray.localToWorld(new Vector3(0,0,-1.5));
    assert.ok(origin.distanceTo(new Vector3(...pose.p))<1e-9);assert.ok(Math.abs(origin.distanceTo(end)-2.25)<1e-9);
    assert.ok(end.distanceTo(new Vector3(-1.25,2,3))<1e-9);
  }
  assert.equal(replay.proxies.get('left').material.color.getHexString(),sphereColor);
  for(const zero of [{opacity:0},{length:0}]){replay.setRayStyle(zero);replay.apply(frame);assert.ok([...replay.controllerRays.values()].every(ray=>!ray.visible));}
  replay.setRayStyle();replay.apply(frame);assert.ok([...replay.controllerRays.values()].every(ray=>ray.visible));
  replay.layers.controllerRays=false;replay.apply(frame);assert.ok([...replay.controllerRays.values()].every(ray=>!ray.visible));
  replay.dispose();
});
