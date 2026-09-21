import test from 'node:test';
import assert from 'node:assert/strict';
import { Object3D, Euler, Vector3 } from 'three';
import { CameraHistory, cameraFromHandle, normalizeBookmarks, sameVideo, validCamera } from '../../src/capture/alignment.js';
import { cameraQuaternion, projectPoint } from '../../src/capture/calibration.js';
import { ReplayScene } from '../../src/capture/ReplayScene.js';

const precise = () => ({position:[.1234567890123456,1.456789012345678,3.789012345678901],rotation:[-13.1234567890123,368.1234567890123,2.123456789012345],fov:51.12345678901234,center:[17.12345678901234,-25.98765432109876]});

test('translation and rotation handles preserve the existing YXZ camera convention and intrinsics',() => {
  const camera=precise(),handle=new Object3D();handle.position.set(1,2,4);
  const moved=cameraFromHandle(camera,handle,'translate');
  assert.deepEqual(moved.position,[1,2,4]);assert.deepEqual(moved.rotation,camera.rotation);
  handle.quaternion.setFromEuler(new Euler(.21,-.32,.12,'YXZ'));
  const rotated=cameraFromHandle(moved,handle,'rotate');
  assert.ok(cameraQuaternion(rotated).angleTo(handle.quaternion)<1e-7);
  assert.deepEqual(rotated.position,moved.position);assert.equal(rotated.fov,camera.fov);assert.deepEqual(rotated.center,camera.center);
  assert.deepEqual(camera,precise());assert.ok(validCamera(rotated));
});

test('one undo restores a whole drag at full precision, including calibration status',() => {
  const history=new CameraHistory(),state={camera:precise(),calibration:{valid:true,fitRms:.02}};
  const original=structuredClone(state);
  history.begin(state);
  for(let i=0;i<20;i++){state.camera.position[0]+=.01;history.begin(state);}
  state.calibration=null;history.commit(state);
  assert.equal(history.entries.length,1);
  for(const [key,value] of [['rotation',[3,4,5]],['fov',62.5]]){history.begin(state);state.camera[key]=value;history.commit(state);}
  const lensUndo=history.undo(state);assert.equal(lensUndo.camera.fov,original.camera.fov);
  const rotationUndo=history.undo(lensUndo);assert.deepEqual(rotationUndo.camera.rotation,original.camera.rotation);
  assert.deepEqual(history.undo(rotationUndo),original);assert.equal(history.available(original),false);
  history.begin(original);history.commit(original);assert.equal(history.entries.length,0);
});

test('camera scaling widens the frustum uniformly without compounding a drag or changing metric pose',() => {
  const startCamera=precise(),handle=new Object3D();handle.scale.set(1.2,1,1);
  const first=cameraFromHandle(startCamera,handle,'scale',{startCamera,axis:'X'});
  handle.scale.x=1.6;
  const next=cameraFromHandle(first,handle,'scale',{startCamera,axis:'X'});
  const ratio=Math.tan(next.fov*Math.PI/360)/Math.tan(startCamera.fov*Math.PI/360);
  assert.ok(Math.abs(ratio-1.6)<1e-12);
  assert.deepEqual(next.position,startCamera.position);assert.deepEqual(next.rotation,startCamera.rotation);assert.deepEqual(next.center,startCamera.center);
  assert.deepEqual(Object.keys(next),Object.keys(startCamera));
  const before=projectPoint([.3,1.7,-.4],startCamera),after=projectPoint([.3,1.7,-.4],next);
  const center=[540+startCamera.center[0],960+startCamera.center[1]];
  for(let i=0;i<2;i++)assert.ok(Math.abs((after[i]-center[i])*1.6-(before[i]-center[i]))<1e-9);
  handle.scale.setScalar(1);
  assert.deepEqual(cameraFromHandle(next,handle,'scale',{startCamera}),startCamera,'Returning the handle restores the exact starting lens');
  handle.scale.setScalar(2);
  assert.equal(cameraFromHandle(startCamera,handle,'scale',{startCamera}).fov,cameraFromHandle(startCamera,handle,'scale',{startCamera,axis:'Y'}).fov);
  handle.scale.setScalar(-1);
  assert.equal(cameraFromHandle(startCamera,handle,'scale').fov,10,'A crossed handle cannot mirror the camera');
  handle.scale.setScalar(1e8);
  assert.equal(cameraFromHandle(startCamera,handle,'scale').fov,130);
});

test('bookmarks are validated timestamps, with legacy project defaults and precise JSON round trips',() => {
  assert.deepEqual(normalizeBookmarks(undefined),[]);
  const project={version:1,camera:precise(),bookmarks:normalizeBookmarks([1.234567890123,0,2,2,-1,Infinity,'1',{},NaN],3)};
  assert.deepEqual(project.bookmarks,[0,1.234567890123,2]);
  assert.deepEqual(JSON.parse(JSON.stringify(project)),project);
  assert.deepEqual(normalizeBookmarks(project.bookmarks,1.5),[0,1.234567890123]);
  const video={name:'phone.mp4',size:100,duration:3,width:1080,height:1920};
  assert.equal(sameVideo(video,{...video,lastModified:200}),true);
  assert.equal(sameVideo(video,{...video,size:101}),false);
  assert.equal(sameVideo(video,{...video,duration:4}),false);
  assert.equal(sameVideo(video,null),false);
});

test('replay projection matches calibration with nonzero center offsets and helpers are isolated',() => {
  const rendered=[],renderer={autoClear:true,setClearColor(){},render(scene){rendered.push(scene);}};
  const replay=new ReplayScene(renderer),camera=precise();replay.setCamera(camera,540,960);
  const point=[.3,1.7,-.4],ndc=new Vector3(...point).project(replay.camera),pixel=projectPoint(point,camera);
  assert.ok(Math.abs((ndc.x+1)*540-pixel[0])<1e-9);
  assert.ok(Math.abs((1-ndc.y)*960-pixel[1])<1e-9);
  for(const proxy of replay.proxies.values()){proxy.visible=true;assert.equal(proxy.parent,replay.guides);assert.ok(!replay.scene.children.includes(proxy));}
  for(const ray of replay.controllerRays.values()){ray.visible=true;assert.equal(ray.parent,replay.controllerRayScene);}
  replay.render({guides:false});assert.deepEqual(rendered,[replay.scene,replay.controllerRayScene]);
  rendered.length=0;replay.render();assert.deepEqual(rendered,[replay.scene,replay.controllerRayScene,replay.guides]);assert.equal(renderer.autoClear,true);
  replay.dispose();
});

test('composite spheres use grip poses and rays independently use tracked target-ray poses',() => {
  const replay=new ReplayScene({});
  const frame={nodes:{},xr:{viewer:null,controllers:[{handedness:'left',grip:{p:[1,1.2,.3],q:[0,0,0,1]},ray:{p:[1.1,1.3,.1],q:[0,Math.SQRT1_2,0,Math.SQRT1_2]}}]}};
  const original=structuredClone(frame);replay.apply(frame);
  const sphere=replay.proxies.get('left'),ray=replay.controllerRays.get('left');
  assert.equal(sphere.visible,true);assert.equal(sphere.geometry.type,'SphereGeometry');assert.equal(sphere.material.wireframe,false);
  assert.deepEqual(sphere.position.toArray(),frame.xr.controllers[0].grip.p);
  assert.equal(ray.visible,true);assert.deepEqual(ray.position.toArray(),frame.xr.controllers[0].ray.p);
  assert.ok(new Vector3(0,0,-1).applyQuaternion(ray.quaternion).distanceTo(new Vector3(-1,0,0))<1e-12);
  ray.geometry.computeBoundingBox();assert.ok(Math.abs(ray.geometry.boundingBox.min.z+1.5)<1e-6);assert.ok(Math.abs(ray.geometry.boundingBox.max.z)<1e-6);
  assert.equal(replay.proxies.get('right').visible,false);assert.equal(replay.controllerRays.get('right').visible,false);
  assert.deepEqual(frame,original,'Drawing preview guides does not change recorded data');
  replay.dispose();
});

test('controller preview toggles and tracking loss independently hide spheres and rays',() => {
  const replay=new ReplayScene({}),pose={p:[0,1,-1],q:[0,0,0,1]};
  const frame={nodes:{},xr:{viewer:null,controllers:[{handedness:'left',grip:pose,ray:pose}]}};
  replay.layers.controllers=false;replay.apply(frame);
  assert.equal(replay.proxies.get('left').visible,false);assert.equal(replay.controllerRays.get('left').visible,true);
  replay.layers.controllers=true;replay.layers.controllerRays=false;replay.apply(frame);
  assert.equal(replay.proxies.get('left').visible,true);assert.equal(replay.controllerRays.get('left').visible,false);
  replay.layers.controllerRays=true;frame.xr.controllers[0].grip=null;replay.apply(frame);
  assert.equal(replay.proxies.get('left').visible,false);assert.equal(replay.controllerRays.get('left').visible,true);
  frame.xr.controllers[0].ray=null;replay.apply(frame);assert.equal(replay.controllerRays.get('left').visible,false);
  frame.xr.controllers=[];replay.apply(frame);
  assert.ok([...replay.proxies.values(),...replay.controllerRays.values()].every(node=>!node.visible));
  replay.dispose();
});
