import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { attackCueState } from "../../src/tutorial/attackCueState.js";
import { TutorialTimingCues } from "../../src/tutorial/TutorialTimingCues.js";
import { RishteGuidance } from "../../src/tutorial/rishte/score.js";
import { cueCanvas } from "../helpers/cueCanvas.js";

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
    { id: "first", role: "right", beat: 4, beats: 2 },
    { id: "overlap", role: "left", beat: 5, beats: 2 },
    { id: "repeat", role: "right", beat: 8, beats: .1 },
    { id: "chord-R", role: "right", beat: 10, beats: 1 },
    { id: "chord-L", role: "left", beat: 10, beats: 1 },
  ];
  let beat = 0;
  const ensemble = { a: adapter, beatAt: () => beat };
  const definition = { score: { events, durationBeats: 11 } };
  const guide = new RishteGuidance(ensemble, definition);
  const cues = new TutorialTimingCues(adapter, { createCanvas: cueCanvas });
  return { cues, guide, metro, targets, definition, ensemble,
    update(value) { beat = value; cues.update(guide, 1234); },
    visible(color) { return cues.pool.filter(p => p[color].visible).map(p => p[color].userData.eventId).sort(); } };
}

test("red marks current notes and white marks next notes through count-in, overlaps, rests and chords", () => {
  const f = fixture();
  const markers = (red, white) => {
    assert.deepEqual(f.visible("red"), red);
    assert.deepEqual(f.visible("reference"), white);
    assert.deepEqual(f.visible("green"), []);
  };
  try {
    f.update(-4); markers([], ["first"]);
    f.update(4); markers(["first"], ["overlap"]);
    assert.deepEqual(f.visible("yellow"), ["first", "overlap"]);
    const square = f.cues.pool.find(p => p.red.visible).red;
    assert.equal(square.material.color.getHex(), 0xff4141);
    assert.equal(square.geometry, f.cues.squareGeometry);
    const redSize = square.scale.x;
    f.update(5); markers(["first", "overlap"], ["repeat"]);
    assert.deepEqual(f.visible("yellow"), ["first", "overlap"]);
    assert.equal(f.cues.pool.find(p => p.red.visible && p.red.userData.eventId === "first").red.scale.x, redSize);
    f.update(7.5); markers([], ["repeat"]);
    assert.deepEqual(f.visible("yellow"), ["repeat"]);
    f.update(8); markers(["repeat"], ["chord-L", "chord-R"]);
    assert.deepEqual(f.visible("yellow"), ["repeat"]);
    f.update(10); markers(["chord-L", "chord-R"], []);
    assert.deepEqual(f.visible("yellow"), ["chord-L", "chord-R"]);
    f.update(11);
    assert.ok(f.cues.pool.every(p => Object.values(p).every(m => !m.visible)));
  } finally { f.cues.dispose(); }
});

test("tempo changes keep cues on the shared score beat; cancellation removes both shapes", () => {
  const f = fixture();
  try {
    f.update(4.99); f.metro.bpm = 40; f.update(4.99);
    assert.deepEqual(f.visible("red"), ["first"]); assert.deepEqual(f.visible("reference"), ["overlap"]);
    f.update(5);
    assert.deepEqual(f.visible("yellow"), ["first", "overlap"]);
    f.targets.get("right").root.position.set(.4, 1.2, -.8); f.update(5.01);
    const next = f.cues.pool.find(p => p.reference.visible).reference;
    assert.deepEqual(next.position.toArray(), [.4, 1.2, -.8]);
    f.cues.reset();
    assert.ok(f.cues.pool.every(p => Object.values(p).every(m => !m.visible)));
    f.update(4.5); f.cues.update(null, 1234);
    assert.ok(f.cues.pool.every(p => Object.values(p).every(m => !m.visible)));
    const phrase = new RishteGuidance(f.ensemble, f.definition, 5, 8);
    f.cues.update(phrase, 1234);
    assert.deepEqual(f.visible("reference"), ["overlap"], "Practice only marks notes in its phrase");
    assert.deepEqual(f.visible("red"), []);
  } finally { f.cues.dispose(); }
});

test("a repeated Honk shows current red and next white together, then shrinks the next countdown through the remaining gap", () => {
  const f = fixture();
  f.guide.step.events.push({ id: "tight-repeat", role: "right", beat: 6.1, beats: .2 });
  f.guide.step.events.sort((a, b) => a.beat - b.beat);
  const ratio = () => {
    const pair = f.cues.pool.find(p => p.yellow.visible && p.yellow.userData.eventId === "tight-repeat");
    return pair.yellow.scale.x / (.1 * 1.12);
  };
  try {
    f.update(5.9);
    assert.deepEqual(f.visible("red"), ["first", "overlap"]);
    assert.deepEqual(f.visible("reference"), ["tight-repeat"]);
    const current = f.cues.pool.find(p => p.red.visible && p.red.userData.eventId === "first").red;
    const next = f.cues.pool.find(p => p.reference.visible).reference;
    assert.deepEqual(current.position.toArray(), next.position.toArray());
    assert.ok(next.scale.x > current.scale.x, "Both markers remain visible on the same Honk");
    assert.deepEqual(f.visible("yellow"), ["first", "overlap"]);
    f.update(6); assert.ok(Math.abs(ratio() - 1.35) < 1e-9);
    f.update(6.05); assert.ok(Math.abs(ratio() - .715) < 1e-9);
    f.update(6.1); assert.ok(Math.abs(ratio() - .08) < 1e-9);
    assert.deepEqual(f.visible("red"), ["overlap", "tight-repeat"]);
    assert.deepEqual(f.visible("reference"), ["repeat"]);
    f.update(6.2); assert.ok(Math.abs(ratio() - .54) < 1e-9);
  } finally { f.cues.dispose(); }
});
