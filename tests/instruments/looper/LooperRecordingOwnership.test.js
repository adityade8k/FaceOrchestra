import test from 'node:test';
import assert from 'node:assert/strict';
import {InstrumentRegistry} from '../../../src/instruments/core/InstrumentRegistry.js';
import {LooperController} from '../../../src/instruments/looper/LooperController.js';
import {MetronomeConnectionManager} from '../../../src/instruments/metronome/MetronomeConnectionManager.js';
import {routeStickStrikeToLooperRecordings} from '../../../src/instruments/stick/StickLooperRecordingRouter.js';
import {disconnectShakenTarget,resolveShakeTarget} from '../../../src/xr/shakeDisconnect.js';
import {COMPOSITION as C} from '../../../src/tutorial/composition.js';

function setup() {
  const registry=new InstrumentRegistry();const input=new Map();
  const metro={id:'m',kind:'metronome',root:{visible:true},hasConnectionPort:()=>true,getBeatTiming:now=>({active:true,bpm:80,beatOriginMs:0,beatIntervalMs:750,beatPosition:now/750})};registry.add(metro);
  const manager=new MetronomeConnectionManager({registry,onConnectionRemoved:c=>{const h=registry.get(c.targetId);h?.looperController.handleClockDisconnected(h);}});
  const loopers=['chordLooper','percussionLooper'].map(id=>{
    const controller=new LooperController({getTimingForLooper:(id,now)=>manager.getTimingForLooper(id,now),captureActionByHonkId:id=>input.get(id)||null,isPlayableHonkId:id=>Boolean(registry.get(id))});
    const h={id,kind:'looper',root:{visible:true},looperController:controller,hitTargets:{}};
    h.looperData=controller.createStateData(h,{trackCount:6});h.tracks=h.looperData.tracks;
    for(const track of h.tracks)track.nodeTarget={visible:true};
    h.recordTrackDrumHit=(id,type,now)=>controller.recordTrackDrumHit(h,controller.getTrack(h,id),type,now);
    h.recordSelfDrumHit=(type,now)=>controller.recordSelfDrumHit(h,type,now);
    registry.add(h);return h;
  });
  const [chords,percussion]=loopers;
  for(const [i,h] of loopers.entries())manager.connect({metronomeId:'m',portId:`port-${i}`,targetKind:'looper',targetId:h.id,targetPortId:'track-5'});
  for(let i=0;i<5;i++){
    const honk={id:`h${i}`,kind:'honk',root:{visible:true}};registry.add(honk);
    const h=i===4?percussion:chords;h.looperController.connectTrackToHonk(h,i,honk.id);
  }
  chords.looperController.startRecording(chords,0);
  for(let i=0;i<4;i++) {
    input.set(`h${i}`,{squeeze:1,musicalOnset:true,bend:0.05});
    chords.looperController.updateRecordings([chords],i*3000+20);
    input.set(`h${i}`,{squeeze:0,musicalOnset:false,bend:0});
    chords.looperController.updateRecordings([chords],i*3000+2775);
  }
  chords.looperController.stopRecording(chords,11900);
  const runtime={metronomeConnectionManager:manager,
    getLooperConnectionsForHonk:h=>loopers.flatMap(looperState=>looperState.tracks.filter(t=>t.connectedHonkId===h.id).map(track=>({looperState,track}))),
    disconnectLooperTrack:(h,index)=>h.looperController.disconnectTrack(h,index)};
  return {registry,manager,chords,percussion,loopers,metro,runtime};
}
test('separate real recorder takes preserve chord ownership while metronome strikes fan out normally',()=>{
  const h=setup(),before=JSON.stringify(h.chords.looperData.timeline.toJSON());
  assert.equal(h.chords.looperData.timeline.durationMs,11755);
  h.percussion.looperController.startRecording(h.percussion,12000);
  const targets={percussion:h.registry.get('h4'),metronome:h.metro,percussionLooper:h.percussion};
  for(const hit of C.percussion)assert.equal(routeStickStrikeToLooperRecordings({event:{percussionType:hit.type,timestamp:12000+hit.beat*750+20},target:targets[hit.role],loopers:h.loopers,metronomeConnectionManager:h.manager,resolveInstrument:id=>h.registry.get(id)}),1);
  h.percussion.looperController.stopRecording(h.percussion,23900);
  const timeline=h.percussion.looperData.timeline;
  assert.equal(timeline.durationMs,11770);assert.equal(timeline.gapBeats,0);
  const hits=[...timeline.tracks.values()].flatMap(t=>t.events.filter(e=>e.type==='drumHit'));
  assert.equal(hits.length,12);for(const type of ['boink','metronomeWood','hihat'])assert.equal(hits.filter(h=>h.value===type).length,4);
  assert.ok([...timeline.tracks.values()].every(t=>!t.events.some(e=>e.type==='squeezeStart')));
  assert.equal(JSON.stringify(h.chords.looperData.timeline.toJSON()),before);
  h.percussion.looperController.clearRecording(h.percussion);
  assert.equal(JSON.stringify(h.chords.looperData.timeline.toJSON()),before,'retry percussion preserves Chords');
});
test('Looper shake removes only incoming clock; Honk shake removes only that source assignment',()=>{
  const h=setup(),before=JSON.stringify(h.chords.looperData.timeline.toJSON()),assignments=h.chords.tracks.map(t=>t.connectedHonkId);
  h.chords.looperController.startPlayback(h.chords,13000);assert.equal(h.chords.looperData.playArmed,true);
  assert.equal(disconnectShakenTarget(h.runtime,h.chords),true);
  assert.equal(h.chords.looperData.armed,false);assert.equal(h.chords.looperData.playing,false);
  assert.equal(h.manager.getConnectionForTarget('looper',h.chords.id),null);assert.ok(h.manager.getConnectionForTarget('looper',h.percussion.id));
  assert.deepEqual(h.chords.tracks.map(t=>t.connectedHonkId),assignments);assert.equal(JSON.stringify(h.chords.looperData.timeline.toJSON()),before);
  assert.equal(h.chords.looperController.getTimingForLooper(h.chords,14000).bpm,70);
  h.manager.connect({metronomeId:'m',portId:'port-0',targetKind:'looper',targetId:h.chords.id,targetPortId:'track-5'});
  const source=h.registry.get('h1'),wrapper={kind:'formation',source};
  const target=resolveShakeTarget({gripHeld:true,gripInstrumentState:wrapper,gripSourceInstrumentState:source});
  assert.equal(disconnectShakenTarget(h.runtime,target),true);
  assert.equal(h.chords.tracks[1].connectedHonkId,null);assert.equal(h.chords.tracks[0].connectedHonkId,'h0');
  assert.equal(h.percussion.tracks[4].connectedHonkId,'h4');assert.equal(h.manager.connectionsByPort.size,2);
  assert.equal(JSON.stringify(h.chords.looperData.timeline.toJSON()),before);
  h.chords.looperController.connectTrackToHonk(h.chords,1,'h1');
  assert.equal(JSON.stringify(h.chords.looperData.timeline.toJSON()),before);
  assert.equal(disconnectShakenTarget(h.runtime,h.metro),false);
});
