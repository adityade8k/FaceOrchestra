import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { FaceOrchestraApp } from '../../src/app/FaceOrchestraApp.js';
import { PresentationCapture } from '../../src/capture/PresentationCapture.js';
import { CaptureRecorder } from '../../src/capture/CaptureRecorder.js';

test('capture runs once after runtime updates on normal and spawn-preview early exits',()=>{
  for(const preview of [false,true]) {
    const order=[],frame={xr:true};let callback;
    const runtime=new Proxy({tutorial:null,pendingSpawnPlacement:preview,interactionCoordinator:{flushInputs(){}},honkContactSystem:{update(){}},stickCollisionSystem:{update(){}},getUserCamera:()=>({getWorldPosition(){}}),capture:{sample(now,xr){order.push('capture');assert.equal(now,123);assert.equal(xr,frame);}},updateLooperPlaybackDuringPendingSpawn(){order.push('preview-playback');},updateHorn(){order.push('honk');}}, {get:(object,key)=>key in object?object[key]:()=>{}});
    const sceneRuntime={start(){},renderer:{setAnimationLoop(fn){callback=fn;}},render(){order.push('render');}};
    const app=new FaceOrchestraApp({runtime,sceneRuntime});app.start();callback(123,frame);
    assert.deepEqual(order,preview?['preview-playback','capture','render']:['honk','capture','render']);
  }
});
test('presentation cache captures world roots, local child animation, morphs and equipped parent transforms',()=>{
  const scene=new THREE.Scene(),controller=new THREE.Group();controller.position.set(2,1,0);scene.add(controller);
  const root=new THREE.Group(),child=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial());controller.add(root);root.position.set(.1,.2,0);root.scale.setScalar(1.2);child.position.y=.3;child.morphTargetInfluences=[.7];root.add(child);
  const entity={id:'stick',kind:'stick',root,equipped:true},registry=new Map([['stick',entity]]),events=[];
  const capture=new PresentationCapture({scene,instrumentRegistry:registry,controllers:[]},(kind,data,t)=>events.push({kind,data,t}));
  const first=capture.sample(0),floats=new Float32Array(first.buffer),rootNode=first.nodes[0],childNode=first.nodes[1];
  assert.ok(Math.abs(floats[rootNode.offset]-2.1)<1e-6);assert.ok(Math.abs(floats[childNode.offset+1]-.3)<1e-6);assert.ok(Math.abs(floats[childNode.offset+11]-.7)<1e-6);
  capture.recycle(first.buffer);const second=capture.sample(.1);assert.equal(second.buffer,first.buffer);assert.equal(events.filter(e=>e.kind==='node').length,2);
  controller.visible=false;const lost=capture.sample(.15);assert.equal(new Float32Array(lost.buffer)[lost.nodes[0].offset+10],0);controller.visible=true;
  root.remove(child);capture.sample(.2);assert.equal(capture.bindings.length,1);registry.clear();capture.sample(.3);assert.equal(capture.bindings.length,0);assert.equal(events.at(-1).kind,'delete');
});
test('native XR recording distinguishes grip/ray, actual handedness and loss; reset terminates the segment',()=>{
  const oldDocument=globalThis.document;globalThis.document={addEventListener(){},removeEventListener(){}};
  try {
    const scene=new THREE.Scene(),reference=new EventTarget(),source={handedness:'right',profiles:['actual-profile'],gripSpace:{name:'grip'},targetRaySpace:{name:'ray'},gamepad:{buttons:[{value:.5,pressed:false,touched:true}],axes:[.2,-.3]}};
    const runtime={scene,instrumentRegistry:new Map(),controllers:[],audioSystem:{},renderer:{xr:{getReferenceSpace:()=>reference}}};
    const recorder=new CaptureRecorder(runtime),messages=[];recorder.worker={postMessage:m=>messages.push(m)};recorder.active=true;recorder.state='recording';recorder.origin=100;recorder.last=-Infinity;recorder.gaps=[];recorder.metrics={frames:0,totalMs:0,maxMs:0};recorder.presentation=new PresentationCapture(runtime,()=>{});
    const pose=x=>({transform:{position:{x,y:1,z:0},orientation:{x:0,y:0,z:0,w:1}}});
    const frame={session:{inputSources:[source]},getViewerPose:()=>pose(0),getPose:space=>space.name==='grip'?pose(1):pose(4)};
    recorder.sample(200,frame);recorder.sample(200,frame);assert.equal(messages.length,1);const c=messages[0].xr.controllers[0];assert.equal(c.handedness,'right');assert.equal(c.grip.p[0],1);assert.equal(c.ray.p[0],4);
    frame.getPose=()=>null;recorder.sample(220,frame);assert.equal(messages[1].xr.controllers[0].grip,null);
    let reason;recorder.stop=value=>{reason=value;recorder.active=false;};recorder.onSession(new EventTarget());reference.dispatchEvent(new Event('reset'));assert.equal(reason,'reference-space-reset');
  }finally{globalThis.document=oldDocument;}
});
