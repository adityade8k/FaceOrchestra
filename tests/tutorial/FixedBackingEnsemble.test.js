import test from 'node:test';
import assert from 'node:assert/strict';
import { definition as kuch } from '../../src/compositions/kuch.js';
import { definition as rishte } from '../../src/compositions/rishte.js';
import { FixedBackingEnsemble } from '../../src/tutorial/FixedBackingEnsemble.js';
import { resolveLessonSequence } from '../../src/compositions/LessonSequence.js';
import { fixedBackingPlan } from '../../src/compositions/FixedBackingPlan.js';
import { backingFixture } from '../helpers/backingFixture.js';
import { cueCanvas } from '../helpers/cueCanvas.js';

const snapshot = e => e.loopers.map(h => JSON.stringify([h.timeline.toJSON(),h.tracks.map(t=>t.connectedHonkId),e.identity(h)]));
const frame = (e, now) => {
  for(const h of e.loopers) {
    h.looperController.updateClockedTransports([h],now);
    h.looperController.updatePlaybackForLooper(h,now);
  }
  e.update(now);
};
for(const d of [kuch,rishte]) test(`${d.id}: fixed takes and routes play every phrase, compact sequence and full performance`,()=>{
  const old=globalThis.document;globalThis.document={createElement:cueCanvas};
  const f=backingFixture(d),e=new FixedBackingEnsemble(f,d),beatMs=60000/d.bpm;
  try {
    e.prepare();
    assert.equal(e.loopers.length,d.id==='kuch-to-hua-hai'?21:22);
    assert.equal(new Set([...f.wires.values()].map(w=>w.portId)).size,2);
    let initial;
    for(const lesson of d.lessons){
      const {definition,lesson:part}=resolveLessonSequence(d,lesson);
      e.prepareAttempt({startBeat:part.startBeat,endBeat:part.endBeat,backing:definition.arrangement.backing});
      initial=snapshot(e);
      e.schedule({countAt:0,beatZero:4*beatMs,wallNow:0,audioNow:0,bpm:d.bpm,startBeat:part.startBeat,endBeat:part.endBeat,
        events:definition.score.events,backing:definition.arrangement.backing});
      for(let offset=0;offset<part.endBeat-part.startBeat;offset+=.125){
        const now=(offset+4)*beatMs,beat=part.startBeat+offset;
        frame(e,now);
        const block=e.blocks.find(b=>beat>=b.beat-1e-9&&beat<b.beat+b.beats-1e-9);
        if(block)for(let lane=0;lane<2;lane++){
          const playing=e.loopers.filter(h=>h.transport.playing&&f.wires.get(h.id).portId===`port-${lane}`);
          assert.deepEqual(playing.map(h=>h.id),block.patterns[lane]?[block.patterns[lane]]:[],`${lesson.id} beat ${beat} lane ${lane}`);
        }
        assert.deepEqual(snapshot(e),initial,'No take, routes or recording revision changes during playback');
      }
      frame(e,(part.endBeat-part.startBeat+4)*beatMs);
      assert.equal(e.anchor,null);assert.equal(e.stoppedBeat,part.endBeat);
      assert.ok(e.loopers.every(h=>!h.transport.playing&&!h.looperData.pendingLaunch&&!h.looperData.queued));
      assert.deepEqual(snapshot(e),initial);
    }
    e.prepareAttempt();
    e.schedule({countAt:0,beatZero:4*beatMs,wallNow:0,audioNow:0});
    for(let beat=0;beat<d.score.durationBeats&&!e.loopers.some(h=>h.looperData.queued);beat+=.125)frame(e,(beat+4)*beatMs);
    assert.ok(e.loopers.some(h=>h.looperData.queued),'A real shared-output handoff is queued');
    e.cancel();assert.ok(e.loopers.every(h=>!h.transport.playing&&!h.looperData.pendingLaunch));
    e.schedule({countAt:0,beatZero:4*beatMs,wallNow:0,audioNow:0});
    const changed=e.loopers[0];changed.looperController.clearRecording(changed);
    const replacement=JSON.stringify(changed.timeline.toJSON());
    assert.throws(()=>e.update(4*beatMs),/recording activity/);
    assert.equal(e.anchor,null);assert.equal(JSON.stringify(changed.timeline.toJSON()),replacement);
    assert.throws(()=>e.schedule({countAt:0,beatZero:4*beatMs,wallNow:0,audioNow:0}),/preserved/);
  }finally{e.dispose();globalThis.document=old;}
});
for(const d of [kuch,rishte]) test(`${d.id}: actual Looper audio preserves all attacks, releases and silent boundaries`,()=>{
  const old=globalThis.document;globalThis.document={createElement:cueCanvas};
  const f=backingFixture(d),e=new FixedBackingEnsemble(f,d),beatMs=60000/d.bpm;
  try {
    e.prepare();
    for(const lesson of d.lessons){
      const {definition,lesson:part}=resolveLessonSequence(d,lesson);
      e.prepareAttempt({startBeat:part.startBeat,endBeat:part.endBeat,backing:definition.arrangement.backing});
      f.audioCalls.length=0;
      e.schedule({countAt:0,beatZero:4*beatMs,wallNow:0,audioNow:0,bpm:d.bpm,startBeat:part.startBeat,endBeat:part.endBeat,
        events:definition.score.events,backing:definition.arrangement.backing});
      const length=part.endBeat-part.startBeat;
      for(let i=0;i<=Math.ceil((length+4)*40);i++){
        const now=i/40*beatMs;
        for(const h of e.loopers){const c=h.looperController;c.updateClockedTransports([h],now);c.schedulePlaybackAudioForLooper(h,now);c.updatePlaybackForLooper(h,now);}
        e.update(now);
      }
      const attacks=f.audioCalls.filter(c=>['start','drum'].includes(c.kind)&&Number.isFinite(c.scheduledTime));
      const expected=definition.arrangement.backing.filter(n=>n.beat<part.endBeat&&n.beat+n.beats>part.startBeat);
      assert.equal(attacks.length,expected.length,`${lesson.id}: no dropped, repeated or silent-boundary attacks`);
      for(const role of new Set(expected.map(n=>n.role))){
        const source=expected.filter(n=>n.role===role).sort((a,b)=>a.beat-b.beat);
        const actual=attacks.filter(n=>n.role===role||n.kind==='drum'&&n.sound===source[0].sound).sort((a,b)=>a.scheduledTime-b.scheduledTime);
        assert.equal(actual.length,source.length,role);
        for(const [i,n] of source.entries()){
          const beat=(actual[i].scheduledTime*1000/beatMs)-4+part.startBeat;
          assert.ok(Math.abs(beat-Math.max(n.beat,part.startBeat))<1e-7,`${lesson.id}: ${role} attack ${beat} vs ${n.beat}`);
          if(n.sound)continue;
          const release=f.audioCalls.find(c=>c.kind==='release'&&c.id===actual[i].id&&Number.isFinite(c.scheduledTime));
          assert.ok(release,`${role}: recorded release`);
          assert.ok(Math.abs(release.scheduledTime*1000/beatMs-4+part.startBeat-Math.min(n.beat+n.beats,part.endBeat))<1e-7,`${lesson.id}: ${role} release`);
          assert.equal(release.origin,'controller');
          if(d.id==='kuch-to-hua-hai'){
            const expression=f.audioCalls.find(c=>c.kind==='expression'&&c.id===actual[i].id);
            assert.equal(expression.snapshot.vowel,n.part==='chords'?'O':'A');
            assert.equal(expression.snapshot.nose,n.part==='chords'?.6:.1);
          }
        }
      }
    }
  } finally {e.dispose();globalThis.document=old;}
});
test('route, clock, and transport-control edits interrupt backing without restoring over them',()=>{
 const old=globalThis.document;globalThis.document={createElement:cueCanvas};
 try{
  for(const edit of [
   (h,f)=>h.tracks.find(t=>t.connectedHonkId!=null).connect('learner-replacement'),
   (h,f)=>{f.wires.get(h.id).portId='port-3';},
   h=>h.looperController.setControlValue(h,'gap',1),
   h=>h.looperController.setControlValue(h,'volume',.2),
  ]){
   const f=backingFixture(kuch),e=new FixedBackingEnsemble(f,kuch);e.prepare();
   e.schedule({countAt:0,beatZero:2600,wallNow:0,audioNow:0});
   const h=e.loopers.find(h=>h.tracks.some(t=>t.connectedHonkId!=null));edit(h,f);const changed=e.identity(h),take=JSON.stringify(h.timeline.toJSON());
   assert.throws(()=>e.update(2700),/preserved/);
   assert.equal(e.identity(h),changed);assert.equal(JSON.stringify(h.timeline.toJSON()),take);
   assert.ok(e.loopers.every(h=>!h.transport.playing&&!h.looperData.pendingLaunch&&!h.looperData.queued));
   assert.throws(()=>e.prepareAttempt(),/preserved/);e.dispose();
  }
 }finally{globalThis.document=old;}
});
