import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {HonkPresentationRuntimeMethods} from '../../src/app/runtime/HonkPresentationRuntime.js';
import {honkPitchColor,updateHonkPitchColor} from '../../src/scene/honkPitchColor.js';

test('low octaves sweep cool hues, all of octave four stays neutral, and five through seven get hotter',()=>{
  const hue=midi=>honkPitchColor(midi).getHSL({}).h*360;
  assert.ok(hue(36)>200&&hue(36)<250);
  assert.ok(hue(48)>160&&hue(48)<200);
  for(let midi=60;midi<72;midi++)assert.equal(honkPitchColor(midi).getHex(),0xffffff);
  assert.ok(Math.abs(hue(72)-60)<1e-8);
  assert.ok(Math.abs(hue(84)-30)<1e-8);
  assert.ok(Math.abs(hue(96))<1e-8);
});

test('pitch tint preserves authored texture details and isolates each Honk material',()=>{
  const map=new THREE.Texture(),normalMap=new THREE.Texture();
  const shared=new THREE.MeshStandardMaterial({map,normalMap,roughness:.37,color:0xdddddd});
  const root=new THREE.Group(),body=new THREE.Mesh(new THREE.BoxGeometry(),shared);
  root.add(body);body.userData.usesVisibleMeshForGrip=true;body.userData.isHitTarget=true;
  const other=new THREE.Mesh(new THREE.BoxGeometry(),shared);
  const label=new THREE.Mesh(new THREE.BoxGeometry(),shared);label.userData.isNoteLabel=true;root.add(label);
  const state={earLeft:0,earRight:-.5};
  const honk={kind:'honk',root,getResolvedPerformanceState:()=>state};
  updateHonkPitchColor(honk);
  assert.notEqual(body.material,shared);assert.equal(other.material.color.getHex(),0xdddddd);
  assert.equal(label.material,shared);assert.equal(body.material.map,map);assert.equal(body.material.normalMap,normalMap);
  assert.equal(body.material.roughness,.37);assert.notEqual(body.material.color.getHex(),0xffffff);
  const owned=body.material;state.earRight=0;updateHonkPitchColor(honk);
  assert.equal(body.material,owned);assert.equal(body.material.color.getHex(),0xdddddd);
  const blueMap=new THREE.Texture();body.material.map=blueMap;
  state.earRight=.5;updateHonkPitchColor(honk);
  assert.equal(body.material.map,blueMap,'Retuning preserves the selected locked texture');
});


test('runtime layers octave hue over the blue lock texture through retuning and repeated unlocks',()=>{
  const baseMap=new THREE.Texture(),lockedBaseMap=new THREE.Texture(),normalMap=new THREE.Texture();
  const shared=new THREE.MeshStandardMaterial({map:baseMap,normalMap,color:0xdddddd});
  const root=new THREE.Group(),body=new THREE.Mesh(new THREE.BoxGeometry(),shared);root.add(body);
  const state={earLeft:0,earRight:-.5};
  const honk={kind:'honk',root,getResolvedPerformanceState:()=>state};
  const runtime={...HonkPresentationRuntimeMethods,instrumentMaterialTextures:{baseMap,lockedBaseMap}};
  for(const earRight of [-.5,0,.5,1]) {
    state.earRight=earRight;
    const expected=shared.color.clone().multiply(honkPitchColor(65+24*earRight));
    for(const locked of [false,true,false,true]) {
      honk.locked=locked;runtime.updateLockVisual(honk);runtime.updateNoteLabel(honk);
      assert.equal(body.material.map,locked?lockedBaseMap:baseMap);
      assert.ok(body.material.color.equals(expected),'Hue and authored color survive the texture swap');
      assert.equal(body.material.normalMap,normalMap);
      assert.equal(shared.map,baseMap,'Template material is untouched');
      assert.equal(shared.color.getHex(),0xdddddd);
    }
  }
});
