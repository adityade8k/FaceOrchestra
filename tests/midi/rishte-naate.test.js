import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { parseMidi } from "midi-file";
import { MidiScorePlayer } from "../../src/compositions/MidiScorePlayer.js";
import { validateMidiPerformance, melodyDefinition } from "../../src/compositions/MidiPerformance.js";
import { getHonkFrequency } from "../../src/audio/honk/pitch.js";
import { compositionRegistry } from "../../src/compositions/CompositionRegistry.js";
import { DataGuidance } from "../../src/compositions/DataEnsemble.js";

const root = new URL("../../src/compositions/rishte-naate/", import.meta.url);
const definition = JSON.parse(readFileSync(new URL("composition.json", root)));
const bytes = readFileSync(new URL(`${definition.source.sha256}.mid`, root));

// Independent source-event walk (does not call normalizeMidi or the arranger).
function sourceNotes() {
  const midi = parseMidi(bytes), notes = [], held = new Map(), sounding = new Set(), pedal = new Set();
  let tick = 0, tempo = 500000;
  for (const [index, e] of midi.tracks[0].entries()) {
    tick += e.deltaTime;
    if (e.type === "setTempo") { assert.equal(tick, 0); tempo = e.microsecondsPerBeat; }
    const key = `${e.channel}:${e.noteNumber}`;
    if (e.type === "noteOn" && e.velocity) {
      const n = { id: `t0-e${index}`, midi: e.noteNumber, velocity: e.velocity, startTick: tick, channel: e.channel };
      const queue = held.get(key) || []; queue.push(n); held.set(key, queue);
      notes.push(n); sounding.add(n);
    } else if (e.type === "noteOff" || (e.type === "noteOn" && !e.velocity)) {
      const n = held.get(key)?.shift(); assert.ok(n);
      n.releaseTick = tick;
      if (!pedal.has(e.channel)) { n.soundingEndTick = tick; sounding.delete(n); }
    } else if (e.type === "controller" && e.controllerType === 64) {
      if (e.value >= 64) pedal.add(e.channel);
      else {
        pedal.delete(e.channel);
        for (const n of sounding) if (n.channel === e.channel && n.releaseTick !== undefined) {
          n.soundingEndTick = tick; sounding.delete(n);
        }
      }
    }
  }
  assert.equal(sounding.size, 0);
  return notes.map(n=>({ ...n, startSeconds: n.startTick / midi.header.ticksPerBeat * tempo / 1e6,
    releaseSeconds: n.releaseTick / midi.header.ticksPerBeat * tempo / 1e6,
    endSeconds: n.soundingEndTick / midi.header.ticksPerBeat * tempo / 1e6 }));
}

test("rishte naate preserves every binary MIDI attack, velocity, key release and pedal end", () => {
  assert.equal(createHash("sha256").update(bytes).digest("hex"), definition.source.sha256);
  const source = sourceNotes();
  assert.equal(source.length, 296);
  assert.equal(definition.score.events.length, source.length);
  for (const [i, n] of source.entries()) {
    const e = definition.score.events[i];
    for (const field of ["id", "midi", "velocity", "startTick", "releaseTick", "soundingEndTick"]) assert.equal(e[field], n[field]);
    for (const field of ["startSeconds", "releaseSeconds", "endSeconds"]) assert.ok(Math.abs(e[field] - n[field]) < 1e-10);
  }
  assert.equal(definition.score.durationSeconds, 74.046177140625);
  assert.equal(definition.arrangement.exclusions.length, 0);
  assert.equal(validateMidiPerformance(definition), definition);
  assert.deepEqual(compositionRegistry.list().map(e=>e.id), ["virag-2-jog-study", "kuch-to-hua-hai", "rishte-naate"]);
  const normalized = JSON.parse(readFileSync(new URL(definition.normalizedSource.file, root)));
  assert.equal(createHash("sha256").update(JSON.stringify(normalized)).digest("hex"), definition.normalizedSource.sha256);
});

function harness() {
  const context = { currentTime: 0 }, calls = [];
  const player = new MidiScorePlayer(definition, { context, createVoice: ({vowel}) => {
    const record = { vowel }; calls.push(record);
    return { start: at => record.start = at,
      update: (values, options) => { record.values = values; record.updateTime = options.scheduledTime; },
      release: (fade, ended, options) => { record.end = options.scheduledTime; record.fade = fade; record.ended = ended; },
      cancel: () => record.cancelled = true };
  } });
  return { player, context, calls };
}

test("audio schedule preserves polyphony, same-pitch overlaps, tuning, velocity and ending", () => {
  const { player, context, calls } = harness();
  player.start({ audioOrigin: 2, includeMelody: true });
  assert.equal(calls.length, 0, "count-in must not sound notes");
  for (let t=0; t<77; t+=.025) { context.currentTime=t; player.update(); }
  assert.equal(calls.length, 296);
  calls.forEach((c,i)=>{
    const e=definition.score.events[i];
    assert.equal(c.start, 2 + e.startSeconds);
    assert.equal(c.end, 2 + e.endSeconds);
    assert.equal(c.values.hornAmount, e.velocity/127);
    const hz = getHonkFrequency({ leftEar:c.values.leftEar, rightEar:c.values.rightEar, pitchSnap:c.values.pitchSnap });
    assert.ok(Math.abs(69 + 12*Math.log2(hz/440) - e.midi) < .001);
  });
  const samePitch = definition.score.events.findIndex((e,i,all)=>i && all.slice(0,i).some(p=>p.midi===e.midi && p.endSeconds>e.startSeconds));
  assert.ok(samePitch > 0);
  assert.equal(player.running, false);
  player.stop();
  assert.ok(calls.every(c=>c.cancelled));
  assert.equal(player.voices.size, 0);
});

test("each section retains rests and complete sustains; practice excludes only the guided melody", () => {
  for (const lesson of definition.lessons) {
    const { player, context, calls } = harness();
    const origin = 2 - lesson.startSeconds;
    player.start({ audioOrigin: origin, startSeconds: lesson.startSeconds, endSeconds: lesson.endSeconds, includeMelody: true });
    for (let t=0; t<lesson.endSeconds-lesson.startSeconds+3; t+=.05) { context.currentTime=t; player.update(); }
    const expected = definition.score.events.filter(e=>e.startSeconds>=lesson.startSeconds && e.startSeconds<lesson.endSeconds);
    assert.equal(calls.length, expected.length);
    calls.forEach((c,i)=>{ assert.equal(c.start,origin+expected[i].startSeconds); assert.equal(c.end,origin+expected[i].endSeconds); });
  }
  const {player,context,calls}=harness();
  player.start({audioOrigin:2});
  for(let t=0;t<77;t+=.05){context.currentTime=t;player.update();}
  assert.equal(calls.length,115);
  assert.ok(calls.every(c=>c.vowel!=="A"));
  const practice=melodyDefinition(definition);
  assert.equal(practice.score.events.length,181);
  assert.ok(practice.score.events.every(e=>e.durationSeconds===e.releaseSeconds-e.startSeconds));
  assert.ok(new DataGuidance(practice, 0).step.events.every(e=>!e.bend), "Neutral notes must not enable the bend gauge with an empty curve");
});

test("stop cancels future attacks; resume carries sustained voices without replaying finished notes", () => {
  const {player,context,calls}=harness();
  context.currentTime=2;
  player.start({audioOrigin:2,includeMelody:true});
  player.stop(); const count=calls.length;
  context.currentTime=3;player.update();assert.equal(calls.length,count);
  player.start({audioOrigin:1,startSeconds:2,includeMelody:true});
  const resumed=calls.slice(count);
  const carry=definition.score.events.filter(e=>e.startSeconds<=2 && e.endSeconds>2);
  assert.equal(resumed.filter(c=>c.start===3).length,carry.length);
  player.stop();assert.ok(calls.every(c=>c.cancelled));
});

test("invalid pitches, unsupported bends and cuts through pedal sustain are rejected", () => {
  for (const mutate of [d=>d.score.events[0].midi=1, d=>d.score.events[0].velocity=0,
    d=>d.score.events[0].bend[0].semitones=1, d=>d.lessons[0].endSeconds=1]) {
    const d=structuredClone(definition);mutate(d);assert.throws(()=>validateMidiPerformance(d),/Invalid/);
  }
});
