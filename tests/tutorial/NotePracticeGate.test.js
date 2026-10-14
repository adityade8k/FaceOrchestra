import test from "node:test";
import assert from "node:assert/strict";
import { NotePracticeGate, NotePracticeGuidance } from "../../src/tutorial/NotePracticeGate.js";
import { TutorialSession } from "../../src/tutorial/TutorialSession.js";
import { LESSON_STEPS } from "../../src/compositions/jog/definition.js";
import { scoreForStep } from "../../src/tutorial/scoring.js";
import { DESCENDING_BEND } from "../../src/compositions/jog/definition.js";

const targets = [
  { id: "one", role: "right-C4", midi: 60, beat: 2, beats: 2 },
  { id: "repeat", role: "left-C4", midi: 60, beat: 3, beats: 1 },
  { id: "three", role: "right-D4", midi: 62, beat: 4, beats: .5 },
];
const note = (id, startMs, endMs, options = {}) => ({ id, kind: "note", origin: "learner",
  role: "other-copy-of-C4", midis: [60], startMs, endMs, voiced: true,
  released: true, articulated: true, allReleased: true, maxAbsBend: 0, ...options });

test("late starts, wrong pitches and short holds stay on the target; partial holds never accumulate", () => {
  const g = new NotePracticeGate(targets, { anchorMs: 1000, beatMs: 500 });
  g.update(60000); assert.equal(g.index, 0); assert.equal(g.complete, false);
  assert.equal(g.accept(note("wrong", 60000, 64000, { midis: [62] })), false);
  for (let i = 0; i < 3; i++) assert.equal(g.accept(note(`short${i}`, 65000 + i * 800, 65700 + i * 800)), false);
  assert.equal(g.index, 0); assert.match(g.feedback, /continuous/);
  assert.equal(g.accept(note("valid", 70000, 71000)), true);
  assert.equal(g.index, 1); assert.equal(g.current.id, "repeat");
});

test("sustain begins with audible voice and requires a real note-off after the suggested duration", () => {
  const g = new NotePracticeGate(targets, { beatMs: 500 });
  const live = note("held", 0, undefined, { released: false, voicedStartMs: 100 });
  g.update(600, [live]); assert.equal(g.heldMs, 500); assert.equal(g.fraction, .5);
  assert.equal(g.readyToRelease, false); assert.equal(g.index, 0);
  g.update(1500, [live]); assert.equal(g.readyToRelease, true); assert.equal(g.index, 0);
  assert.match(g.model().transport, /Sustain complete/);
  assert.equal(g.accept({ ...live, released: true, endMs: 1500 }), true);
  assert.equal(g.index, 1);
});

test("each repeated note needs a fresh attack; an overlapping old hold and duplicate release cannot count", () => {
  const g = new NotePracticeGate(targets, { beatMs: 500 });
  const first = note("one", 100, 1100);
  assert.ok(g.accept(first)); assert.equal(g.accept(first), false);
  assert.equal(g.accept(note("already-held", 800, 1500)), false);
  g.update(9000, [note("one", 100, undefined)]); assert.equal(g.active, null);
  assert.ok(g.accept(note("fresh", 2000, 2500)));
  assert.equal(g.index, 2);
  assert.ok(g.accept(note("last", 3000, 3250, { midis: [62] })));
  assert.equal(g.complete, true); assert.equal(g.result().correct, 3);
});

test("count-in, demo voices, disconnected voices, extra chord members and unvoiced gestures earn no credit", () => {
  for (const bad of [
    { origin: "demonstration" }, { origin: "simulation" }, { origin: "performance" },
    { voiced: false }, { voiceInterrupted: true }, { invalidMembers: true },
    { allReleased: false }, { articulated: false }, { midis: [60, 64] }, { maxAbsBend: 1 },
  ]) {
    const g = new NotePracticeGate(targets, { anchorMs: 1000, beatMs: 500 });
    assert.equal(g.accept(note("early", 999, 4000)), false);
    assert.equal(g.accept(note("bad", 1000, 4000, bad)), false, JSON.stringify(bad));
    assert.equal(g.index, 0);
  }
});

test("tempo controls set sustain time for a fresh attack but cannot shorten a hold already in progress", () => {
  let beatMs = 1000;
  const g = new NotePracticeGate(targets, { beatMs: () => beatMs });
  const live = note("held", 0, undefined, { released: false });
  g.update(300, [live]); assert.equal(g.requiredMs, 2000);
  beatMs = 500; g.update(1200, [live]); assert.equal(g.readyToRelease, false);
  assert.equal(g.accept({ ...live, released: true, endMs: 1500 }), false);
  assert.ok(g.accept(note("new-tempo", 2000, 3000)));
});

test("all chord pitches must sustain together and percussion advances only after the correct withdrawal", () => {
  const g = new NotePracticeGate([
    { role: "chord", midis: [60, 64, 67], beats: 1 },
    { role: "metronome", type: "wood", beat: 4 },
  ], { beatMs: 500 });
  assert.equal(g.accept(note("missing-member", 0, 800, { midis: [60, 64] })), false);
  assert.ok(g.accept(note("chord", 1000, 1500, { midis: [67, 60, 64] })));
  const tap = { id: "tap", kind: "strike", origin: "learner", role: "metronome",
    percussionType: "wood", startMs: 2000, endMs: 2100, withdrawn: true };
  assert.equal(g.accept({ ...tap, id: "wrong-type", percussionType: "hihat" }), false);
  assert.equal(g.accept({ ...tap, id: "contact", withdrawn: false }), false);
  assert.ok(g.accept(tap)); assert.equal(g.complete, true);
});

test("a sustained starting pitch alone cannot satisfy a bend target", () => {
  const g = new NotePracticeGate([{ role: "bend", midi: 60, minimumMs: 1500, bend: DESCENDING_BEND }]);
  assert.equal(g.accept(note("no-bend", 0, 2000, { bendSamples: [] })), false);
  assert.equal(g.index, 0);
  assert.ok(g.accept(note("bent", 3000, 5000, { maxAbsBend: 3, bendSamples: [
    { offsetMs: 0, semitones: 0 }, { offsetMs: 200, semitones: 0 },
    { offsetMs: 700, semitones: -1 }, { offsetMs: 1200, semitones: -2 },
    { offsetMs: 1600, semitones: -3 }, { offsetMs: 1950, semitones: -3 },
  ] })));
});

test("Jog technique drills wait while timed song exercises keep their score clock", () => {
  for (const id of ["learn-S", "phrase-A", "chords-rehearse", "drums-rehearse"]) {
    const step = LESSON_STEPS.find(s => s.id === id) || LESSON_STEPS.find(s => s.type === "note");
    const s = new TutorialSession({ steps: [step] });
    s.startAttempt(0); if (step.timed) s.startCountIn(1000, 750);
    s.enableNotePractice();
    if (step.timed) {
      assert.equal(s.practiceGate, null);
      s.update({}, 1000000);
      assert.equal(s.phase, "results", "A song exercise ends on the score clock without learner input");
      continue;
    }
    assert.equal(s.practiceGate.events.length, scoreForStep(step).length);
    s.update({}, 1000000); assert.equal(s.phase, "practicing");
    const guide = new NotePracticeGuidance(s.practiceGate, step);
    assert.equal(guide.complete(1000000), false);
    s.discardAttempt(1000001); assert.equal(s.practiceGate, null);
  }
});
