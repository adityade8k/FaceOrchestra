import test from "node:test";
import assert from "node:assert/strict";
import { Group } from "three";
import { definition } from "../../src/compositions/kuch.js";
import { resolveLessonSequence } from "../../src/compositions/LessonSequence.js";
import { validateKuchOrchestra } from "../../src/tutorial/kuch-orchestra/score.js";
import { SongTutorial } from "../../src/tutorial/SongTutorial.js";
import { LiveMelodyEnsemble } from "../../src/tutorial/live-melody/LiveMelodyEnsemble.js";
import { MetronomeInstrument } from "../../src/instruments/metronome/MetronomeInstrument.js";

const step = definition.lessons[6];
const starts = [0, 16, 40, 56, 80, 96];

test("lesson 7 joins the six phrases without changing any melody, bend, or within-phrase timing", () => {
  const before = JSON.stringify(definition);
  assert.equal(definition.lessons.length, 8);
  assert.equal(step.id, "melody-run-through");
  assert.equal(step.countInBeats, 2);
  assert.equal(step.completePerformance, false);
  assert.equal(definition.lessons[7].completePerformance, true);
  const run = resolveLessonSequence(definition, step);
  assert.equal(run.lesson.startBeat, 0); assert.equal(run.lesson.endBeat, 120);
  assert.equal(run.definition.score.events.length, 65);
  for (const [i, phrase] of definition.lessons.slice(0, 6).entries()) {
    for (const original of definition.score.events.filter(e => phrase.eventIds.includes(e.id))) {
      const shifted = run.definition.score.events.find(e => e.id === original.id);
      const offset = starts[i] - phrase.startBeat;
      assert.deepEqual(shifted, { ...original, beat: original.beat + offset,
        pitchTargets: original.pitchTargets.map(t => ({ ...t, beat: t.beat + offset })) });
    }
  }
  const expected = definition.lessons.slice(0, 6).flatMap((phrase, i) =>
    definition.arrangement.backing.filter(e => e.beat < phrase.endBeat && e.beat + e.beats > phrase.startBeat)
      .map(e => ({ ...e, beat: Math.max(e.beat, phrase.startBeat) - phrase.startBeat + starts[i],
        beats: Math.min(e.beat + e.beats, phrase.endBeat) - Math.max(e.beat, phrase.startBeat),
        ...(e.beat < phrase.startBeat ? { carry: true } : {}) })));
  assert.deepEqual(run.definition.arrangement.backing, expected);
  assert.equal(expected.length, 662);
  assert.ok(expected.every(e => e.part !== "melody" && e.beat >= 0 && e.beat + e.beats <= 120));
  assert.equal(JSON.stringify(definition), before, "Full arrangement remains unchanged");
  for (const lesson of [...definition.lessons.slice(0, 6), definition.lessons[7]])
    assert.equal(resolveLessonSequence(definition, lesson).definition, definition);
});

test("the sequence contract rejects missing, repeated, nested, reordered, or truncated phrases", () => {
  for (const mutate of [
    l => l.sequenceLessonIds[0] = "missing",
    l => l.sequenceLessonIds[1] = l.sequenceLessonIds[0],
    l => l.sequenceLessonIds[0] = l.id,
    l => l.sequenceLessonIds.reverse(),
    l => l.sequenceLessonIds.pop(),
    l => l.countInBeats = 0,
  ]) {
    const d = structuredClone(definition); mutate(d.lessons[6]);
    assert.throws(() => validateKuchOrchestra(d));
  }
});

function fixture() {
  const metro = new MetronomeInstrument({ id: "metro", root: new Group(), bpm: 92 });
  const honks = new Map(definition.arrangement.recipes.filter(r => r.kind === "honk")
    .map(r => [r.role, { root: { visible: true } }]));
  const adapter = { get: role => role === "metronome" ? metro : honks.get(role),
    setVirtualsActive() {}, focus() {}, releaseAll() {}, observe() {} };
  const host = { adapter, learningProgress: { load: () => null }, cues: { reset() {} },
    panel: { setTransport() {} }, r: { updateMetronomeLabel() {},
      audioSystem: { ensureAudio: async () => {}, audioContextService: { context: { state: "running", currentTime: 0 } } } } };
  class Ensemble extends LiveMelodyEnsemble {
    constructor(host, d) {
      super(host, d); this.prepared = true; this.metro = metro; this.originalSetBpm = metro.setBpm;
      this.schedules = []; this.played = [];
      this.hands = { release() {}, update() {}, play: (events, beat) => this.played.push({ events, beat }) };
    }
    validate() { return true; }
    schedule(options) { this.schedules.push(options); super.schedule(options); }
  }
  const tutorial = new SongTutorial(host, definition, { Ensemble, resolveLesson: resolveLessonSequence });
  tutorial.index = 6;
  const at = beat => tutorial.anchor + (beat - tutorial.guide.startBeat) * 60000 / metro.bpm;
  const update = beat => { const now = at(beat); tutorial.last = now - 16; tutorial.update(now); };
  return { tutorial, metro, at, update };
}

test("run-through practice uses one two-beat count-in and assesses all six phrases on the compact clock", async () => {
  const old = globalThis.document; globalThis.document = { addEventListener() {}, removeEventListener() {} };
  const f = fixture(), t = f.tutorial;
  try {
    assert.match(t.model(performance.now()).instruction, /120\.0 beats/);
    await t.action("step-practice");
    assert.equal(t.phase, "practice");
    const schedule = t.ensemble.schedules[0];
    assert.ok(Math.abs(schedule.beatZero - schedule.countAt - 2 * 60000 / 92) < 1e-8);
    assert.equal(schedule.startBeat, 0); assert.equal(schedule.endBeat, 120);
    assert.equal(schedule.backing.length, 662);
    assert.deepEqual(schedule.events, t.guide.step.events);
    assert.equal(t.guide.model(schedule.countAt).transport, "Count in: 2");
    for (const e of t.guide.step.events) t.accept({ id: e.id, kind: "note", origin: "learner",
      voiced: true, released: true, midis: [e.midi], startMs: f.at(e.beat), endMs: f.at(e.beat + e.beats),
      bendSamples: (e.bend || []).map(p => ({ offsetMs: p.fraction * e.beats * 60000 / 92, semitones: p.semitones })) });
    assert.equal(t.heard.length, 65, "First phrase must not be filtered by its original start beat 24");
    for (const beat of starts) { f.update(beat + .5); assert.equal(t.phase, "practice"); }
    assert.equal(t.ensemble.schedules.length, 1, "No restart or extra count-in between phrases");
    f.update(120.000001);
    assert.equal(t.phase, null); assert.equal(t.outcomes[step.id], "passed");
    assert.match(t.feedback, /65\/65 matched/); assert.equal(f.metro.playing, false);
    await t.action("step-practice");
    assert.equal(t.heard.length, 0); assert.ok(Math.abs(t.ensemble.clockStartBeat - 2) < 1e-8);
    await t.action("rishte-stop"); assert.equal(t.phase, null);
  } finally { t.cancel(); globalThis.document = old; }
});

test("demonstration uses shifted bends; full preview and the final lesson retain the original timeline", async () => {
  const old = globalThis.document; globalThis.document = { addEventListener() {}, removeEventListener() {} };
  const f = fixture(), t = f.tutorial;
  try {
    await t.action("step-demo"); f.update(40.5);
    assert.equal(t.ensemble.played.at(-1).events.find(e => e.id === "t0-e148").beat, 40.5);
    assert.equal(t.fullDemo, false); f.update(120.000001);
    assert.equal(t.outcomes[step.id], undefined, "A demonstration earns no practice credit");
    await t.action("rishte-preview");
    assert.equal(t.fullDemo, true); assert.equal(t.guide.endBeat, 192);
    assert.ok(Math.abs(t.ensemble.clockStartBeat - 4) < 1e-8);
    assert.equal(t.guide.step.events[0].beat, 24.5);
    assert.equal(t.ensemble.schedules.at(-1).backing.length, 1087);
    await t.action("next-step"); assert.equal(t.index, 7);
    await t.action("step-practice");
    assert.equal(t.guide.endBeat, 192); assert.ok(Math.abs(t.ensemble.clockStartBeat - 4) < 1e-8);
    assert.equal(t.ensemble.schedules.at(-1).events, definition.score.events);
    await t.action("previous-step"); await t.action("step-demo");
    assert.equal(t.guide.endBeat, 120); assert.ok(Math.abs(t.ensemble.clockStartBeat - 2) < 1e-8);
  } finally { t.cancel(); globalThis.document = old; }
});

test("the quick count-in follows tempo changes and interruption requires a fresh attempt", async () => {
  const old = globalThis.document, originalNow = performance.now;
  globalThis.document = { addEventListener() {}, removeEventListener() {} };
  let now = 1000; performance.now = () => now;
  const f = fixture(), t = f.tutorial;
  try {
    await t.action("step-practice");
    now += 60000 / 92;
    await t.action("tempo-down");
    assert.equal(f.metro.bpm, 87);
    assert.ok(Math.abs(t.anchor - now - 60000 / 87) < 1e-8, "One beat remains after changing tempo");
    assert.ok(Math.abs(t.guide.beatAt(t.anchor)) < 1e-8);
    now = t.anchor + 2 * 60000 / 87;
    t.last = now - 16; t.update(now);
    const beat = t.guide.beatAt(now);
    await t.action("tempo-up");
    assert.ok(Math.abs(t.guide.beatAt(now) - beat) < 1e-8);
    now += 300; t.update(now);
    assert.equal(t.phase, null); assert.equal(f.metro.playing, false);
    await t.action("step-practice");
    assert.ok(Math.abs(t.ensemble.clockStartBeat - 2) < 1e-8);
    assert.equal(t.heard.length, 0);
    assert.equal(t.guide.model(now).transport, "Count in: 2");
  } finally { t.cancel(); performance.now = originalNow; globalThis.document = old; }
});
