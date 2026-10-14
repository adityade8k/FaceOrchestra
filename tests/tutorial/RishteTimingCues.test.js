import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { attackCueState } from "../../src/tutorial/attackCueState.js";
import { TutorialTimingCues } from "../../src/tutorial/TutorialTimingCues.js";
import { MelodyGuidance } from "../../src/compositions/MelodyScore.js";
import { cueCanvas } from "../helpers/cueCanvas.js";
import { NotePracticeGate, NotePracticeGuidance } from "../../src/tutorial/NotePracticeGate.js";

test("yellow shrinks to the expected attack, then grows to the current red square at release at all Rishte tempos", () => {
  for (const bpm of [30, 40, 50, 75, 100, 115]) {
    const options = { beatMs: 60000 / bpm, nextBeat: 4 };
    for (const beats of [.025, .5, 3]) {
      const event = { beat: 4, beats };
      assert.deepEqual(attackCueState(-4, event, options), { phase: "next", green: 0, yellow: 0, red: 0, reference: 1.35 });
      let countdown = Infinity;
      for (const lead of [1, .75, .5, .1, 1e-9]) {
        const state = attackCueState(4 - lead, event, options);
        assert.equal(state.phase, "prepare"); assert.equal(state.red, 0); assert.equal(state.reference, 1.35);
        assert.ok(state.yellow < countdown && state.yellow > .08);
        countdown = state.yellow;
      }
      assert.ok(Math.abs(countdown - .08) < 1e-8, "Countdown meets the attack minimum continuously");
      assert.deepEqual(attackCueState(4, event, options), { phase: "hold", green: 0, yellow: .08, red: 1, reference: 0 });
      let previous = 0;
      for (const fraction of [0, .1, .5, .9, .99999]) {
        const state = attackCueState(4 + beats * fraction, event, options);
        assert.equal(state.green, 0); assert.equal(state.red, 1); assert.equal(state.reference, 0);
        assert.ok(state.yellow > previous && state.yellow < 1);
        assert.ok(Math.abs(state.yellow - (.08 + .92 * fraction)) < 1e-10);
        previous = state.yellow;
      }
      assert.ok(previous > .999);
      assert.equal(attackCueState(4 + beats, event, options), null);
    }
  }
});

function fixture() {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  const targets = new Map(["right", "left"].map((role, i) => {
    const root = new THREE.Group(); root.position.set(i * .3, 1, -1); scene.add(root);
    return [role, { root, getSqueezeColliderSphere: () => ({ center: root.position, radius: .1 }) }];
  }));
  const metro = { bpm: 100 };
  const adapter = { r: { scene, getUserCamera: () => camera, controllers: [], controllerStates: new Map() },
    get: role => role === "metronome" ? metro : targets.get(role), gestures: new Map(), lastStrikes: new Map() };
  const events = [
    { id: "first", role: "right", hand: "R", beat: 4, beats: 2 },
    { id: "overlap", role: "left", hand: "L", beat: 5, beats: 2 },
    { id: "repeat", role: "right", hand: "R", beat: 8, beats: .1 },
    { id: "chord-R", role: "right", hand: "R", beat: 10, beats: 1 },
    { id: "chord-L", role: "left", hand: "L", beat: 10, beats: 1 },
  ];
  let beat = 0;
  const ensemble = { a: adapter, beatAt: () => beat };
  const definition = { score: { events, durationBeats: 11 } };
  const guide = new MelodyGuidance(ensemble, definition);
  const cues = new TutorialTimingCues(adapter, { createCanvas: cueCanvas });
  return { cues, guide, metro, targets, definition, ensemble,
    update(value) { beat = value; cues.update(guide, 1234); },
    visible(color) { return cues.pool.filter(p => p[color].visible).map(p => p[color].userData.eventId).sort(); } };
}

test("learner cues highlight only the current note and preview the following note with a white circle", () => {
  const f = fixture();
  const gate = new NotePracticeGate([
    { id: "held", role: "right", midi: 60, hand: "R", beat: 0, beats: 2 },
    { id: "following", role: "left", midi: 62, hand: "L", beat: 1, beats: 1 },
  ], { anchorMs: 1000, beatMs: 500 });
  const guide = new NotePracticeGuidance(gate);
  const observation = { id: "voice", kind: "note", origin: "learner", role: "right",
    midis: [60], startMs: 20000, voiced: true };
  try {
    for (const now of [1000, 10000, 20000]) {
      f.cues.update(guide, now);
      assert.deepEqual(f.visible("hand"), ["held"]);
      assert.deepEqual(f.visible("reference"), ["following"]);
      assert.equal(f.cues.pool[1].reference.material.color.getHex(), 0xffffff);
      assert.equal(f.cues.pool[1].hand.visible, false);
      assert.deepEqual(f.visible("white"), []);
      assert.deepEqual(f.visible("yellow"), []);
      assert.ok([...f.targets.values()].every(h => h.root.visible));
    }
    f.cues.adapter.gestures.set(new THREE.Group(), observation);
    const pair = f.cues.pool[0];
    for (const fraction of [0, .25, .5, 1]) {
      f.cues.update(guide, 20000 + fraction * 1000);
      assert.equal(gate.fraction, fraction);
      assert.deepEqual(f.visible("white"), ["held"]);
      assert.deepEqual(f.visible("yellow"), ["held"]);
      assert.equal(pair.white.material.color.getHex(), 0xffffff);
      assert.equal(pair.yellow.material.color.getHex(), 0xffd15a);
      assert.equal(pair.yellow.scale.x / pair.white.scale.x, fraction);
      assert.deepEqual(pair.yellow.position.toArray(), pair.white.position.toArray());
      assert.deepEqual(pair.yellow.quaternion.toArray(), pair.white.quaternion.toArray());
    }
    f.cues.update(guide, 21500); assert.equal(gate.readyToRelease, true);
    assert.equal(pair.yellow.scale.x, pair.white.scale.x, "Full circle marks the suggested duration without advancing the gate");
    assert.deepEqual(f.visible("hand"), ["held"]);
    gate.accept({ ...observation, released: true, endMs: 21500 });
    f.cues.adapter.gestures.clear(); f.cues.update(guide, 21501);
    assert.deepEqual(f.visible("hand"), ["following"]);
    assert.deepEqual(f.visible("reference"), []);
    assert.deepEqual(f.visible("white"), []);
    assert.deepEqual(f.visible("yellow"), []);
  } finally { f.cues.dispose(); }
});

test("sustain circles use audible onset, restart after a short release, and share the gate's fixed duration", () => {
  const f = fixture(), controller = new THREE.Group();
  let beatMs = 500;
  const gate = new NotePracticeGate([{ id: "target", role: "right", midi: 60, beats: 2 }],
    { beatMs: () => beatMs });
  const guide = new NotePracticeGuidance(gate), pair = f.cues.pool[0];
  const gesture = { id: "attempt", kind: "note", origin: "learner", role: "right", midis: [60],
    startMs: 1000, voicedStartMs: 1100, voiced: true };
  try {
    f.cues.adapter.gestures.set(controller, { ...gesture, voiced: false });
    f.cues.update(guide, 1050);
    assert.equal(pair.white.visible, false, "A ray waiting for audio cannot start the sustain clock");
    f.cues.adapter.gestures.set(controller, gesture);
    f.cues.update(guide, 1100);
    assert.equal(pair.yellow.scale.x, 0);
    beatMs = 1000;
    f.cues.update(guide, 1350);
    assert.equal(pair.yellow.scale.x / pair.white.scale.x, .25, "Tempo changes do not change an active hold's requirement");
    assert.equal(gate.accept({ ...gesture, released: true, endMs: 1350 }), false);
    f.cues.adapter.gestures.clear(); f.cues.update(guide, 1351);
    assert.equal(pair.white.visible, false); assert.equal(pair.yellow.visible, false);
    const retry = { ...gesture, id: "retry", startMs: 2000, voicedStartMs: 2000 };
    f.cues.adapter.gestures.set(controller, retry);
    f.cues.update(guide, 2000);
    assert.equal(pair.yellow.scale.x, 0, "A retry starts at the center");
    f.cues.update(guide, 3000);
    assert.equal(pair.yellow.scale.x / pair.white.scale.x, .5, "New attempts use the current tempo");
    retry.voiceInterrupted = true; f.cues.update(guide, 3100);
    assert.equal(pair.white.visible, false); assert.equal(pair.yellow.visible, false);
    delete retry.voiceInterrupted; f.cues.update(guide, 3200);
    f.cues.update(guide, 3201, { active: false });
    assert.ok(f.cues.pool.every(p => Object.values(p).every(m => !m.visible)));
  } finally { f.cues.dispose(); }
});

test("guided play starts sustain feedback on the real voice rather than the score clock", () => {
  const f = fixture(), controller = new THREE.Group();
  f.definition.score.events[0].durationSeconds = 1.5; // Source is 80 BPM; this run is 100 BPM.
  const gesture = { role: "right", voiced: true, origin: "learner", startMs: 934, voicedStartMs: 1034 };
  try {
    f.update(4.8);
    assert.deepEqual(f.visible("white"), []);
    f.cues.adapter.gestures.set(controller, gesture);
    f.update(4.8);
    const pair = f.cues.pool.find(p => p.white.visible);
    assert.ok(pair);
    assert.ok(Math.abs(pair.yellow.scale.x / pair.white.scale.x - 200 / (2 * f.guide.beatMs)) < 1e-10);
    assert.deepEqual(f.visible("white"), ["first"]);
    assert.deepEqual(f.visible("reference"), ["overlap"]);
    f.targets.get("right").root.position.set(.4, 1.2, -.8); f.update(4.9);
    assert.deepEqual(pair.white.position.toArray(), [.4, 1.2, -.8]);
    f.cues.adapter.gestures.clear(); f.update(4.95);
    assert.deepEqual(f.visible("white"), []); assert.deepEqual(f.visible("yellow"), []);
    assert.deepEqual(f.visible("hand"), ["first"], "The score still indicates which note is current");
  } finally { f.cues.dispose(); }
});

test("highlighted squares mark current notes and white circles mark only next notes through rests and chords", () => {
  const f = fixture();
  const markers = (active, next) => {
    assert.deepEqual(f.visible("hand"), active);
    assert.deepEqual(f.visible("reference"), next);
    for (const old of ["red", "yellow", "green", "bend"]) assert.deepEqual(f.visible(old), []);
    for (const p of f.cues.pool) if (p.reference.visible) assert.equal(p.reference.material.color.getHex(), 0xffffff);
  };
  try {
    f.update(-4); markers([], ["first"]);
    f.update(4); markers(["first"], ["overlap"]);
    assert.equal(f.cues.pool.find(p => p.hand.visible).hand.material.map, null, "The square has no letter texture");
    f.update(5); markers(["first", "overlap"], ["repeat"]);
    assert.equal(f.cues.pool.find(p => p.hand.userData.eventId === "overlap").hand.material.color.getHex(), 0xffffff);
    f.update(7.5); markers([], ["repeat"]);
    f.update(8); markers(["repeat"], ["chord-L", "chord-R"]);
    f.update(10); markers(["chord-L", "chord-R"], []);
    f.update(11); markers([], []);
  } finally { f.cues.dispose(); }
});

test("tempo changes keep labels on the shared score beat; cancellation removes guidance", () => {
  const f = fixture();
  try {
    f.update(4.99); f.metro.bpm = 40; f.update(4.99);
    assert.deepEqual(f.visible("hand"), ["first"]); assert.deepEqual(f.visible("reference"), ["overlap"]);
    f.update(5);
    assert.deepEqual(f.visible("hand"), ["first", "overlap"]);
    f.targets.get("right").root.position.set(.4, 1.2, -.8); f.update(5.01);
    const next = f.cues.pool.find(p => p.reference.visible).reference;
    assert.deepEqual(next.position.toArray(), [.4, 1.2, -.8]);
    f.cues.reset();
    assert.ok(f.cues.pool.every(p => Object.values(p).every(m => !m.visible)));
    f.update(4.5); f.cues.update(null, 1234);
    assert.ok(f.cues.pool.every(p => Object.values(p).every(m => !m.visible)));
    const phrase = new MelodyGuidance(f.ensemble, f.definition, 5, 8);
    f.cues.update(phrase, 1234);
    assert.deepEqual(f.visible("reference"), ["overlap"], "Practice only marks notes in its phrase");
    assert.deepEqual(f.visible("hand"), []);
  } finally { f.cues.dispose(); }
});

test("repeated Honks show an active square beside the white next-note circle", () => {
  const f = fixture();
  f.guide.step.events.push({ id: "tight-repeat", role: "right", hand: "R", beat: 6.1, beats: .2 });
  f.guide.step.events.sort((a, b) => a.beat - b.beat);
  try {
    f.update(5.9);
    assert.deepEqual(f.visible("hand"), ["first", "overlap"]);
    assert.deepEqual(f.visible("reference"), ["tight-repeat"]);
    const current = f.cues.pool.find(p => p.hand.visible && p.hand.userData.eventId === "first").hand;
    const next = f.cues.pool.find(p => p.reference.visible).reference;
    assert.notDeepEqual(current.position.toArray(), next.position.toArray(), "Label does not cover the circle");
    const size = next.scale.x;
    for (const beat of [6, 6.05, 6.099]) {
      f.update(beat);
      assert.equal(f.cues.pool.find(p => p.reference.visible).reference.scale.x, size, "Next circle stays fixed");
    }
    f.update(6.1);
    assert.deepEqual(f.visible("hand"), ["overlap", "tight-repeat"]);
    assert.deepEqual(f.visible("reference"), ["repeat"]);
  } finally { f.cues.dispose(); }
});

test("existing note squares supply current highlights without a duplicate marker", () => {
  const f = fixture();
  f.cues.adapter.handIndicators = { labels: new Map([["right", {}], ["left", {}]]) };
  try {
    f.update(5);
    assert.deepEqual(f.visible("hand"), []);
    assert.deepEqual(f.visible("reference"), ["repeat"]);
    for (const old of ["red", "yellow", "green"]) assert.deepEqual(f.visible(old), []);
  } finally { f.cues.dispose(); }
});

test("inactive targets retain white outlines and tightly repeated active squares shrink at each attack", () => {
  const f = fixture();
  f.guide.step.events = [
    { id: 'a', role: 'right', beat: 0, beats: 1 },
    { id: 'b', role: 'right', beat: 1, beats: 1 },
    { id: 'c', role: 'right', beat: 2.05, beats: 1 },
    { id: 'other', role: 'left', beat: 4, beats: 1 },
  ];
  try {
    f.update(-1);
    for (const square of f.cues.noteOutlines.values()) {
      assert.equal(square.visible, true);
      assert.equal(square.material.opacity, 0, 'Inactive square has no fill');
      assert.equal(square.children[0].material.color.getHex(), 0xffffff);
      assert.equal(square.children[0].material.opacity, .25);
    }
    f.update(.5);
    const steady = f.cues.pool.find(p => p.hand.visible).hand.scale.x;
    assert.ok(steady < .115, 'Active square is smaller than the former size');
    assert.equal(f.cues.noteOutlines.get('right').visible, false, 'Active square supplies its own outline');
    assert.equal(f.cues.noteOutlines.get('left').visible, true);
    for (const beat of [.999, 1, 1.001, 1.999]) {
      f.update(beat);
      const square = f.cues.pool.find(p => p.hand.visible).hand;
      assert.ok(square.scale.x < steady * .85, `Shrink at repeat/release ${beat}`);
      assert.equal(square.material.color.getHex(), 0xffffff);
    }
    f.update(2.025);
    assert.deepEqual(f.visible('hand'), []);
    assert.equal(f.cues.noteOutlines.get('right').visible, true, 'Release gap keeps the outline');
    f.update(2.5);
    assert.equal(f.cues.pool.find(p => p.hand.visible).hand.scale.x, steady);
    f.cues.update(null, 1234);
    assert.ok([...f.cues.noteOutlines.values()].every(s => !s.visible));
  } finally { f.cues.dispose(); }
});
