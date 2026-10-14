import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { Group, Scene, Vector3 } from "three";
import { definition } from "../../src/compositions/nazariya-honk-bends.js";
import { normalizeMidi } from "../../scripts/midi/normalize.mjs";
import { compositionRegistry, libraryPage } from "../../src/compositions/CompositionRegistry.js";
import { validateLiveMelody } from "../../src/tutorial/live-melody/score.js";
import { assessMelody, MelodyGuidance } from "../../src/compositions/MelodyScore.js";
import { MelodyHands } from "../../src/tutorial/MelodyHands.js";
import { bendGaugeState } from "../../src/tutorial/bendGaugeState.js";
import { bendAt, tuningForMidi } from "../../src/compositions/jog/definition.js";
import { BEND_SENSITIVITY, MAX_PITCH_BEND_SEMITONES } from "../../src/config/honk.js";
import { HonkVoice } from "../../src/audio/honk/HonkVoice.js";
import { FORMANTS } from "../../src/audio/honk/formantData.js";
import { VOICE_GAIN_SETTINGS, HONK_NOTE_GAIN_SETTINGS } from "../../src/config/audio.js";
import { fixture, flushAudio } from "../support/manualHonkFixture.mjs";

const root = new URL("../../src/compositions/nazariya-honk-bends/", import.meta.url);
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
test("the app exactly matches the approved 70 BPM screenshot preview and preserves historical sources", () => {
  const bytes = readFileSync(new URL(`${definition.source.sha256}.mid`, root));
  assert.equal(hash(bytes), definition.source.sha256);
  assert.equal(normalizeMidi(bytes).sequences[0].notes.length, 61);
  const approvedBytes = readFileSync(new URL(definition.authoredSource.file, root));
  assert.equal(hash(approvedBytes), definition.authoredSource.sha256);
  assert.equal(hash(approvedBytes), definition.authoredSource.sourcePreview.sha256);
  const approved = JSON.parse(approvedBytes);
  const events = definition.score.events;
  assert.equal(events.length, 58);
  assert.equal(events.filter(e => e.bend).length, 26);
  for (const [i,e] of events.entries()) {
    const { sourceIds, ...previewEvent } = e;
    assert.deepEqual(previewEvent, approved.score.events[i], "Import exact gates, targets and curves");
    assert.deepEqual(sourceIds, [e.id]);
    if (e.bend) assert.equal(e.articulation, "continuous-bend");
  }
  assert.equal(definition.bpm, approved.bpm);
  assert.equal(definition.score.durationBeats, approved.score.durationBeats);
  assert.ok(Math.abs(definition.score.durationSeconds - approved.score.durationSeconds) < 1e-9);
  assert.ok(Math.abs(definition.score.durationSeconds - 53.19106971647718) < 1e-9);
  const { contentHash, ...content } = definition;
  assert.equal(hash(JSON.stringify(content)), contentHash);
  const normalized = JSON.parse(readFileSync(new URL(definition.normalizedSource.file, root)));
  assert.equal(hash(JSON.stringify(normalized)), definition.normalizedSource.sha256);
});

test("every screenshot pitch target survives and natural contours use one hold", () => {
  const source = definition.authoredSource.sourceScreenshots;
  const bytes = readFileSync(new URL(source.file, root));
  assert.equal(hash(bytes), source.sha256);
  const notes = JSON.parse(bytes).notes;
  assert.equal(notes.length, 135);
  assert.deepEqual(definition.score.events.flatMap(e => e.screenshotNoteIds), notes.map(n => n.id));
  assert.deepEqual(definition.score.events.flatMap(e => e.pitchTargets), notes.map(n => ({
    sourceId: n.id, midi: n.pitch, beat: n.start, endBeat: n.end,
  })));
  for (const e of definition.score.events) {
    assert.equal(e.beat, notes[e.screenshotNoteIds[0]].start);
    assert.ok(Math.abs(e.beat + e.beats - notes[e.screenshotNoteIds.at(-1)].end) < 1e-9);
    for (const target of e.pitchTargets) {
      const pitch = e.midi + (e.bend ? bendAt(e.bend, (target.beat-e.beat)/e.beats) : 0);
      assert.ok(Math.abs(pitch-target.midi) < 1e-8, `Target ${target.sourceId} must sound at its recovered beat`);
    }
  }
  const first = definition.score.events.slice(0,3);
  assert.deepEqual(first.map(e => e.screenshotNoteIds), [[0],[1],[2]], "Opening taps remain distinct");
  const previous = JSON.parse(readFileSync(new URL(definition.authoredSource.sourceCompositionFile, root)));
  assert.deepEqual(definition.arrangement.recipes, previous.arrangement.recipes);
  assert.deepEqual(definition.lessons.slice(0,-1).map(l => l.eventIds.length), [7,11,7,7,8,7,11]);
  for (const lesson of definition.lessons) {
    for (const event of definition.score.events.filter(e => lesson.eventIds.includes(e.id))) {
      assert.ok(event.beat >= lesson.startBeat);
      assert.ok(event.beat + event.beats <= lesson.endBeat + 1e-9, "A lesson cannot cut a continuous hold");
    }
  }
});

test("seven short phrases cover every squeeze and both libraries load the full performance", async () => {
  assert.equal(validateLiveMelody(definition), definition);
  assert.equal(definition.bpm,70);
  assert.equal(definition.practiceBpm,70);
  assert.equal(definition.maxBpm,70);
  assert.equal(definition.recording.bpm,70);
  assert.equal(definition.contentVersion,5);
  assert.equal(definition.requirements.maxHonks,10);
  assert.equal(definition.requirements.maxLiveVoices,1);
  assert.equal(definition.lessons.length,8);
  assert.deepEqual(definition.lessons.slice(0,-1).flatMap(l=>l.eventIds),definition.score.events.map(e=>e.id));
  assert.deepEqual(definition.lessons.at(-1).eventIds,definition.score.events.map(e=>e.id));
  assert.equal((await compositionRegistry.load(definition.id)).definition,definition);
  for (const mode of ["tutorials","record-songs"]) {
    const rows = Array.from({length:libraryPage(compositionRegistry,mode).pages},(_,i)=>libraryPage(compositionRegistry,mode,i).rows).flat();
    assert.ok(rows.some(r=>r.id===definition.id && r.version===definition.contentVersion));
  }
  for (const mutate of [
    d=>{d.score.events.find(e=>e.bend).bend[2].semitones=5;},
    d=>{d.score.events.find(e=>e.bend).bend[1].fraction=0;},
    d=>{delete d.lessons[0].assessment.bendCents;},
    d=>{d.score.events[1].beat=d.score.events[0].beat;d.score.events[1].hand="L";},
    d=>{const e=d.score.events.find(e=>e.bend);e.sourceIds.push("extra");delete e.articulation;},
    d=>{d.score.events[3].sourceIds.push(d.score.events[0].id);},
    d=>{d.score.events[3].sourceIds.push(d.score.events[3].sourceIds[0]);},
    d=>{const e=d.score.events.find(e=>e.bend);e.sourceIds.push("extra");delete e.bend;},
  ]) {
    const bad=structuredClone(definition);mutate(bad);assert.throws(()=>validateLiveMelody(bad));
  }
});

test("practice requires bends, accepts either hand and never credits demonstration", () => {
  const bpm=definition.bpm, beatMs=60000/bpm, lesson=definition.lessons.at(-1);
  const heard=definition.score.events.map(e=>({origin:"learner",kind:"note",released:true,voiced:true,
    midis:[e.midi],hand:"L",startMs:e.beat*beatMs,endMs:(e.beat+e.beats)*beatMs,
    bendSamples:(e.bend||[]).map(p=>({offsetMs:p.fraction*e.beats*beatMs,semitones:p.semitones}))}));
  const assess=value=>assessMelody(definition,lesson,value,t=>t/beatMs);
  assert.equal(assess(heard).ok,true);
  assert.equal(assess(heard.map(e=>({...e,bendSamples:[]}))).correct,32);
  assert.equal(assess(heard.map(e=>({...e,bendSamples:e.bendSamples.map(p=>({...p,semitones:0}))}))).correct,32);
  assert.equal(assess(heard.map(e=>({...e,origin:"demonstration"}))).correct,0);
});

test("Nazariya rejects changes to the original Honk voice in its instrument recipes", () => {
  for (const key of ["vowel", "nose", "gain", "envelope", "waveform", "voice", "sample", "audioUrl"]) {
    const bad = structuredClone(definition);
    bad.arrangement.recipes[0][key] = "replacement";
    assert.throws(() => validateLiveMelody(bad), /sound override/);
  }
});

for (const origin of ["learner", "demonstration"])
  test(`${origin} plays Nazariya bends on the ordinary HonkVoice without retriggering or changing its tone`, async () => {
    for (const event of definition.score.events.filter(e => e.bend)) {
      const f = fixture(), h = f.honks[0], controller = f.controllers[0];
      h.applyTuning(tuningForMidi(event.midi));
      controller.userData.tutorialOrigin = origin;
      f.press(); f.frame(); await flushAudio(); f.frame();
      const voice = f.audio.voices.get("left:h0");
      assert.ok(voice instanceof HonkVoice);
      assert.equal(voice.source.type, "sawtooth");
      assert.equal(voice.vowel, "A");
      assert.deepEqual(voice.formantNodes.map(n => n.filter.frequency.value), FORMANTS.A.freq);
      assert.deepEqual(voice.formantNodes.map(n => n.gain.gain.value), FORMANTS.A.gain);
      assert.equal(voice.toneFilter.frequency.events[0].value, VOICE_GAIN_SETTINGS.toneLowpassFrequency);
      assert.equal(voice.master.gain.events.at(-1).constant, HONK_NOTE_GAIN_SETTINGS.smoothingSeconds);
      assert.ok(Math.abs(voice.source.frequency.events.at(-1).value - 440*2**((event.midi-69)/12)) < .01);
      for (const point of event.bend) {
        controller.roll = point.semitones/MAX_PITCH_BEND_SEMITONES;
        for (let i=0;i<12;i++) f.frame(20);
        assert.equal(f.audio.voices.get("left:h0"), voice, "All bend sections retain the same voice");
      }
      assert.ok(voice.source.detune.events.some(e => Math.abs(e.value) > 50), "Original voice receives wrist bends");
      assert.equal(f.counters.starts, 1);
      f.release(); f.frame();
      assert.equal(f.audio.voices.size, 0);
    }
  });

test("joined bend sections use one demonstration press and one sustained guided cue", () => {
  const controller=new Group(), second=new Group(), scene=new Scene(), h={root:new Group(),squeezeCollider:{},
    isPlayable:()=>true,getSqueezeColliderSphere:()=>({center:new Vector3(),radius:.2})};
  const states=new Map([[controller,{trigger:false}],[second,{trigger:false}]]), transitions=[];
  const adapter={virtuals:[controller,second],layoutRotation:h.root.quaternion,get:()=>h,input:(c,button,value)=>{
    if (states.get(c)[button] !== value) transitions.push(value);
    states.get(c)[button]=value;
  },park:c=>c.quaternion.identity(),observe(){}};
  const r={scene,controllerStates:states,getCurrentHit:()=>({object:h.squeezeCollider}),updateHorn(){}};
  const hands=new MelodyHands({a:adapter,r,definition});
  let beat;
  const guide=new MelodyGuidance({a:{get:()=>({bpm:definition.bpm})},beatAt:()=>beat},definition);
  for (const event of definition.score.events.filter(e=>e.articulation==="continuous-bend")) {
    transitions.length=0;
    const stepCount=Math.ceil(event.beats*100);
    for(let i=0;i<stepCount;i++) {
      beat=event.beat+event.beats*i/stepCount;
      hands.play([event],beat,beat*60000/definition.bpm);
      assert.equal(states.get(controller).trigger,true);
      assert.equal(guide.model(0).transport,"Hold, then release");
      assert.equal(guide.step.events.find(e=>beat>=e.beat && beat<e.beat+e.beats).id,event.id);
    }
    assert.deepEqual(transitions,[true],"No release or new press between bend sections");
    hands.play([event],event.beat+event.beats,0);
    assert.deepEqual(transitions,[true,false]);
  }
  hands.dispose();
});

test("bend indicators reverse direction inside a held note, including a return to neutral", () => {
  const event={midi:61,bendStyle:"melody",bend:[
    {fraction:0,semitones:0},{fraction:.2,semitones:0},{fraction:.4,semitones:3},
    {fraction:.6,semitones:3},{fraction:.8,semitones:0},{fraction:1,semitones:0},
  ]};
  const up=bendGaugeState(event,.3,{semitones:1.5}),down=bendGaugeState(event,.7,{semitones:1.5});
  assert.equal(up.direction,"up");assert.equal(up.destinationSemitones,3);assert.equal(up.status,"On target");
  assert.equal(down.direction,"down");assert.equal(down.destinationSemitones,0);assert.equal(down.status,"On target");
  assert.equal(bendGaugeState(event,.7,{semitones:4}).status,"Wrong direction");
  assert.equal(bendGaugeState(event,.95,{semitones:0}).phase,"settle");
  const note=definition.score.events.find(e=>e.bend);
  const ensemble={a:{get:()=>({bpm:definition.bpm})},beatAt:()=>note.beat+note.beats*.5};
  const guide=new MelodyGuidance(ensemble,definition);
  assert.ok(guide.step.events.find(e=>e.id===note.id).bend);
  assert.match(guide.model(0).feedback,/Triangle: target bend/);
  assert.doesNotMatch(guide.model(0).feedback,/Keep your wrist neutral|over the backing/);
});

test("demonstration bends the real controller ray relative to the Honk and resets on the next attack", () => {
  const controller=new Group(), second=new Group(), scene=new Scene(), h={root:new Group(),squeezeCollider:{},
    isPlayable:()=>true,getSqueezeColliderSphere:()=>({center:new Vector3(),radius:.2})};
  h.root.rotation.y=.35;
  const states=new Map([[controller,{trigger:false}],[second,{trigger:false}]]);
  const adapter={virtuals:[controller,second],get:()=>h,input:(c,button,value)=>{states.get(c)[button]=value;},
    park:c=>c.quaternion.identity(),observe(){}};
  const r={scene,controllerStates:states,getCurrentHit:()=>({object:h.squeezeCollider}),updateHorn(){}};
  const hands=new MelodyHands({a:adapter,r,definition:{score:{events:[]},arrangement:{recipes:[]}}});
  const events=[{id:"a",hand:"R",role:"x",beat:0,beats:2,bend:[{fraction:0,semitones:0},{fraction:1,semitones:3}]},
    {id:"b",hand:"R",role:"x",beat:3,beats:1}];
  hands.play(events,0,0);hands.play(events,1,1000);
  const delta=h.root.quaternion.clone().invert().multiply(controller.quaternion);
  assert.ok(Math.abs(2*Math.atan2(delta.z,delta.w)-1.5/MAX_PITCH_BEND_SEMITONES/BEND_SENSITIVITY)<1e-8);
  hands.play(events,3,3000);
  assert.ok(controller.quaternion.angleTo(h.root.quaternion)<1e-6);
  hands.dispose();
});
