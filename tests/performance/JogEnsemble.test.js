import test from 'node:test';
import assert from 'node:assert/strict';
import { jogTimeline, JogEnsemble } from '../../src/performance/JogEnsemble.js';
import { COMPOSITION as C } from '../../src/tutorial/composition.js';
import { LooperTimeline } from '../../src/instruments/looper/timeline/LooperTimeline.js';
import { createHarness } from '../helpers/looperCaptureHarness.js';

const routes={chords:Object.fromEntries(C.backing.map((g,i)=>[g.role,{trackId:`track-${i}`,trackIndex:i}])),alternatives:{'group-1':{trackId:'track-0',trackIndex:0}},percussion:{percussion:{trackId:'track-1',trackIndex:1},metronome:{trackId:'track-0',trackIndex:0},percussionLooper:{trackId:'looper-self-percussion',trackIndex:null}}};
test('canonical recorded accompaniment round-trips with all gates, releases, timbre and percussion on real lanes',()=>{
  for(const role of ['chordLooper','alternativeLooper','percussionLooper']) {
    const timeline=LooperTimeline.fromJSON(jogTimeline(role,routes).toJSON());
    assert.ok(timeline.hasRecording());assert.equal(timeline.durationMs,16*C.beatMs);assert.equal(timeline.sourceBeatIntervalMs,750);
    if(role==='percussionLooper') {
      const events=timeline.getDrumHitEventsBetween(0,timeline.durationMs,{includeStart:true});
      assert.equal(events.length,12);
      for(const e of C.percussion){const track=timeline.getTrack(routes.percussion[e.role].trackId);const hit=track.events.find(x=>x.timeMs===e.beat*C.beatMs);assert.equal(hit.value,e.type);assert.ok(hit.durationMs>0);}
    }else {
      const pattern=role==='chordLooper'?C.backing:C.alternateBacking;
      for(const e of pattern) {
        const track=timeline.getTrack((role==='chordLooper'?routes.chords:routes.alternatives)[e.role].trackId);
        assert.ok(track.events.some(x=>x.type==='squeezeStart'&&x.timeMs===e.beat*C.beatMs));
        assert.ok(track.events.some(x=>x.type==='squeezeEnd'&&x.timeMs===(e.beat+e.beats)*C.beatMs));
        const sample=timeline.sampleTrack(track,(e.beat+.5)*C.beatMs,{});assert.equal(sample.squeeze,1);assert.equal(sample.vowel,C.backingVowel);assert.equal(sample.nose,C.backingNose);assert.equal(sample.bend,0);
        assert.equal(timeline.sampleTrack(track,(e.beat+e.beats+.01)*C.beatMs,{}).squeeze,0);
      }
    }
  }
});

test('real looper transport reset clears pending starts and voices without changing recordings or placement',()=>{
  const h=createHarness({connected:true});h.clock.beatIntervalMs=C.beatMs;
  h.looper.root.position={x:1,y:2,z:3};h.looper.stop=()=>h.controller.stopPlayback(h.looper);
  h.controller.restoreState(h.looper,{timeline:jogTimeline('chordLooper',routes).toJSON(),controls:{gap:-1}},{preserveConnections:true});
  const before=JSON.stringify(h.timeline.toJSON()),position={...h.looper.root.position};
  h.controller.armPlayback(h.looper,0,h.controller.getTimingForLooper(h.looper,0),{targetBeat:4});
  assert.ok(h.looper.looperData.pendingLaunch);
  let released=false;const metro={pause(){},beatOriginMs:100};
  const ensemble=new JogEnsemble({r:{},adapter:{get:role=>role==='metronome'?metro:role==='chordLooper'?h.looper:null,releaseAll(){released=true;}}});ensemble.prepared=true;
  ensemble.reset();assert.equal(h.looper.looperData.pendingLaunch,null);assert.equal(h.looper.looperData.transport.playing,false);assert.equal(metro.beatOriginMs,null);assert.equal(released,true);
  assert.equal(JSON.stringify(h.timeline.toJSON()),before);assert.deepEqual(h.looper.root.position,position);
});
