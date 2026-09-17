import test from 'node:test';
import assert from 'node:assert/strict';
import {LooperController} from '../../../src/instruments/looper/LooperController.js';
import {MetronomeConnectionManager} from '../../../src/instruments/metronome/MetronomeConnectionManager.js';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
function fixture(t,{lengths=[16,8,4],offsets=[0,110,0],legacy=false}={}) {
  let now=0, interval=500, origin=0;
  const calls=[],loopers=[],instruments=new Map();
  const registry={get:id=>instruments.get(id),getByKind:kind=>[...instruments.values()].filter(h=>h.kind===kind)};
  const metro={id:'m',kind:'metronome',root:{visible:true},playing:true,hasConnectionPort:()=>true,
    getBeatTiming:time=>({active:metro.playing,beatPosition:(time-origin)/interval,beatIntervalMs:interval,beatOriginMs:origin,bpm:60000/interval})};
  instruments.set(metro.id,metro);
  const manager=new MetronomeConnectionManager({registry});
  for(let i=0;i<3;i++) {
    const id=String.fromCharCode(97+i);
    const controller=new LooperController({getTimingForLooper:(id,time)=>manager.getTimingForLooper(id,time),getAudioCurrentTime:()=>10+now/1000,
      isPlayableHonkId:()=>true,getPlaybackTargetIds:(_track,honk)=>[honk],getLoopers:()=>loopers,
      startActionVoice:(voice,honk,options)=>calls.push({kind:'start',id,voice,...options}),
      updateActionVoiceByHonkId:(voice,honk,snapshot,volume,options)=>calls.push({kind:'expression',id,voice,snapshot:{...snapshot},...options}),
      releaseActionVoice:(voice,honk,options)=>calls.push({kind:'release',id,voice,...options}),
      cancelActionVoice:(voice,honk,options)=>calls.push({kind:'cancel',id,voice,...options}),
      cancelLooperPercussion:(id,options)=>calls.push({kind:'cancelDrums',id,...options}),
      playStickPercussion:(type,options)=>calls.push({kind:'drum',id,...options})});
    const h={id,kind:'looper',looperController:controller,root:{visible:true},hitTargets:{}};
    const data=h.looperData=controller.createStateData(h,{trackCount:2});h.tracks=data.tracks;
    data.tracks[0].nodeTarget={visible:true};data.tracks[0].connectedHonkId=`h-${id}`;
    const timeline=data.timeline;timeline.timingMode=legacy?'ordinary':'metronome';
    timeline.sourceBeatIntervalMs=timeline.beatIntervalMs=legacy?0:500;
    timeline.addActionEvent('track-0',{trackIndex:0,type:'squeezeStart',timeMs:offsets[i],value:1});
    timeline.addActionEvent('track-0',{trackIndex:0,type:'gestureSnapshot',timeMs:offsets[i]+40,values:{squeeze:1,bend:-.5}});
    timeline.addActionEvent('track-0',{trackIndex:0,type:'squeezeEnd',timeMs:offsets[i]+200,value:0});
    timeline.durationMs=timeline.recordedDurationMs=lengths[i]*500;data.hasRecording=true;
    instruments.set(id,h);loopers.push(h);
  }
  const connect=(h,port='port-0',metronomeId='m')=>manager.connect({metronomeId,portId:port,targetKind:'looper',targetId:h.id,targetPortId:'track-0'});
  loopers.forEach(h=>connect(h));
  const quiet=()=>loopers.forEach(h=>h.looperController.stopAudioScheduler(h,{release:false}));
  const run=time=>{now=time;for(const h of loopers){h.looperController.schedulePlaybackAudioForLooper(h,time);h.looperController.updateClockedTransports([h],time);h.looperController.updatePlaybackForLooper(h,time);}quiet();};
  const play=(h,time=now,options)=>{now=time;const ok=h.looperController.startPlayback(h,time,options);quiet();return ok;};
  t.after(()=>{manager.clear();loopers.forEach(h=>h.looperController.stopPlayback(h));});
  return {manager,metro,loopers,calls,connect,quiet,play,run,instruments,registry,get now(){return now;},set(time){now=time;},
    bpm(bpm){const phase=(now-origin)/interval;interval=60000/bpm;origin=now-phase*interval;}};
}
test('explicit selection reserves an idle port before launch; fallback uses latest connection',t=>{
  const h=fixture(t),[a,b,c]=h.loopers;
  assert.equal(h.play(a,100),true);assert.ok(a.looperData.playArmed);assert.equal(b.looperData.armed,false);
  assert.ok(h.play(b,200));assert.equal(a.looperData.armed,false);assert.equal(b.looperData.pendingLaunch.targetBeat,1);
  h.run(500);assert.equal(b.looperData.playing,true);assert.equal(a.looperData.playing,false);
  b.looperController.stopPlayback(b);LooperController.startAll(h.loopers,600);h.quiet();
  assert.ok(c.looperData.playArmed);assert.equal(b.looperData.playArmed,false);
  assert.strictEqual(h.connect(c),h.manager.getConnectionForTarget('looper','c'));
  assert.equal(h.manager.getConnectionsForPort('m','port-0').length,3);
});
test('A to B uses the complete sixteen-beat cycle including final rest and incoming offset, without an extra beat',t=>{
  const h=fixture(t),[a,b]=h.loopers;
  h.play(a,-100);h.run(0);h.run(3000);h.calls.length=0;
  h.play(b,3000);assert.ok(b.looperData.queued);assert.ok(a.looperData.playing);
  h.run(7900);assert.ok(b.looperData.queued);
  h.run(7995);const start=h.calls.find(c=>c.kind==='start'&&c.id==='b');close(start.scheduledTime,18.11);
  assert.equal(h.calls.some(c=>c.kind==='start'&&c.id==='a'),false);
  h.run(8000);assert.ok(b.looperData.playing);assert.equal(a.looperData.playing,false);assert.equal(b.looperData.queued,false);
  assert.equal(b.looperData.clockPlaybackStartBeatPosition,16);assert.equal(b.looperData.switchHistory.length,1);
  h.play(a,9000);h.run(12000);assert.ok(a.looperData.playing);assert.ok(a.looperData.timeline.hasRecording());assert.ok(b.looperData.timeline.hasRecording());
});
test('selection replacement and cancellation remove pre-scheduled incoming voices, without reattacking outgoing notes',t=>{
  const h=fixture(t,{lengths:[4,4,4],offsets:[0,0,0]}),[a,b,c]=h.loopers;
  h.play(a,-100);h.run(0);h.play(b,500);h.run(1900);
  const old=h.calls.find(call=>call.kind==='start'&&call.id==='b');assert.ok(old);
  h.play(c,1920);assert.equal(b.looperData.queued,false);assert.ok(c.looperData.queued);
  assert.ok(h.calls.some(call=>call.kind==='cancel'&&call.voice===old.voice));
  const launch=c.looperData.pendingLaunch;h.play(c,1930);assert.strictEqual(c.looperData.pendingLaunch,launch);
  h.play(a,1940);assert.equal(c.looperData.queued,false);assert.equal(a.looperData.clockPlaybackStartBeatPosition,0);
  h.run(2000);assert.equal(c.looperData.playing,false);assert.ok(a.looperData.playing);
  assert.equal(h.calls.filter(call=>call.kind==='start'&&call.id==='a').length,2);
});
test('queue near the boundary cancels an outgoing repetition already in the audio lookahead',t=>{
  const h=fixture(t,{lengths:[4,4,4],offsets:[0,0,0]}),[a,b]=h.loopers;
  h.play(a,-100);h.run(0);h.run(1900);
  const repeat=h.calls.filter(c=>c.kind==='start'&&c.id==='a').at(-1);close(repeat.scheduledTime,12);
  h.play(b,1950);assert.ok(h.calls.some(c=>c.kind==='cancel'&&c.voice===repeat.voice));
  h.run(2000);assert.ok(b.looperData.playing);assert.equal(a.looperData.playing,false);
});
test('tempo changes during a prepared handoff cancel and reschedule the incoming attack at the shared beat',t=>{
  const h=fixture(t,{lengths:[4,4,4],offsets:[0,0,0]}),[a,b]=h.loopers;
  h.play(a,-100);h.run(0);h.play(b,600);h.run(1900);
  const old=h.calls.find(c=>c.kind==='start'&&c.id==='b');close(old.scheduledTime,12);
  h.set(1920);h.bpm(60);h.run(1920);assert.ok(h.calls.some(c=>c.kind==='cancel'&&c.voice===old.voice));
  h.run(1980);h.run(2080);assert.equal(b.looperData.clockPlaybackStartBeatPosition,4);
  close(h.calls.filter(c=>c.kind==='start'&&c.id==='b').at(-1).scheduledTime,12.08);
});
test('legacy fractional cycle finishes before the first following beat, including a tempo change',t=>{
  const h=fixture(t,{lengths:[3.5,4,4],offsets:[0,0,0],legacy:true}),[a,b]=h.loopers;
  h.play(a,-100);h.run(0);h.play(b,700);h.run(1000);h.bpm(60);h.run(1000);
  h.run(1750);assert.equal(a.looperData.playing,false);assert.ok(b.looperData.queued);
  h.run(1900);h.run(2000);assert.ok(b.looperData.playing);assert.equal(b.looperData.clockPlaybackStartBeatPosition,3);
});
test('ports and metronomes are independent; Start All preserves explicit active and pending selections',t=>{
  const h=fixture(t),[a,b,c]=h.loopers;h.connect(c,'port-1');
  h.play(a,-100);h.run(0);h.play(b,500);
  LooperController.startAll(h.loopers,600);h.quiet();h.run(1000);
  assert.ok(a.looperData.playing);assert.ok(b.looperData.queued);assert.ok(c.looperData.playing);assert.equal(a.looperData.clockPlaybackStartBeatPosition,0);
  const m2={...h.metro,id:'m2'};h.instruments.set('m2',m2);h.connect(b,'port-0','m2');h.play(b,1100);h.run(1500);
  assert.ok(h.loopers.every(l=>l.looperData.playing));
});
for(const action of ['stopQueued','pauseQueued','clearQueued','recordQueued','disconnectQueued','deleteQueued','stopActive','pauseActive','disconnectActive','reset','clockStop'])test(`${action} cancels a pending handoff without stale launch`,t=>{
  const h=fixture(t,{lengths:[4,4,4],offsets:[0,0,0]}),[a,b]=h.loopers;h.play(a,-100);h.run(0);h.play(b,500);h.run(1900);
  const c=b.looperController;
  if(action==='stopQueued')c.stopPlayback(b);
  if(action==='pauseQueued')c.pausePlayback(b,1900);
  if(action==='clearQueued')c.clearRecording(b);
  if(action==='recordQueued')c.startRecording(b,1900);
  if(action==='disconnectQueued')h.manager.disconnectTarget('looper',b.id);
  if(action==='deleteQueued'){b.disposed=true;h.manager.disconnectInstrument(b.id);}
  if(action==='stopActive')a.looperController.stopPlayback(a);
  if(action==='pauseActive')a.looperController.pausePlayback(a,1900);
  if(action==='disconnectActive')h.manager.disconnectTarget('looper',a.id);
  if(action==='reset')h.manager.clear();
  if(action==='clockStop'){h.metro.playing=false;h.run(1920);h.metro.playing=true;}
  h.run(2000);h.run(2500);assert.equal(b.looperData.playing,false);assert.equal(b.looperData.queued,false);
  if(action.endsWith('Queued'))assert.ok(a.looperData.playing);
});
test('ineligible requests retain the valid pending selection; resume and direct arm respect port arbitration',t=>{
  const h=fixture(t),[a,b,c]=h.loopers;h.play(a,-100);h.run(0);h.play(b,500);
  c.looperController.clearRecording(c);assert.equal(h.play(c,600),false);assert.ok(b.looperData.queued);
  assert.equal(h.play(a,700),true);assert.equal(b.looperData.queued,false);
  b.looperController.armPlayback(b,800,b.looperController.getTimingForLooper(b,800));h.quiet();assert.ok(b.looperData.queued);
  b.looperController.stopPlayback(b);b.looperData.transport.play();b.looperData.transport.pause();
  b.looperController.resumePlayback(b,900);h.quiet();assert.ok(b.looperData.queued);assert.equal(b.looperData.pendingLaunch.resumeSourceMs,0);
  b.looperController.startRecording(b,1000);assert.equal(h.play(b,1100),false);assert.ok(a.looperData.playing);
});
test('connecting a running standalone looper does not interrupt or join an occupied port',t=>{
  const h=fixture(t),[a,b]=h.loopers;h.manager.disconnectTarget('looper',b.id);h.play(b,-100);h.run(0);assert.ok(b.looperData.playing);
  h.play(a,100);h.run(500);h.connect(b);assert.equal(b.looperData.playing,false);assert.ok(a.looperData.playing);
});

test('Start All preserves a queued legacy selection in the silence between completion and the following beat',t=>{
  const h=fixture(t,{lengths:[3.5,4,4],offsets:[0,0,0],legacy:true}),[a,b,c]=h.loopers;
  h.play(a,-100);h.run(0);h.play(b,500);h.run(1750);
  assert.ok(b.looperData.queued);assert.equal(a.looperData.playing,false);
  LooperController.startAll(h.loopers,1800);h.quiet();assert.ok(b.looperData.queued);assert.equal(c.looperData.playArmed,false);
  h.run(2000);assert.ok(b.looperData.playing);assert.equal(c.looperData.playing,false);
});
test('fallback ignores an empty last-connected looper and identical reconnect does not reorder the group',t=>{
  const h=fixture(t),[a,b,c]=h.loopers;c.looperController.clearRecording(c);
  h.connect(a);const request=LooperController.startAll(h.loopers,100);h.quiet();
  assert.deepEqual(request.looperIds,['b']);assert.ok(b.looperData.playArmed);
});
test('tempo changes within the lookahead do not schedule the outgoing next repetition',t=>{
  const h=fixture(t,{lengths:[4,4,4],offsets:[0,0,0]}),[a,b]=h.loopers;
  h.play(a,-100);h.run(0);h.play(b,500);h.run(1900);h.set(1920);h.bpm(240);h.run(1920);h.run(1960);
  assert.equal(h.calls.filter(c=>c.kind==='start'&&c.id==='a').length,1);
  assert.ok(b.looperData.playing);assert.equal(a.looperData.playing,false);
});

test('Play on the active looper cancels an armed Pause and retains its running cycle',t=>{
  const h=fixture(t),[a,b]=h.loopers;h.play(a,-100);h.run(0);h.play(b,1000);
  a.looperController.pausePlayback(a,1100);assert.ok(a.looperData.pauseArmed);assert.equal(b.looperData.queued,false);
  h.play(a,1200);assert.equal(a.looperData.pauseArmed,false);h.run(1500);
  assert.ok(a.looperData.playing);assert.equal(a.looperData.clockPlaybackStartBeatPosition,0);
});
test('locked Looper toggle cancels its queued request while leaving the active group member playing',async t=>{
  const {runtimeModule}=await import('../../support/runtimeModule.mjs');
  const {LooperTransportRuntimeMethods}=await runtimeModule(new URL('../../../src/app/runtime/LooperTransportRuntime.js',import.meta.url));
  const h=fixture(t),[a,b]=h.loopers;h.play(a,-100);h.run(0);h.play(b,500);
  const runtime={...LooperTransportRuntimeMethods,pressLooperButton:(looper,action)=>{
    assert.equal(action,'pause');looper.looperController.pausePlayback(looper,600);
  }};
  runtime.toggleLockedLooperPlayback(b);assert.equal(b.looperData.queued,false);assert.ok(a.looperData.playing);
});

test('Start All shares an explicitly armed future beat with idle ports without changing the reservation',t=>{
  const h=fixture(t),[a,,c]=h.loopers;h.connect(c,'port-1');h.set(100);
  a.looperController.armPlayback(a,100,a.looperController.getTimingForLooper(a,100),{targetBeat:4});h.quiet();
  const launch=a.looperData.pendingLaunch;LooperController.startAll(h.loopers,200);h.quiet();
  assert.strictEqual(a.looperData.pendingLaunch,launch);assert.equal(c.looperData.pendingLaunch.targetBeat,4);
  assert.strictEqual(c.looperData.pendingLaunch.audioAnchor,launch.audioAnchor);
});
test('registry removal cancels a queued looper immediately even after its registry entry has gone',t=>{
  const h=fixture(t,{lengths:[4,4,4],offsets:[0,0,0]}),[a,b]=h.loopers;
  h.play(a,-100);h.run(0);h.play(b,500);h.run(1900);
  const incoming=h.calls.find(c=>c.kind==='start'&&c.id==='b');assert.ok(incoming);
  h.instruments.delete(b.id);h.manager.disconnectInstrument(b.id);
  assert.equal(b.looperData.queued,false);assert.equal(b.looperData.pendingLaunch,null);
  assert.ok(h.calls.some(c=>c.kind==='cancel'&&c.voice===incoming.voice));assert.ok(a.looperData.playing);
});
