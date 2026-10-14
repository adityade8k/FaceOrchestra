import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { HonkColliderFactory } from '../../src/instruments/honk/HonkColliderFactory.js';
import { HonkInstrument } from '../../src/instruments/honk/HonkInstrument.js';
import { InteractionTargetRegistry } from '../../src/instruments/core/InteractionTargetRegistry.js';
import { InstrumentRegistry } from '../../src/instruments/core/InstrumentRegistry.js';
import { RaycastSystem } from '../../src/xr/RaycastSystem.js';
import { isHonkSqueezeTarget } from '../../src/instruments/honk/HonkInteractionProfile.js';

function setup() {
  const scene = new THREE.Scene(), root = new THREE.Group(); scene.add(root);
  for(const x of [-.6,.6]){
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(.3,1.4,.2),new THREE.MeshBasicMaterial());
    mesh.position.x=x;root.add(mesh);
  }
  const {targets}=new HonkColliderFactory({THREE}).create(root);
  const h=new HonkInstrument({root,targets,interactionTargetRegistry:new InteractionTargetRegistry(),
    morphController:{applyPerformanceState(){}}});
  const registry=new InstrumentRegistry();registry.add(h,{initialize:false});
  const raycaster=new THREE.Raycaster();raycaster.far=3;
  const system=new RaycastSystem({raycaster,getInstruments:()=>[h],getTargets:()=>Object.values(targets),
    resolveOwner:o=>registry.getFromObject3D(o)});
  const controller=new THREE.Group();scene.add(controller);
  const aim=(x,y,z=1)=>{root.updateWorldMatrix(true,true);controller.position.set(x,y,z).applyMatrix4(root.matrixWorld);
    root.getWorldQuaternion(controller.quaternion);controller.updateWorldMatrix(true,false);};
  return {h,root,controller,system,raycaster,aim};
}

test('locked Honk plays a gap inside the model bounding box without hitting its mesh or squeeze sphere',()=>{
  const f=setup();f.aim(0,.55);
  assert.notEqual(f.system.getCurrentHit(f.controller)?.object,f.h.squeezeCollider);
  f.h.locked=true;
  const hit=f.system.getCurrentHit(f.controller);
  assert.equal(hit.object,f.h.squeezeCollider);
  assert.equal(isHonkSqueezeTarget(f.h,hit.object),true);
  assert.ok(Math.abs(hit.distance-.9)<1e-7);
  f.aim(.9,.55);assert.equal(f.system.getHonkSqueezeHit(f.controller,f.h),null);
  f.h.locked=false;f.aim(0,.55);
  assert.notEqual(f.system.getCurrentHit(f.controller)?.object,f.h.squeezeCollider);
});

test('bounding hit follows same-frame rotation, scale and movement and respects visibility and range',()=>{
  const f=setup();f.h.locked=true;
  f.root.position.set(2,1,-3);f.root.rotation.set(.2,.7,.1);f.root.scale.setScalar(.5);
  f.aim(0,.55);
  assert.equal(f.system.getCurrentHit(f.controller)?.object,f.h.squeezeCollider);
  f.raycaster.far=.2;assert.equal(f.system.getHonkSqueezeHit(f.controller,f.h),null);
  f.raycaster.far=3;f.root.position.x+=10;
  assert.equal(f.system.getHonkSqueezeHit(f.controller,f.h),null);
  f.aim(0,.55);assert.ok(f.system.getHonkSqueezeHit(f.controller,f.h));
  f.root.visible=false;assert.equal(f.system.getCurrentHit(f.controller),null);
});
