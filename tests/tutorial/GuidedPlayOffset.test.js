import test from "node:test";
import assert from "node:assert/strict";
import { Group, Scene, PerspectiveCamera } from "three";
import { GuidedPlayOffset, clampGuidedPlayOffset, visualCueTime } from "../../src/tutorial/GuidedPlayOffset.js";
import { TutorialRuntime } from "../../src/tutorial/TutorialRuntime.js";
import { TutorialTimingCues } from "../../src/tutorial/TutorialTimingCues.js";
import { cueCanvas } from "../helpers/cueCanvas.js";

test("offset defaults to zero, persists, and clamps to 0–1000 milliseconds", () => {
  const values=new Map(),storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};
  const settings=new GuidedPlayOffset(storage);
  assert.equal(settings.milliseconds,0);
  settings.set(210);assert.equal(new GuidedPlayOffset(storage).milliseconds,210);
  assert.equal(settings.set(-50),0);assert.equal(settings.set(2000),1000);
  for(const bad of [NaN,Infinity,"bad"])assert.equal(clampGuidedPlayOffset(bad),0);
  const blocked=new GuidedPlayOffset({getItem(){throw Error("denied")},setItem(){throw Error("denied")}});
  assert.equal(blocked.set(200),200);
});

test("menu adjusts offset before playing, blocks mid-performance edits, and returns to the library",async()=>{
  const host=Object.create(TutorialRuntime.prototype);
  host.guidedPlayOffset=new GuidedPlayOffset({getItem:()=>0,setItem(){}});
  host.navigationScreen="record-songs";host.render=()=>{};
  await host.action("guided-play-settings");assert.equal(host.navigationScreen,"guided-play-settings");
  await host.action("guided-offset:100");await host.action("guided-offset:10");
  assert.equal(host.guidedPlayOffset.milliseconds,110);
  host.dataTutorial={phase:"practice"};await host.action("guided-offset:100");
  assert.equal(host.guidedPlayOffset.milliseconds,110);
  host.dataTutorial.phase=null;await host.action("guided-offset:reset");assert.equal(host.guidedPlayOffset.milliseconds,0);
  await host.action("guided-offset-back");assert.equal(host.navigationScreen,"record-songs");
});

for(const bpm of [60,70,120])test(`${bpm} BPM: note and bend targets lead by fixed milliseconds; score and live feedback stay real`,()=>{
  const scene=new Scene(),camera=new PerspectiveCamera(),root=new Group();scene.add(root);
  const settings=new GuidedPlayOffset({getItem:()=>200,setItem(){}});
  const runtime={scene,getUserCamera:()=>camera,controllers:[],controllerStates:new Map(),tutorial:{guidedPlayOffset:settings}};
  const target={root,getSqueezeColliderSphere:()=>({center:root.position,radius:.1})};
  const adapter={r:runtime,get:()=>target,gestures:new Map(),lastStrikes:new Map()};
  let indicatorBeat;
  adapter.handIndicators={labels:new Map(),update:(_,beat)=>{indicatorBeat=beat}};
  const beatMs=60000/bpm,anchor=3000;
  const event={id:"bent",role:"lead",midi:61,beat:0,beats:2,bendStyle:"melody",
    bend:[{fraction:0,semitones:0},{fraction:.1,semitones:0},{fraction:.7,semitones:3},{fraction:1,semitones:3}]};
  const guide={anchorMs:anchor,beatMs,step:{type:"data",timed:true,cueStyle:"attack-next",events:[event],beats:2},beatAt:now=>(now-anchor)/beatMs};
  const cues=new TutorialTimingCues(adapter,{createCanvas:cueCanvas});
  try {
    const now=anchor-200;
    assert.equal(visualCueTime(runtime,now),anchor);
    cues.update(guide,now);
    assert.equal(indicatorBeat,0);
    assert.equal(cues.pool.find(p=>p.hand.visible).hand.userData.phase,"hold");
    assert.ok(guide.beatAt(now)<0,"Actual music is still in its count-in");
    assert.equal(cues.gauge.state.required,0);
    settings.set(0);cues.update(guide,now);
    assert.equal(cues.pool.some(p=>p.hand.visible),false,"Zero offset preserves the original onset");
    settings.set(1000);cues.update(guide,anchor);
    assert.ok(Math.abs(indicatorBeat-1000/beatMs)<1e-9);
    assert.equal(guide.anchorMs,anchor);assert.equal(guide.beatAt(anchor),0);
    const gesture={startMs:anchor,voicedStartMs:anchor,voiced:true};
    assert.equal(cues.sustainFraction(gesture,2000),0,"Live hold feedback is not shifted");
  } finally {cues.dispose()}
});
