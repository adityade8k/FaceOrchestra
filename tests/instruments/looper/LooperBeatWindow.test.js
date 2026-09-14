import test from 'node:test';
import assert from 'node:assert/strict';
import { LooperController } from '../../../src/instruments/looper/LooperController.js';
import { LooperTimeline } from '../../../src/instruments/looper/timeline/LooperTimeline.js';
import { getRecordLengthDetent } from '../../../src/instruments/looper/looperControlMapping.js';
import { getLooperControlColliderPosition, getLooperControlMorphWeights } from '../../../src/instruments/looper/view/looperControlPresentation.js';
import { createHarness, setHonk } from '../../helpers/looperCaptureHarness.js';

const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
const select=(h,beats)=>h.controller.setControlValue(h.looper,'recordLength',({2:-1,4:-1/3,8:1/3,16:1})[beats]);
function fixture(){
  const h=createHarness({connected:true,trackCount:1});h.clock.beatIntervalMs=1000;
  let now=0;
  h.advance=(time,values={})=>{now=time;Object.assign(h.inputs[0],values);h.controller.updateRecordings([h.looper],time);};
  h.tempo=bpm=>{const phase=(now-h.clock.beatOriginMs)/h.clock.beatIntervalMs;h.clock.beatIntervalMs=60000/bpm;h.clock.beatOriginMs=now-phase*h.clock.beatIntervalMs;};
  h.looper.looperController=h.controller;
  return h;
}

test('four detents, top default, hysteresis and matched visual/collider interpolation',()=>{
  const h=fixture();assert.equal(h.looper.looperData.recordBeats,16);assert.equal(h.looper.looperData.recordLengthControlValue,1);
  const path={downAnchor:{x:1,y:-1,z:0},neutralAnchor:{x:0,y:0,z:0},upAnchor:{x:1,y:1,z:0}};
  for(const [i,beats] of [2,4,8,16].entries()){
    const value=select(h,beats);close(value,i*2/3-1);
    const weights=getLooperControlMorphWeights(value),point=getLooperControlColliderPosition({looperControlPath:path},value);
    close(point.y,weights.up-weights.down);close(point.x,weights.up+weights.down);
  }
  for(const [beats,midpoint,next] of [[2,-2/3,4],[4,0,8],[8,2/3,16]]){
    for(const noise of [-.04,0,.04])assert.equal(getRecordLengthDetent(midpoint+noise,beats).beats,beats);
    assert.equal(getRecordLengthDetent(midpoint+.07,beats).beats,next);
    assert.equal(getRecordLengthDetent(midpoint-.04,next).beats,next);
    assert.equal(getRecordLengthDetent(midpoint-.07,next).beats,beats);
  }
});

for(const beats of [2,4,8,16])test(`${beats} beats: silent arming, off-beat first onset, exact endpoint and untrimmed rests`,()=>{
  const h=fixture();select(h,beats);h.controller.startRecording(h.looper,0);
  h.advance(10100);assert.equal(h.looper.looperData.recordArmed,true);assert.equal(h.timeline.hasRecording(),false);
  h.advance(10250,{squeeze:1,musicalOnset:true});
  assert.equal(h.timeline.startedAtMs,10000);assert.equal(h.timeline.getMusicalOnsetTimes()[0],250);
  assert.deepEqual([h.looper.looperData.recordingWindow.startBeat,h.looper.looperData.recordingWindow.endBeat],[10,10+beats]);
  h.advance(10500,{squeeze:0,musicalOnset:false});
  const end=(10+beats)*1000;h.advance(end-1);assert.equal(h.looper.looperData.recording,true);
  h.advance(end);assert.equal(h.looper.looperData.recording,false);
  assert.equal(h.timeline.lengthMode,'fixed-window');assert.equal(h.timeline.recordedDurationMs,beats*1000);
  assert.equal(h.timeline.getMusicalOnsetTimes()[0],250);assert.equal(h.timeline.getTrack('track-0').gateEvents.at(-1).timeMs,500);
  const saved=h.timeline.toJSON();for(const gap of [0,4,1,0]){
    h.timeline.setGapBeats(gap);assert.equal(h.timeline.durationMs,(beats+gap)*1000);
    assert.deepEqual(LooperTimeline.fromJSON(h.timeline.toJSON()).toJSON(),h.timeline.toJSON());
  }
  assert.deepEqual(h.timeline.toJSON(),saved);
});

test('selector is latched at arm, saved independently of take, and legacy controls default to 16',()=>{
  const h=fixture();select(h,4);h.controller.startRecording(h.looper,0);select(h,16);
  h.advance(10250,{squeeze:1,musicalOnset:true});assert.equal(h.looper.looperData.recordingWindow.beats,4);
  h.advance(14000);const saved=h.controller.serializeState(h.looper);assert.equal(saved.controls.recordBeats,16);assert.equal(saved.timeline.fixedWindowBeats,4);
  h.controller.restoreState(h.looper,saved,{preserveConnections:true});assert.equal(h.looper.looperData.recordBeats,16);assert.equal(h.timeline.fixedWindowBeats,4);
  delete saved.controls.recordBeats;select(h,2);h.controller.restoreState(h.looper,saved,{preserveConnections:true});assert.equal(h.looper.looperData.recordBeats,16);assert.deepEqual(h.timeline.toJSON(),saved.timeline);
  const before=h.timeline.toJSON();h.controller.startRecording(h.looper,15000);h.controller.stopRecording(h.looper,99999);assert.deepEqual(h.timeline.toJSON(),before);
});

test('late frame interpolates held bend at boundary once; live gesture survives and post-boundary hits are excluded',()=>{
  const h=fixture();let stops=0;h.controller.adapter.onAutomaticRecordingStop=()=>stops++;
  select(h,2);h.controller.startRecording(h.looper,0);h.advance(250,{squeeze:1,bend:0,musicalOnset:true});
  h.advance(1800,{bend:.4});h.inputs[0].bend=.8;
  assert.equal(h.controller.recordSelfDrumHit(h.looper,'hihat',2200),false);
  assert.equal(h.timeline.durationMs,2000);assert.equal(h.timeline.getTrack('track-0').gateEvents.at(-1).timeMs,2000);
  close(h.timeline.getTrack('track-0').sampleNumericField('bend',2000),.6);
  assert.equal(h.inputs[0].squeeze,1);assert.equal(h.inputs[0].bend,.8);assert.equal(stops,1);
  const saved=h.timeline.toJSON();assert.equal(h.controller.stopRecording(h.looper,2200),false);h.advance(2300);assert.equal(stops,1);assert.deepEqual(h.timeline.toJSON(),saved);
  h.calls.length=0;h.controller.scheduleSourceRange(h.looper,0,2000,{includeStart:true,sourceNow:0,rate:1,audioNow:10});
  const release=h.calls.findIndex(e=>e.kind==='release');assert.ok(release>=0);close(h.calls[release-1].snapshot.bend,.6);close(h.calls[release].scheduledTime,12);
});

test('manual Stop race at exact beat finalizes fixed window; early Stop trims silence and preserves final held expression',()=>{
  for(const order of ['manual','frame']){
    const h=fixture();select(h,2);h.controller.startRecording(h.looper,0);h.advance(250,{squeeze:1,musicalOnset:true});
    if(order==='manual')h.controller.stopRecording(h.looper,2000);else h.advance(2000);
    const revision=h.looper.looperData.takeRevision;h.controller.stopRecording(h.looper,2000);h.advance(2000);assert.equal(h.looper.looperData.takeRevision,revision);assert.equal(h.timeline.lengthMode,'fixed-window');
  }
  const h=fixture();select(h,4);h.controller.startRecording(h.looper,0);h.advance(250,{squeeze:1,musicalOnset:true});h.advance(700,{bend:-.75});
  h.controller.stopRecording(h.looper,900);assert.equal(h.timeline.lengthMode,'content-trimmed');assert.equal(h.timeline.durationMs,650);assert.equal(h.timeline.getTrack('track-0').sampleNumericField('bend',650),-.75);
  assert.deepEqual(LooperTimeline.fromJSON(h.timeline.toJSON()).toJSON(),h.timeline.toJSON());
  h.advance(1000,{squeeze:0,musicalOnset:false});h.controller.startRecording(h.looper,2000);h.advance(2250,{squeeze:1,musicalOnset:true});h.advance(2500,{squeeze:0,musicalOnset:false});h.controller.stopRecording(h.looper,3500);assert.equal(h.timeline.durationMs,250);
});

test('tempo change retains continuous beat phase and expressive source timing instead of a wall-clock deadline',()=>{
  const h=fixture();select(h,4);h.controller.startRecording(h.looper,0);h.advance(250,{squeeze:1,musicalOnset:true});h.advance(1500,{bend:-.2});h.tempo(120);
  h.advance(2000,{bend:-.5});assert.equal(h.controller.getRecordingProgress(h.looper,2000).elapsedBeats,2.5);
  h.advance(2749);assert.equal(h.looper.looperData.recording,true);h.advance(2750);
  assert.equal(h.timeline.durationMs,4000);assert.equal(h.timeline.getTrack('track-0').gateEvents.at(-1).timeMs,4000);
  assert.ok(h.timeline.getTrack('track-0').events.some(e=>e.timeMs===2500&&e.values?.bend===-.5));
});

for(const source of ['track','self'])test(`${source} percussion starts capture, preserves the full sound and leaves the logical window fixed`,()=>{
  const h=fixture();select(h,2);h.controller.startRecording(h.looper,0);
  const hit=time=>source==='self'?h.controller.recordSelfDrumHit(h.looper,'hihat',time):h.controller.recordTrackDrumHit(h.looper,h.looper.looperData.tracks[0],'hihat',time);
  hit(250);hit(1950);assert.equal(hit(2000),false);assert.equal(h.timeline.durationMs,2000);
  const drums=h.timeline.getActiveTracks()[0].drumEvents;assert.equal(drums.length,2);assert.ok(drums[1].timeMs+drums[1].durationMs>2000);
  h.controller.scheduleSourceRange(h.looper,0,4000,{includeStart:true,sourceNow:0,rate:1,audioNow:10});assert.equal(h.calls.filter(c=>c.kind==='drum').length,4);
});

test('linked physical Play path groups actual connections, ignores ineligible loopers, and shares one clock across mixed cycles',()=>{
  const group=[2,4,8,16].map((beats,i)=>{
    const h=fixture();h.looper.id=`looper-${i}`;select(h,beats);h.controller.startRecording(h.looper,0);h.controller.recordSelfDrumHit(h.looper,'hihat',250);h.advance(beats*1000);return h;
  });
  const empty=fixture(),armed=fixture(),disconnected=fixture();armed.controller.startRecording(armed.looper,0);disconnected.clock.connected=false;
  const all=[...group,empty,armed,disconnected];for(const h of all)h.controller.adapter.getLoopers=()=>all.map(h=>h.looper);
  assert.equal(group[0].controller.startPlayback(group[0].looper,20100),true);
  const anchor=group[0].looper.looperData.pendingLaunch.audioAnchor;
  assert.equal(group[2].controller.startPlayback(group[2].looper,20200),true);
  for(const h of group){assert.equal(h.looper.looperData.pendingLaunch.targetBeat,21);assert.equal(h.looper.looperData.pendingLaunch.audioAnchor,anchor);h.controller.updateClockedTransports([h.looper],21000);assert.equal(h.looper.looperData.launchHistory.length,1);}
  for(const h of [empty,armed,disconnected])assert.equal(h.looper.looperData.pendingLaunch,null);
  assert.equal(armed.looper.looperData.recordArmed,true);
  for(let cycle=1;cycle<=128;cycle++)for(const h of group){const now=21000+cycle*16000;h.controller.updatePlaybackForLooper(h.looper,now);close(h.looper.looperData.playbackEngine.elapsedMs,0);assert.equal(h.looper.looperData.launchHistory.length,1);}
  const before=group.map(h=>h.timeline.toJSON());group[1].controller.setControlValue(group[1].looper,'gap',-.5);
  group[0].controller.startPlayback(group[0].looper,22000);const victim=group[1];victim.clock.connected=false;victim.controller.updateClockedTransports([victim.looper],22500);assert.equal(victim.looper.looperData.pendingLaunch,null);assert.equal(victim.looper.looperData.playing,false);
  const deleted=group[2];deleted.looper.disposed=true;deleted.controller.schedulePlaybackAudioForLooper(deleted.looper,22500);assert.equal(deleted.looper.looperData.pendingLaunch,null);
  assert.deepEqual(group[0].timeline.toJSON(),before[0]);for(const h of all)h.controller.stopPlayback(h.looper);
});

test('physical Stop racing automatic completion retains the take and animates Stop; later idle Stop still clears',async()=>{
  const {runtimeModule}=await import('../../support/runtimeModule.mjs');
  const {LooperTransportRuntimeMethods}=await runtimeModule(new URL('../../../src/app/runtime/LooperTransportRuntime.js',import.meta.url));
  const h=fixture();h.looper.kind='looper';const morphs=[];
  const r={...LooperTransportRuntimeMethods,updateLooperVisuals(){},setMorph:(...args)=>morphs.push(args)};
  h.controller.adapter.onAutomaticRecordingStop=(looper,now)=>r.triggerLooperButtonMorph(looper,'stop',now);
  select(h,2);h.controller.startRecording(h.looper,0);h.advance(250,{squeeze:1,musicalOnset:true});h.advance(2000);
  const before=h.timeline.toJSON();r.pressLooperButton(h.looper,'stop',null,2000);
  assert.deepEqual(h.timeline.toJSON(),before);assert.ok(morphs.some(([name,value])=>name==='button_stop_recording'&&value===1));
  assert.equal(h.inputs[0].squeeze,1);r.pressLooperButton(h.looper,'stop',null,2200);assert.equal(h.timeline.hasRecording(),false);
});

test('disconnect finalization keeps the captured clock domain instead of jumping to internal phase',()=>{
  const h=fixture();h.clock.beatOriginMs=10000;select(h,16);h.controller.startRecording(h.looper,10000);
  h.advance(10250,{squeeze:1,musicalOnset:true});h.advance(10500,{bend:.7});h.clock.connected=false;
  h.controller.stopRecording(h.looper,10750);assert.equal(h.timeline.lengthMode,'content-trimmed');assert.equal(h.timeline.durationMs,500);
});
