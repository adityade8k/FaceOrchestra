import test from 'node:test';
import assert from 'node:assert/strict';
import {createHarness,setHonk} from '../../helpers/looperCaptureHarness.js';
import {LooperTimeline} from '../../../src/instruments/looper/timeline/LooperTimeline.js';
import {getPercussionDurationMs} from '../../../src/audio/percussion/percussionProfiles.js';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);

for(const connected of [true,false])test(`delayed Stop preserves full final bend, release and interior rests (${connected?'connected':'internal'})`,()=>{
  const takes=[0,2000,5000].map(wait=>{
    const h=createHarness({connected,trackCount:2});
    h.controller.startRecording(h.looper,0);
    setHonk(h,0,137,1);setHonk(h,1,237,1);
    setHonk(h,0,437,0);setHonk(h,1,637,0);
    setHonk(h,0,1237,1);
    for(let t=1237;t<=2237;t+=50){h.inputs[0].bend=(t-1237)/1000;setHonk(h,0,t,1);}
    setHonk(h,0,2238,0);
    // Silent controller movement after release must neither extend nor reshape.
    if(wait){h.inputs[0].bend=-0.8;h.inputs[1].bend=0.7;setHonk(h,0,2238+wait,0);}
    h.controller.stopRecording(h.looper,2238+wait);
    close(h.timeline.durationMs,2101);
    assert.deepEqual(h.timeline.getMusicalOnsetTimes(),[0,100,1100]);
    assert.equal(h.timeline.getTrack('track-0').sampleNumericField('bend',2100),1);
    assert.equal(h.timeline.getTrack('track-0').gateEvents.at(-1).timeMs,2101);
    return h;
  });
  for(const h of takes){
    assert.deepEqual(h.timeline.toJSON(),takes[0].timeline.toJSON());
    const saved=JSON.stringify(h.timeline.toJSON().tracks);
    for(const gap of [0,2,4,0,1,0]){
      h.timeline.setGapBeats(gap);
      close(h.timeline.durationMs,2101+gap*h.timeline.beatIntervalMs);
      assert.equal(JSON.stringify(h.timeline.toJSON().tracks),saved);
    }
    const restored=LooperTimeline.fromJSON(h.timeline.toJSON());
    assert.deepEqual(restored.toJSON(),h.timeline.toJSON());
    h.calls.length=0;
    h.controller.scheduleSourceRange(h.looper,0,4202,{includeStart:true,sourceNow:0,rate:1,audioNow:10});
    const attacks=h.calls.filter(e=>e.kind==='start');
    assert.deepEqual(attacks.map(e=>Math.round((e.scheduledTime-10)*1000)),[0,100,1100,2101,2201,3201,4202]);
    const release=h.calls.findIndex(e=>e.kind==='release'&&Math.abs(e.scheduledTime-12.101)<1e-8);
    assert.equal(h.calls[release-1].kind,'expression');assert.equal(h.calls[release-1].snapshot.bend,1);
    assert.equal(h.calls[release-1].id,h.calls[release].id);
    assert.equal(h.calls[release-1].snapshot.squeeze,1,'release envelope retains the held amplitude');
  }
});

test('Stop during a held note captures its last bend once and forces one complete release',()=>{
  const h=createHarness({connected:true,trackCount:1});h.controller.startRecording(h.looper,0);
  setHonk(h,0,333,1);h.inputs[0].bend=.4;setHonk(h,0,933,1);
  h.inputs[0].bend=.95;h.controller.stopRecording(h.looper,1833);
  const saved=h.timeline.toJSON();assert.equal(h.controller.stopRecording(h.looper,9999),false);
  assert.deepEqual(h.timeline.toJSON(),saved);assert.equal(h.timeline.durationMs,1500);
  const track=h.timeline.getTrack('track-0');assert.equal(track.sampleNumericField('bend',1500),.95);
  assert.equal(track.gateEvents.filter(e=>e.type==='squeezeEnd').length,1);
  assert.equal(track.gateEvents.at(-1).preserveDuration,true);
});

test('v6 migration uses one shared offset, interpolation support and complete releases',()=>{
  const t=new LooperTimeline();t.beatIntervalMs=500;
  t.ensureTrack('a').setBaseline({squeeze:0,bend:0,nose:0});
  t.addFieldEvent('a','bend',100,.2);t.addFieldEvent('a','bend',400,.8);
  t.addFieldEvent('a','nose',100,.7,{interpolation:'step'});t.addFieldEvent('a','nose',400,.1);
  t.addActionEvent('a',{type:'squeezeStart',timeMs:200,value:1,gateOnly:true});
  t.addActionEvent('a',{type:'squeezeEnd',timeMs:900,value:0,gateOnly:true});
  t.addFieldEvent('a','bend',900,.9);t.addFieldEvent('a','bend',5000,-1);
  t.addActionEvent('b',{type:'squeezeStart',timeMs:550,value:1});
  t.addActionEvent('b',{type:'squeezeEnd',timeMs:1300,value:0,synthetic:true,preserveDuration:true});
  const old={...t.toJSON(),schemaVersion:6,durationMs:5500,recordedDurationMs:5000,gapBeats:1};
  const restored=LooperTimeline.fromJSON(old),a=restored.getTrack('a');
  assert.deepEqual(restored.getMusicalOnsetTimes(),[0,350]);
  assert.equal(restored.recordedDurationMs,1100);assert.equal(restored.durationMs,1600);
  close(a.sampleNumericField('bend',0),.4);close(a.sampleNumericField('bend',100),.6);
  close(a.sampleNumericField('nose',0),.7);close(a.sampleNumericField('nose',100),.7);
  close(a.sampleNumericField('bend',700),.9);
  assert.equal(a.events.some(e=>e.timeMs>1100),false);
  assert.deepEqual(restored.clone().toJSON(),restored.toJSON());
});

test('silent automation is empty; cancelling record-armed preserves the prior take',()=>{
  const t=new LooperTimeline();t.startRecording(0);t.addFieldEvent('a','bend',50,.9);t.addFieldEvent('a','nose',700,1);
  assert.equal(t.stopRecording(10000),false);assert.equal(t.durationMs,0);
  const h=createHarness({connected:false,trackCount:1});h.controller.startRecording(h.looper,0);
  setHonk(h,0,100,1);setHonk(h,0,300,0);h.controller.stopRecording(h.looper,400);
  const before=h.timeline.toJSON();h.controller.startRecording(h.looper,1000);
  h.controller.stopRecording(h.looper,10000);assert.deepEqual(h.timeline.toJSON(),before);
});
test('a same-frame gate keeps a finite, stable cycle across save/load',()=>{
  const t=new LooperTimeline();
  t.addActionEvent('a',{type:'squeezeStart',timeMs:0,value:1});
  t.addActionEvent('a',{type:'squeezeEnd',timeMs:0,value:0});
  t.finalizeDuration(24);assert.equal(t.durationMs,24);
  const track=t.getTrack('a');assert.equal(track.sampleGateActive(0),false);
  assert.equal(track.getOwningNote(track.gateEvents[1]).event,track.gateEvents[0]);
  assert.deepEqual(t.clone().toJSON(),t.toJSON());
});

for(const type of ['boink','hihat','metronomeWood'])test(`a single ${type} keeps its natural tail with duplicate-free fractional wraps`,()=>{
  const h=createHarness({connected:true,trackCount:1});h.controller.startRecording(h.looper,0);
  h.controller.recordSelfDrumHit(h.looper,type,333);h.controller.stopRecording(h.looper,7333);
  const duration=getPercussionDurationMs(type);close(h.timeline.durationMs,duration);
  assert.deepEqual(h.timeline.getMusicalOnsetTimes(),[0]);h.calls.length=0;
  // Successive scheduler windows share endpoints, including exact wraps.
  for(let i=0;i<6;i++)h.controller.scheduleSourceRange(h.looper,i*duration,(i+1)*duration,
    {includeStart:i===0,sourceNow:0,rate:1,audioNow:10});
  const drums=h.calls.filter(e=>e.kind==='drum');assert.equal(drums.length,7);
  drums.forEach((e,i)=>close(e.scheduledTime,10+i*duration/1000));
  h.controller.handleLoopBoundary(h.looper);
  assert.equal(h.calls.some(e=>e.kind==='cancelDrums'),false,'wrapping leaves sounding tails alive');
});
