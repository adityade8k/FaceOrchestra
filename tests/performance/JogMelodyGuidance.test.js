import { cueCanvas } from "../helpers/cueCanvas.js";
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { JogMelodyGuidance } from '../../src/performance/JogMelodyGuidance.js';
import { TutorialTimingCues } from '../../src/tutorial/TutorialTimingCues.js';
import { COMPOSITION as C, performanceEvents } from '../../src/tutorial/composition.js';
import { scoreForStep } from '../../src/tutorial/scoring.js';
import { PresentationCapture } from '../../src/capture/PresentationCapture.js';

const anchor=12345,at=beat=>anchor+beat*C.beatMs;
test('recording guidance follows the complete canonical score on the supplied performance anchor',()=>{
  const guide=new JogMelodyGuidance(anchor);
  assert.equal(guide.beatAt(at(-4)),-4);
  assert.match(guide.model(at(-4)).transport,/4 · Prepare\nFirst: S = C4/);
  assert.deepEqual(scoreForStep(guide.step),performanceEvents().filter(e=>e.pitch));
  for(const event of performanceEvents()) {
    const model=guide.model(at(event.beat+.1));
    assert.ok(model.transport.includes(`${event.phrase} (${event.phraseIndex+1}/6)`));
    assert.ok(model.transport.includes(event.pitch||'Rest'));
  }
  assert.equal(guide.complete(at(95.99)),false);
  assert.equal(guide.complete(at(96)),true);
  assert.match(guide.model(at(96)).feedback,/Continue playing freely/);
});

test('timing and bend guidance is excluded from clean capture and included only with explicit UI capture',()=>{
  for(const includeUI of [false,true]) {
    const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(),root=new THREE.Group(),panel=new THREE.Group();
    root.add(new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial()));
    scene.add(root,panel);
    const honk={id:'melody',kind:'honk',root},events=[];
    const runtime={scene,getUserCamera:()=>camera,controllers:[],controllerStates:new Map(),instrumentRegistry:new Map([[honk.id,honk]])};
    const adapter={r:runtime,get:()=>honk,gestures:new Map()};
    const cues=new TutorialTimingCues(adapter, { createCanvas: cueCanvas });
    runtime.tutorial={adapter,cues,panel:{group:panel}};
    const capture=new PresentationCapture(runtime,(kind,data)=>events.push({kind,data}),{includeUI});
    try {
      for(const beat of [-.5,0,12.5,13.5]) {
        cues.update(new JogMelodyGuidance(anchor),at(beat));
        const rings=cues.pool.flatMap(p=>Object.values(p));
        assert.ok(rings.some(r=>r.visible),'Guidance must remain visible to the player');
        const sample=capture.sample(beat+4);capture.recycle(sample.buffer);
        assert.ok(sample.nodes.length>=2,'Actual instrument presentation is captured');
        assert.equal(capture.ids.has(panel),includeUI);
        for(const ring of rings){assert.equal(capture.ids.has(ring),includeUI);assert.equal(capture.resources.has(ring.material),includeUI);}
        assert.equal(capture.resources.has(cues.geometry),includeUI);
      }
      assert.equal(events.some(e=>e.data.name==='Tutorial timing ring'),includeUI);
    }finally{cues.dispose();root.children[0].geometry.dispose();root.children[0].material.dispose();}
  }
});

test('current note, upcoming note, rest and held Eb-to-C glide instructions advance together',()=>{
  const guide=new JogMelodyGuidance(anchor);
  assert.match(guide.model(at(0)).transport,/S = C4 \(2 beats\)/);
  assert.match(guide.model(at(0)).feedback,/Hold Trigger.*\nNext: G = E4/);
  assert.match(guide.model(at(11.1)).feedback,/Keep Trigger held · Hold level/);
  assert.match(guide.model(at(12.5)).feedback,/Keep Trigger held · Hold · roll down toward C/);
  assert.match(guide.model(at(13.5)).feedback,/Settle on C4.*then release/);
  assert.match(guide.model(at(14)).feedback,/Next: Rest/);
  assert.match(guide.model(at(15)).feedback,/Release Trigger · rest.\nNext: S = C4/);
  assert.match(guide.model(at(16)).transport,/B \(2\/6\) · Beat 1\/16/);
});

test('the existing tutorial renderer follows moved melody targets, previews onsets, guides bends and clears rings',()=>{
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(),instruments=new Map();
  Object.keys(C.pitches).forEach((pitch,i)=>{
    const root=new THREE.Group();root.position.set(i*.32,1,-1);scene.add(root);
    instruments.set(`melody-${pitch}`,{root,getSqueezeColliderSphere:()=>({center:root.position,radius:.065})});
  });
  const cues=new TutorialTimingCues({r:{scene,getUserCamera:()=>camera,controllers:[],controllerStates:new Map()},
    get:role=>instruments.get(role),gestures:new Map()}, { createCanvas: cueCanvas });
  try {
    const guide=new JogMelodyGuidance(anchor),first=instruments.get('melody-C4');
    first.root.position.x+=.12;
    cues.update(guide,at(-.5));
    assert.equal(cues.pool.filter(p=>p.green.visible).length,1);
    assert.deepEqual(cues.pool[0].green.position.toArray(),first.root.position.toArray());
    cues.update(guide,at(0));
    assert.equal(cues.pool[0].green.visible,false);
    assert.ok(cues.pool[0].yellow.scale.x>.065);
    cues.update(guide,at(12.5));
    assert.match(cues.bendInstruction,/roll down toward C/);
    const bend=cues.pool.find(p=>p.yellow.visible);
    assert.deepEqual(bend.reference.position.toArray(),instruments.get('melody-Eb4').root.position.toArray());
    assert.ok(cues.gauge.root.visible);
    assert.notEqual(cues.gauge.expected.position.x,0);
    cues.update(guide,at(96),{active:!guide.complete(at(96))});
    assert.ok(cues.pool.every(p=>Object.values(p).every(m=>!m.visible)));
    cues.update(guide,at(0));cues.reset();
    assert.ok(cues.pool.every(p=>Object.values(p).every(m=>!m.visible)));
  }finally{cues.dispose();}
});
