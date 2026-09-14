import test from 'node:test';
import assert from 'node:assert/strict';
import {LooperController,nextBeatAfter} from '../../../src/instruments/looper/LooperController.js';
import {LooperTimeline} from '../../../src/instruments/looper/timeline/LooperTimeline.js';
import {LOOPER_STANDALONE_BPM} from '../../../src/config/looper.js';

const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
function fixture() {
  let now=0,interval=750,origin=0,connected=true,active=true;
  const calls=[], times=[];
  const timing=t=>({connected,active,metronomeId:'clock',bpm:60000/interval,beatIntervalMs:interval,beatOriginMs:origin,beatPosition:(t-origin)/interval});
  function looper(id) {
    const controller=new LooperController({getTimingForLooper:(_id,t)=>{times.push(t);return timing(t);},getAudioCurrentTime:()=>10+now/1000,
      isPlayableHonkId:()=>true,getPlaybackTargetIds:(_track,honk)=>[honk],
      startActionVoice:(voice,honk,options)=>calls.push({kind:'start',id,voice,...options}),
      updateActionVoiceByHonkId:(voice,honk,snapshot,volume,options)=>calls.push({kind:'expression',id,voice,snapshot:{...snapshot},...options}),
      releaseActionVoice:(voice,honk,options)=>calls.push({kind:'release',id,voice,...options}),
      cancelActionVoice:(voice,honk,options)=>calls.push({kind:'cancel',id,voice,...options}),
      cancelLooperPercussion:(owner,options)=>calls.push({kind:'cancelDrums',id:owner,...options}),
      playStickPercussion:(type,options)=>calls.push({kind:'drum',id,type,...options})});
    const h={id,kind:'looper',looperController:controller,root:{visible:true},hitTargets:{}};
    const data=h.looperData=controller.createStateData(h,{trackCount:1});data.tracks[0].connectedHonkId=`honk-${id}`;
    // Canonical source fixture: an intentionally delayed attack and expressive curve.
    const t=data.timeline;t.timingMode='metronome';t.sourceBeatIntervalMs=t.beatIntervalMs=750;
    for(const [type,timeMs,extra] of [['squeezeStart',110,{value:1}],['gestureSnapshot',130,{values:{squeeze:1,bend:0.1}}],['gestureSnapshot',600,{values:{squeeze:1,bend:-0.6}}],['squeezeEnd',900,{value:0}],['squeezeStart',11250,{value:1}],['squeezeEnd',11700,{value:0}]])t.addActionEvent('track-0',{trackIndex:0,type,timeMs,...extra});
    t.finalizeDuration();data.hasRecording=true;h.timeline=t;
    return h;
  }
  const a=looper('a'),b=looper('b');
  const quiet=()=>{for(const l of [a,b])l.looperController.stopAudioScheduler(l,{release:false});};
  return {a,b,calls,times,timing,quiet,set(t){now=t;},run(t){now=t;for(const l of [a,b]){l.looperController.schedulePlaybackAudioForLooper(l,t);l.looperController.updateClockedTransports([l],t);l.looperController.updatePlaybackForLooper(l,t);}quiet();},
    bpm(bpm){const phase=(now-origin)/interval;interval=60000/bpm;origin=now-phase*interval;},disconnect(){connected=false;},pause(){active=false;}};
}
for(const [press,beat] of [[749.999,1],[750,2],[750.001,2]])test(`Play at ${press} ms targets strictly following beat ${beat}`,()=>{
  const h=fixture();h.set(press);const before=JSON.stringify(h.a.timeline.toJSON());
  assert.equal(h.a.looperController.startPlayback(h.a,press),true);h.quiet();
  assert.equal(h.a.looperData.playArmed,true);assert.equal(h.a.looperData.pendingLaunch.targetBeat,beat);
  h.run(beat*750);assert.equal(h.a.looperData.clockPlaybackStartBeatPosition,beat);
  const starts=h.calls.filter(c=>c.kind==='start');assert.equal(starts.length,1);
  close(starts[0].scheduledTime,10+beat*750/1000);
  assert.equal(JSON.stringify(h.a.timeline.toJSON()),before);
  h.a.looperController.stopPlayback(h.a);
});
test('floating equality tolerance only treats microscopic rounding error as an exact beat',()=>{
  assert.equal(nextBeatAfter(1-1e-10),2);assert.equal(nextBeatAfter(1-1e-6),1);assert.equal(nextBeatAfter(1+1e-6),2);
});
test('Start All shares launch and source tempo without forcing unequal fractional cycles to align',()=>{
  const h=fixture(),track=h.b.timeline.getTrack('track-0');
  track.events.at(-1).timeMs+=137.25;track.sorted=false;h.b.timeline.finalizeDuration();
  const saved=[h.a,h.b].map(l=>JSON.stringify(l.timeline.toJSON()));
  h.set(500);const request=LooperController.startAll([h.a,h.b],500);h.quiet();h.run(750);
  assert.equal(request.targetBeat,1);
  const starts=h.calls.filter(c=>c.kind==='start');close(starts[0].scheduledTime,starts[1].scheduledTime);
  const later=750+8*h.a.timeline.durationMs+123;h.run(later);
  close(h.a.looperController.getAbsoluteSourcePosition(h.a,later),h.b.looperController.getAbsoluteSourcePosition(h.b,later));
  assert.notEqual(h.a.looperData.playbackEngine.elapsedMs,h.b.looperData.playbackEngine.elapsedMs);
  h.bpm(110);h.run(later);
  for(const [i,l] of [h.a,h.b].entries()){
    assert.equal(JSON.stringify(l.timeline.toJSON()),saved[i]);l.looperController.stopPlayback(l);
  }
});
test('Start All validates the batch before mutation and shares request time, launch and phase through BPM changes',()=>{
  const h=fixture();h.set(749.999);
  h.b.looperData.transport.record();
  assert.equal(LooperController.startAll([h.a,h.b],749.999).ok,false);assert.equal(h.a.looperData.pendingLaunch,null);
  h.b.looperData.transport.stop();h.times.length=0;
  const request=LooperController.startAll([h.a,h.b],749.999);h.quiet();
  assert.equal(request.targetBeat,1);assert.ok(h.times.every(t=>t===749.999));
  assert.equal(h.a.looperData.armedAtMs,h.b.looperData.armedAtMs);
  h.run(750);assert.equal(h.a.looperData.clockPlaybackStartBeatPosition,1);assert.equal(h.b.looperData.clockPlaybackStartBeatPosition,1);
  const before=JSON.stringify(h.a.timeline.toJSON());
  for(let i=1;i<=8;i++){
    h.run(750+i*12000+137);
    close(h.a.looperData.playbackEngine.elapsedMs,h.b.looperData.playbackEngine.elapsedMs);
    const phase=h.a.looperController.getAbsoluteSourcePosition(h.a,750+i*12000+137);
    h.bpm(i%2?110:80);h.run(750+i*12000+137);
    close(h.a.looperController.getAbsoluteSourcePosition(h.a,750+i*12000+137),phase);
  }
  assert.equal(JSON.stringify(h.a.timeline.toJSON()),before);
  for(const l of [h.a,h.b])l.looperController.stopPlayback(l);
});
test('Start All keeps an existing take running, schedules its release at the common boundary, and Stop cancels both generations',()=>{
  const h=fixture();h.set(500);h.a.looperController.startPlayback(h.a,500);h.quiet();h.run(750);h.run(950);
  h.calls.length=0;h.set(1000);const request=LooperController.startAll([h.a,h.b],1000);h.quiet();
  assert.equal(h.a.looperData.playing,true);assert.equal(h.a.looperData.clockPlaybackStartBeatPosition,1);
  assert.equal(h.calls.filter(c=>c.kind==='cancel').length,0);
  h.run(1400);assert.equal(h.a.looperData.clockPlaybackStartBeatPosition,1);
  const cancel=h.calls.find(c=>c.kind==='cancel');close(cancel.scheduledTime,11.5);
  h.run(1500);for(const l of [h.a,h.b])assert.equal(l.looperData.clockPlaybackStartBeatPosition,request.targetBeat);
  for(const l of [h.a,h.b]){l.looperController.stopPlayback(l);assert.equal(l.looperController.applier.scheduledGenerations.size,0);assert.equal(l.looperController.applier.retiringGenerations.size,0);assert.equal(l.looperData.audioScheduling.timer,null);}
});
test('scheduler prepares attacks ahead of frames and late starts recover at target-relative phase without stale attacks',()=>{
  const h=fixture();h.a.timeline.getTrack('track-0').events[0].timeMs=0;h.a.timeline.getTrack('track-0').sortEvents();
  h.set(500);h.a.looperController.startPlayback(h.a,500);h.quiet();
  h.run(650);assert.equal(h.a.looperData.playArmed,true);
  close(h.calls.find(c=>c.kind==='start').scheduledTime,10.75);
  h.run(2800);assert.equal(h.a.looperData.clockPlaybackStartBeatPosition,1);
  close(h.a.looperData.playbackEngine.elapsedMs,2050);
  // The first voice was actually queued on time; no obsolete attacks are emitted on recovery.
  assert.equal(h.calls.filter(c=>c.kind==='start').length,1);
  h.a.looperController.stopPlayback(h.a);
  const late=fixture();late.set(400);late.a.looperController.startPlayback(late.a,400);late.quiet();late.run(2800);
  assert.equal(late.calls.filter(c=>c.kind==='start').length,0);
  assert.equal(late.a.looperData.clockPlaybackStartBeatPosition,1);close(late.a.looperData.playbackEngine.elapsedMs,2050);
  late.a.looperController.stopPlayback(late.a);
});
test('disconnect retains canonical timestamps and bends, and content duration scales from source 80 BPM to internal 70',()=>{
  const h=fixture(),before=JSON.stringify(h.a.timeline.toJSON());h.set(100);h.a.looperController.startPlayback(h.a,100);h.quiet();
  h.disconnect();h.a.looperController.handleClockDisconnected(h.a);assert.equal(h.a.looperData.armed,false);
  const t=1000;h.set(t);h.a.looperController.startPlayback(h.a,t);h.quiet();
  const target=h.a.looperData.pendingLaunch.targetBeat;const start=target*60000/LOOPER_STANDALONE_BPM;
  h.run(start);close(h.a.looperController.getPlaybackRate(h.a,start),70/80);
  h.run(start+h.a.timeline.durationMs/(70/80));close(h.a.looperData.playbackEngine.elapsedMs,0);
  close(h.a.timeline.durationMs/(70/80),13245.714285714286);
  assert.equal(JSON.stringify(h.a.timeline.toJSON()),before);
  h.a.looperController.stopPlayback(h.a);
});
test('legacy ordinary recordings retain native milliseconds with unknown source tempo',()=>{
  const h=fixture();const saved=h.a.timeline.toJSON();delete saved.sourceBeatIntervalMs;saved.timingMode='ordinary';saved.beatAnalysis={inferred:true,beatIntervalMs:500};
  h.a.timeline=h.a.looperData.timeline=LooperTimeline.fromJSON(saved);assert.equal(h.a.timeline.sourceBeatIntervalMs,0);
  const before=JSON.stringify(h.a.timeline.toJSON());h.disconnect();h.set(500);h.a.looperController.startPlayback(h.a,500);h.quiet();h.run(60000/70);
  assert.equal(h.a.looperController.getPlaybackRate(h.a,1000),1);assert.equal(JSON.stringify(h.a.timeline.toJSON()),before);h.a.looperController.stopPlayback(h.a);
});

test('Resume retains paused source phase on the next beat while Play restarts from origin',()=>{
  const h=fixture();h.set(500);h.a.looperController.startPlayback(h.a,500);h.quiet();h.run(750);h.run(950);
  h.a.looperController.pausePlaybackImmediately(h.a);const position=h.a.looperData.playbackEngine.elapsedMs;
  h.calls.length=0;h.set(1000);h.a.looperController.resumePlayback(h.a,1000);h.quiet();h.run(1400);h.run(1500);
  close(h.a.looperData.playbackEngine.elapsedMs,position);
  close(h.calls.find(c=>c.kind==='start').scheduledTime,11.5);
  h.a.looperController.pausePlaybackImmediately(h.a);h.set(1600);h.a.looperController.startPlayback(h.a,1600);h.quiet();h.run(2250);
  close(h.a.looperData.playbackEngine.elapsedMs,0);h.a.looperController.stopPlayback(h.a);
});

test('Start All replaces an already-prepared individual launch with the batch audio anchor',()=>{
  const h=fixture();h.set(690);h.a.looperController.startPlayback(h.a,690);h.quiet();
  const oldAnchor=h.a.looperData.pendingLaunch.audioAnchor;assert.equal(h.a.looperData.pendingLaunch.prepared,true);
  h.set(710);assert.equal(LooperController.startAll([h.a,h.b],710).ok,true);h.quiet();
  assert.notEqual(h.a.looperData.pendingLaunch.audioAnchor,oldAnchor);
  assert.equal(h.a.looperData.pendingLaunch.audioAnchor,h.b.looperData.pendingLaunch.audioAnchor);
  h.run(750);close(h.a.looperData.launchHistory.at(-1).audioOriginTime,h.b.looperData.launchHistory.at(-1).audioOriginTime);
  for(const l of [h.a,h.b]){l.looperController.stopPlayback(l);assert.equal(l.looperController.applier.retiringGenerations.size,0);}
});
test('track disconnect cancels old retiring voices as well as the prepared restart generation',()=>{
  const h=fixture();h.set(500);h.a.looperController.startPlayback(h.a,500);h.quiet();h.run(750);h.run(950);
  h.set(1300);h.a.looperController.startPlayback(h.a,1300);h.quiet();h.run(1400);
  assert.ok(h.a.looperController.applier.retiringGenerations.size>0);
  h.a.looperController.disconnectTrack(h.a,0);
  assert.equal(h.a.looperController.applier.retiringGenerations.size,0);
  assert.equal(h.a.looperController.applier.scheduledGenerations.size,0);
  assert.ok(h.a.timeline.hasRecording());h.a.looperController.stopPlayback(h.a);
});

test('tempo changes cancel queued percussion before scheduling the same onset at the new tempo',()=>{
  const h=fixture();
  h.a.timeline.addActionEvent('track-0',{trackIndex:0,type:'drumHit',timeMs:860,value:'metronomeWood'});
  h.set(500);h.a.looperController.startPlayback(h.a,500);h.quiet();h.run(750);h.run(1540);
  const original=h.calls.find(c=>c.kind==='drum');assert.ok(original);
  h.calls.length=0;h.set(1560);h.bpm(110);h.run(1560);
  const cancelled=h.calls.findIndex(c=>c.kind==='cancelDrums'&&c.id==='a');
  const rescheduled=h.calls.findIndex(c=>c.kind==='drum');
  assert.ok(cancelled>=0&&rescheduled>cancelled);
  assert.ok(h.calls[rescheduled].scheduledTime<original.scheduledTime);
  h.a.looperController.stopPlayback(h.a);
});
