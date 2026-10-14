import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { definition as d } from "../../src/compositions/kuch.js";
import { normalizeMidi } from "../../scripts/midi/normalize.mjs";
import { validateKuchOrchestra, compileKuchPattern } from "../../src/tutorial/kuch-orchestra/score.js";
import { splitPatterns } from "../../src/compositions/BackingPatterns.js";
import { bendAt } from "../../src/compositions/jog/definition.js";
import { compositionRegistry } from "../../src/compositions/CompositionRegistry.js";
import { createHarness } from "../helpers/looperCaptureHarness.js";

const root = new URL("../../src/compositions/kuch-honk-orchestra/", import.meta.url);
const bytes = readFileSync(new URL(d.source.file, root));
const source = normalizeMidi(bytes).sequences[0].notes;
const approved = JSON.parse(readFileSync(new URL(d.authoredSource.file, root)));
const hash = value => createHash("sha256").update(value).digest("hex");
const tuple = e => [e.midi, e.beat, e.beats];
const sort = es => es.map(tuple).sort((a,b) => a[1]-b[1] || a[0]-b[0]);

test("approved version replaces Kuch in the catalog and keeps every original melody target", async () => {
  assert.equal(hash(bytes), d.source.sha256);
  assert.equal(hash(readFileSync(new URL(d.authoredSource.file, root))), d.authoredSource.sha256);
  const {contentHash, ...content} = d;
  assert.equal(hash(JSON.stringify(content)), contentHash);
  assert.equal(validateKuchOrchestra(d), d);
  assert.equal((await compositionRegistry.load(d.id)).definition, d);
  assert.equal(compositionRegistry.list().find(e => e.id === d.id).version, 7);
  assert.equal(d.bpm, 92); assert.equal(d.recording.bpm, 92);
  assert.equal(d.score.durationBeats, 192);
  assert.equal(d.score.events.length, 65);
  assert.equal(d.score.events.filter(e => e.bend).length, 36);
  assert.equal(d.contentVersion, 7); assert.equal(d.arrangement.version, 6);
  assert.deepEqual(d.lessons.slice(0, 6).map(l => l.eventIds.length), [10, 13, 8, 13, 8, 13]);
  assert.equal(approved.summary.fewerMelodyPresses, 19);
  assert.equal(d.previewOnly, undefined);
  const targets = d.score.events.flatMap(e => e.pitchTargets);
  assert.deepEqual(targets.map(t => [t.sourceId,t.midi,t.tick,t.endTick]),
    source.filter(n => n.track === 0).map(n => [n.id,n.midi,n.startTick,n.soundingEndTick]));
  for (const [i,e] of d.score.events.entries()) {
    const a = approved.score.events[i];
    assert.deepEqual(tuple(e),tuple(a)); assert.deepEqual(e.bend,a.bend);
    for (const target of e.pitchTargets)
      assert.ok(Math.abs(e.midi+bendAt(e.bend,(target.beat-e.beat)/e.beats)-target.midi)<1e-8);
  }
  assert.deepEqual(d.lessons.slice(0,6).flatMap(l=>l.eventIds),d.score.events.map(e=>e.id));
});

test("only the melody is live; all four backing parts preserve approved source timing", () => {
  const back=d.arrangement.backing;
  assert.equal(back.length,1087);
  assert.ok(back.every(e=>!e.role.startsWith('lead-')));
  assert.ok(d.score.events.every(e=>e.part==='melody'));
  for(const [part,track,count] of [['hihat',2,213],['percussion',3,289]]) {
    const events=back.filter(e=>e.part===part);
    assert.equal(events.length,count);
    assert.deepEqual(events.map(e=>e.beat),source.filter(n=>n.track===track).map(n=>n.beat));
    assert.ok(events.every(e=>e.sound===(part==='hihat'?'hihat':'boink')));
  }
  assert.deepEqual(sort(back.filter(e=>e.part==='flute')),sort(source.filter(n=>n.track===6)));
  assert.deepEqual(sort(back.filter(e=>e.part==='chords')),sort(source.filter(n=>n.track===4)));
  assert.equal(back.filter(e=>e.part==='flute').length,90);
  assert.equal(back.filter(e=>e.part==='chords').length,495);
});

test("all backing notes compile to real Looper gates, stick events and normal vowel controls", () => {
  let hats=0,boinks=0,notes=0;
  for(const block of d.arrangement.blocks)for(const pattern of block.patterns){
    const f=createHarness({connected:true});f.clock.beatIntervalMs=60000/d.bpm;
    const roles=[...new Set(pattern.events.map(e=>e.role))];let index=1;
    const routes=Object.fromEntries(roles.map(role=>[role,role==='hihat'?{trackId:'looper-self-percussion'}:{trackId:`track-${index}`,trackIndex:index++}]));
    assert.ok(index<=8);
    const timeline=compileKuchPattern(pattern,routes,d.bpm);
    f.controller.restoreState(f.looper,{timeline:timeline.toJSON(),controls:{recordBeats:pattern.beats,gap:-1}},{preserveConnections:true});
    for(const e of pattern.events){
      const track=f.timeline.getTrack(routes[e.role].trackId),at=e.beat*f.clock.beatIntervalMs;
      if(e.sound){
        assert.ok(track.events.some(n=>n.type==='drumHit'&&n.value===e.sound&&Math.abs(n.timeMs-at)<1e-7));
        if(e.sound==='hihat')hats++;else boinks++;
      }else{
        notes++;
        assert.ok(track.events.some(n=>n.type==='squeezeStart'&&Math.abs(n.timeMs-at)<1e-7));
        assert.ok(track.events.some(n=>n.type==='squeezeEnd'&&Math.abs(n.timeMs-(e.beat+e.beats)*f.clock.beatIntervalMs)<1e-7));
        const snapshot=track.events.find(n=>n.type==='gestureSnapshot'&&Math.abs(n.timeMs-at)<1e-7);
        assert.equal(snapshot.values.vowel,e.part==='chords'?'O':'A');
      }
    }
    if(f.timeline.hasRecording())assert.ok(f.controller.armPlayback(f.looper,0,f.controller.getTimingForLooper(f.looper,0),{targetBeat:4}));
    f.controller.stopPlayback(f.looper);
  }
  assert.deepEqual([hats,boinks,notes],[213,289,585]);
});

test("each practice excerpt has lossless backing windows without automatic melody", () => {
  for(const l of d.lessons){
    const blocks=splitPatterns(d.arrangement.backing,l.startBeat,l.endBeat);
    assert.ok(blocks.length);
    for(const b of blocks)for(const p of b.patterns)for(const e of p.events){
      assert.ok(e.beat>=0 && e.beat+e.beats<=b.beats+1e-9);
      assert.notEqual(e.part,'melody');
    }
  }
});

test("contract rejects accidental automatic melody, changed synths and invalid bends", () => {
  for(const mutate of [
    v=>v.arrangement.backing[0].role='lead-64',
    v=>v.score.events.find(e=>e.bend).bend[2].semitones=5,
    v=>v.arrangement.recipes[0].voice='replacement',
    v=>v.score.events.find(e=>e.id==='t0-e78').bend.at(-1).semitones=-6,
    v=>delete v.score.events.find(e=>e.id==='t0-e78').pitchBendRange,
    v=>delete v.arrangement.recipes.find(r=>r.role==='lead-67').pitchBendRange,
    v=>v.pitchBendRange=4,
    v=>v.requirements.maxLiveVoices=2,
    v=>v.arrangement.backing.find(e=>e.part==='flute').midi++,
  ]) {const v=structuredClone(d);mutate(v);assert.throws(()=>validateKuchOrchestra(v));}
});


test("phrases 2, 4 and 6 share two continuous holds instead of three", () => {
  for (const [first, joined, second, beat] of [
    ["t0-e78", "t0-e92", "t0-e98", 43],
    ["t0-e210", "t0-e224", "t0-e230", 99],
    ["t0-e344", "t0-e358", "t0-e364", 155],
  ]) {
    const i = d.score.events.findIndex(e => e.id === first), e = d.score.events[i], next = d.score.events[i + 1];
    assert.equal(next.id, second);
    assert.ok(e.sourceIds.includes(joined));
    assert.ok(!d.score.events.some(e => e.id === joined));
    assert.ok(d.lessons.every(l => !l.eventIds.includes(joined)));
    assert.equal(e.beat, beat);
    assert.ok(Math.abs(e.beats - 4.747916666666667) < 1e-10);
    assert.equal(e.pitchBendRange, 5); assert.equal(e.midi, 67);
    assert.equal(e.bend.at(-1).semitones, -5);
    assert.deepEqual(e.pitchTargets.map(t => t.midi), [67,66,64,64,69,64,66,66,64,62]);
    assert.deepEqual(next.pitchTargets.map(t => t.midi), [59,57,57]);
    assert.equal(next.beat, beat + 4.75);
  }
  assert.deepEqual(d.arrangement.recipes.filter(r => r.pitchBendRange === 5).map(r => r.role), ["lead-67"]);
});
