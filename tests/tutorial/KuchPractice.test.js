import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  ARRANGEMENTS,
  createKuchGuidance,
} from "../../src/tutorial/kuch/arrangements.js";
import {
  MELODY_PARTS,
  INTERLUDES,
  PRACTICE_BREAKS,
  SECTION_VERSION,
  CHORDS,
} from "../../src/tutorial/kuch/score.js";
import { kuchTiming, PRACTICE_TEMPOS } from "../../src/tutorial/kuch/timing.js";
import { PracticeProgress } from "../../src/tutorial/kuch/PracticeProgress.js";
import { assess } from "../../src/tutorial/kuch/assessment.js";
import { bendAt } from "../../src/tutorial/composition.js";
import { resolvePresentationValue } from "../../src/app/runtime/HonkPerformanceSampling.js";
import { BEND_SMOOTHING } from "../../src/config/honk.js";
import { bendGaugeState } from "../../src/tutorial/bendGaugeState.js";
import { observeBendGesture } from "../../src/tutorial/observeBendGesture.js";
import { compilePattern } from "../../src/compositions/CompositionCompiler.js";
import { createHarness } from "../helpers/looperCaptureHarness.js";
import { KuchTutorial } from "../../src/tutorial/kuch/KuchTutorial.js";
import { BendGauge } from "../../src/tutorial/BendGauge.js";
import { cueCanvas } from "../helpers/cueCanvas.js";
import {
  prepareKuchBacking,
  restoreKuchBacking,
  BACKING_ROLES,
} from "../../src/tutorial/kuch/prepareBacking.js";

test("phrase partition, local harmony and source versus practice interludes are explicit", () => {
  assert.equal(SECTION_VERSION, 2);
  assert.deepEqual(
    MELODY_PARTS.map((p) => p.events.length),
    [22, 39, 61, 63],
  );
  assert.deepEqual(
    MELODY_PARTS.map((p) => [p.sourceStart, p.sourceStart + p.beats]),
    [
      [0, 16],
      [16, 40],
      [48, 88],
      [96, 136],
    ],
  );
  assert.deepEqual(
    MELODY_PARTS.map((p) => p.backingChanges),
    [
      [[0, "D"]],
      [
        [0, "change"],
        [16, "D"],
      ],
      [
        [0, "D"],
        [16, "change"],
        [32, "D"],
      ],
      [
        [0, "D"],
        [16, "change"],
        [32, "D"],
      ],
    ],
  );
  assert.deepEqual(INTERLUDES, [
    [40, 48],
    [88, 96],
  ]);
  assert.deepEqual(
    PRACTICE_BREAKS.map((b) => [b.beats, b.kind]),
    [
      [8, "practice-only"],
      [8, "source"],
      [8, "source"],
    ],
  );
  for (const a of Object.values(ARRANGEMENTS)) {
    assert.equal(a.beats, 136);
    assert.deepEqual(
      a.parts.flatMap((p) => p.events.flatMap((e) => e.sourceEventIds)),
      a.events.flatMap((e) => e.sourceEventIds),
    );
    assert.ok(
      a.parts.every((p) =>
        p.events.every((e) => e.beat >= 0 && e.endBeat <= p.beats),
      ),
    );
  }
});

for (const bpm of PRACTICE_TEMPOS)
  test(`all 185 landmarks, processed bends and clock agree at ${bpm} BPM`, () => {
    const timing = kuchTiming(bpm, 12345),
      a = ARRANGEMENTS["easier-bends"];
    const heard = a.events.map((e) => {
      const duration = e.beats * timing.beatMs,
        samples = [];
      let value = 0,
        last = -Infinity;
      for (let t = 0; t < duration; t += 1000 / 90) {
        value = resolvePresentationValue(
          value,
          bendAt(e.bend, t / duration) / 4,
          BEND_SMOOTHING,
          1000 / 90,
          false,
        );
        if (t - last >= 30) {
          samples.push({ offsetMs: t, semitones: value * 4 });
          last = t;
        }
      }
      return {
        kind: "note",
        origin: "learner",
        role: e.role,
        midis: [e.midi],
        startMs: 12345 + e.beat * timing.beatMs,
        endMs: 12345 + (e.beat + e.beats) * timing.beatMs,
        released: true,
        voiced: true,
        articulated: true,
        allReleased: true,
        bendSamples: samples,
        maxAbsBend: Math.max(...samples.map((s) => Math.abs(s.semitones))),
      };
    });
    const result = assess(a.events, heard, 12345, timing);
    assert.equal(result.score, 100, JSON.stringify(result.failures));
    assert.equal(result.landmarks, 185);
    assert.equal(result.requiredCriteriaMet, true);
    assert.equal(result.bpm, bpm);
    const guide = createKuchGuidance(a.steps.at(-1), 12345, "practice", timing);
    assert.equal(guide.beatAt(12345 + 136 * timing.beatMs), 136);
    const expected = {
      40: [6, 24, 204],
      50: [4.8, 19.2, 163.2],
      60: [4, 16, 136],
      70: [3.429, 13.714, 116.571],
      80: [3, 12, 102],
      92: [2.609, 10.435, 88.696],
    }[bpm];
    [4, 16, 136].forEach((beats, i) =>
      assert.ok(
        Math.abs((beats * timing.beatMs) / 1000 - expected[i]) < 0.00051,
      ),
    );
  });

test("progress records actual BPM independently, with criteria, retries, toggling and manual skips", () => {
  const p = new PracticeProgress(),
    pass = { score: 85, requiredCriteriaMet: true },
    fail = { score: 99, requiredCriteriaMet: false };
  assert.equal(p.section("melody-1").bpm, 60);
  assert.deepEqual(p.record("melody-1", 60, pass), {
    passed: true,
    next: 70,
    bpm: 60,
  });
  assert.deepEqual(p.record("melody-1", 70, fail), {
    passed: false,
    next: 70,
    bpm: 70,
  });
  for (const id of ["melody-2", "melody-3", "melody-4", "performance"])
    assert.equal(p.section(id).bpm, 60);
  p.select("melody-2", 92);
  assert.deepEqual(p.section("melody-2").completed, {});
  p.record("melody-2", 92, pass);
  assert.deepEqual(p.section("melody-2").completed, { 92: true });
  p.enabled = false;
  p.record("melody-1", 70, pass);
  assert.equal(p.section("melody-1").bpm, 70);
  const restored = new PracticeProgress(p.export());
  assert.deepEqual(restored.export(), p.export());
  restored.enabled = true;
  restored.select("performance", 35);
  assert.equal(restored.section("performance").bpm, 40);
  assert.deepEqual(restored.section("performance").completed, {});
  assert.equal(restored.record("performance", 40, pass).next, 50);
  assert.equal(restored.record("performance", 50, pass).next, 60);
  assert.match(restored.describe("performance"), /Completed: 40, 50 BPM/);
  assert.equal(restored.section("melody-3").bpm, 60);
});

test("radial state distinguishes independent live value, missing input, wrong direction and overshoot", () => {
  for (const e of ARRANGEMENTS["easier-bends"].events.filter((e) => e.bend)) {
    const end = e.transition.semitones;
    assert.equal(bendGaugeState(e, 0, { semitones: 0 }).required, 0);
    assert.equal(bendGaugeState(e, 1).actual, null);
    assert.equal(bendGaugeState(e, 1).onTarget, false);
    assert.equal(bendGaugeState(e, 1, { semitones: end }).status, "On target");
    assert.equal(bendGaugeState(e, 1, { semitones: end / 2 }).onTarget, false);
    assert.equal(
      bendGaugeState(e, 1, { semitones: -end }).status,
      "Wrong direction",
    );
    assert.equal(
      bendGaugeState(e, 1, { semitones: end * 2 }).status,
      "Overshoot",
    );
    assert.equal(
      bendGaugeState(e, 1, { semitones: end, origin: "demonstration" })
        .demonstration,
      true,
    );
  }
});

for (const hand of ["left", "right"])
  test(`${hand} gauge reads only the correct current processed-live owner`, () => {
    const c = new THREE.Group();
    c.userData.handedness = hand;
    const h = {
      id: "target",
      root: { visible: true },
      getProcessedLivePerformanceState: () => ({ bend: 0.25 }),
      hasAudioVoice: () => true,
    };
    const gesture = {
      role: "lead-64",
      targetId: h.id,
      origin: "learner",
      id: "g",
    };
    const input = { trigger: true, raySqueezeInstrumentState: h };
    const a = {
      ids: (role) => (role === gesture.role ? [h.id] : []),
      gestures: new Map([[c, gesture]]),
      r: {
        controllerStates: new Map([[c, input]]),
        getControllerVoiceId: () => hand,
        getInstrumentVoiceId: () => hand,
      },
    };
    assert.equal(observeBendGesture(a, "lead-64", "practice").semitones, 1);
    assert.equal(observeBendGesture(a, "lead-67", "practice"), null);
    input.trigger = false;
    assert.equal(observeBendGesture(a, "lead-64", "practice"), null);
    input.trigger = true;
    gesture.origin = "demonstration";
    assert.equal(observeBendGesture(a, "lead-64", "practice"), null);
    assert.equal(
      observeBendGesture(a, "lead-64", "demonstration").origin,
      "demonstration",
    );
    gesture.origin = "learner";
    a.gestures.set(new THREE.Group(), { ...gesture });
    assert.equal(observeBendGesture(a, "lead-64", "practice"), null);
    a.gestures = new Map([
      [c, gesture],
      [new THREE.Group(), { targetId: "other", memberIds: [h.id, "other"] }],
    ]);
    assert.equal(
      observeBendGesture(a, "lead-64", "practice"),
      null,
      "Another controller in a touching chain must not drive the gauge",
    );
  });

test("source-tempo transport reuses an immutable sixteen-beat pattern through repeated tempo changes", () => {
  const h = createHarness({ connected: true, trackCount: 2 });
  const routes = Object.fromEntries(
    ["D", "C"].map((role, i) => [
      role,
      { trackId: h.looper.looperData.tracks[i].trackId, trackIndex: i },
    ]),
  );
  const timeline = compilePattern({
    events: CHORDS.change,
    beats: 16,
    beatMs: 60000 / 92,
    routes,
  });
  h.controller.restoreState(
    h.looper,
    { timeline: timeline.toJSON() },
    { preserveConnections: true },
  );
  const source = JSON.stringify(h.timeline.toJSON());
  for (const bpm of [40, 50, 60, 70, 80, 92, 40, 92]) {
    h.clock.beatIntervalMs = 60000 / bpm;
    h.controller.startPlayback(h.looper, 0);
    const duration =
      h.timeline.durationMs / h.controller.getPlaybackRate(h.looper, 0);
    assert.ok(Math.abs(duration - (16 * 60000) / bpm) < 0.001);
    assert.equal(JSON.stringify(h.timeline.toJSON()), source);
    h.controller.stopPlayback(h.looper);
  }
});

test("tempo commits cancel then restart once without recording an outcome or replacing the scene", () => {
  const k = Object.create(KuchTutorial.prototype),
    calls = [];
  Object.assign(k, {
    steps: [{ id: "melody-1", kind: "melody" }],
    index: 0,
    phase: { learner: true },
    practiceProgress: new PracticeProgress(),
    r: {},
    a: { get: () => ({ bpm: k.selectedBpm() }) },
    host: { render() {} },
    cancel() {
      calls.push("cancel");
      this.phase = null;
    },
    applyTempo() {
      calls.push(`tempo:${this.selectedBpm()}`);
    },
    persist() {},
    start(step, learner) {
      calls.push(`start:${step.id}:${learner}`);
      this.phase = { learner };
    },
  });
  k.setPracticeTempo(70);
  assert.deepEqual(calls, ["cancel", "tempo:70", "start:melody-1:true"]);
  k.setPracticeTempo(70);
  assert.equal(calls.length, 3);
  assert.deepEqual(k.practiceProgress.section("melody-1").attempts, {});
  k.r.capture = { active: true };
  k.a = { get: () => ({ bpm: 70 }) };
  k.setPracticeTempo(80);
  assert.equal(calls.length, 3);
});

test("section practice keeps backing through exactly one eight-beat break and never auto-starts the next tempo", () => {
  for (const [index, part] of ARRANGEMENTS.original.parts
    .slice(0, 3)
    .entries()) {
    const k = Object.create(KuchTutorial.prototype),
      stopped = [],
      metro = {
        bpm: 60,
        pause() {
          stopped.push("metronome");
        },
      };
    const backing = Object.fromEntries(
      ["chordLooper", "alternativeLooper", "percussionLooper"].map((role) => [
        role,
        {
          transport: { recording: false },
          stop() {
            stopped.push(role);
          },
        },
      ]),
    );
    Object.assign(k, {
      arrangement: ARRANGEMENTS.original,
      steps: [part],
      index: 0,
      phase: { ...part, learner: true },
      anchor: 0,
      timing: kuchTiming(60),
      queue: [],
      heard: [],
      results: {},
      practiceProgress: new PracticeProgress(),
      lastNow: null,
      r: { audioSystem: {} },
      host: {
        cues: { reset() {} },
        panel: {
          setTransport(text) {
            this.text = text;
          },
        },
      },
      a: {
        virtuals: [{}, {}],
        get: (role) => (role === "metronome" ? metro : backing[role]),
        park() {},
        releaseVirtuals() {},
      },
      ready: () => false,
      playNote() {},
      persist() {},
      next() {
        this.phase = null;
      },
    });
    k.update(part.beats * 1000);
    assert.deepEqual(stopped, [], "Backing continues at the phrase boundary");
    assert.equal(k.guide, null);
    for (
      let now = part.beats * 1000 + 250;
      now < (part.beats + 8) * 1000;
      now += 250
    )
      k.update(now);
    assert.deepEqual(stopped, []);
    assert.equal(k.phase.id, part.id);
    assert.equal(k.practiceProgress.section(part.id).bpm, 60);
    k.model((part.beats + 4) * 1000);
    assert.match(
      k.host.panel.text,
      index === 0
        ? /Practice-only bridge.*4 beats remaining.*Part 2/
        : /Interlude.*4 beats remaining/,
    );
    k.update((part.beats + 8) * 1000);
    assert.equal(k.phase, null);
    assert.equal(stopped.length, 4);
    assert.equal(k.report.bpm, 60);
    assert.equal(
      k.report.result.correct,
      0,
      "Elapsed time alone earns no mastery",
    );
  }
});

test("radial presentation reuses its objects, keeps matching markers distinct, and disposes every root", () => {
  const scene = new THREE.Scene(),
    g = new BendGauge(scene, cueCanvas),
    e = ARRANGEMENTS["easier-bends"].events.find((e) => e.bend);
  const ids = () => {
    const values = [];
    g.root.traverse((n) =>
      values.push(n.uuid, n.geometry?.uuid, n.material?.uuid),
    );
    return values;
  };
  const before = ids(),
    state = bendGaugeState(e, 1, { semitones: 2 }),
    position = new THREE.Vector3(3, 2, 1),
    rotation = new THREE.Quaternion();
  g.update(state, position, 0.2, rotation, 1, null, 0);
  const version = g.texture.version;
  for (let now = 1; now < 300; now++)
    g.update(state, position, 0.2, rotation, 1, null, now);
  assert.deepEqual(ids(), before);
  assert.equal(
    g.texture.version,
    version,
    "Unchanged numerical labels do not redraw",
  );
  assert.deepEqual(g.root.position.toArray(), position.toArray());
  assert.equal(g.root.scale.x, 0.2 * 1.12);
  assert.ok(
    g.expected.position.distanceTo(g.actual.position) > 0.15,
    "Both shapes remain visible on a matching radial spoke",
  );
  const x = g.actual.position.x;
  g.update(state, position, 0.2, rotation, -1, null, 400);
  assert.ok(Math.abs(g.actual.position.x + x) < 1e-9);
  g.update(bendGaugeState(e, 1), position, 0.2, rotation, 1, null, 600);
  assert.equal(g.actual.visible, false);
  assert.equal(g.arc.visible, false);
  g.reset();
  assert.equal(g.root.visible, false);
  assert.equal(g.root.userData.binding, null);
  g.dispose();
  assert.equal(scene.children.length, 0);
});

test("shared preparation reuses compatible learner takes and restores incompatible temporary replacements", () => {
  const instruments = new Map();
  BACKING_ROLES.forEach((role) => {
    const h = createHarness({ connected: true, trackCount: 3 }),
      instrument = h.looper;
    instrument.looperController = h.controller;
    Object.defineProperties(instrument, {
      timeline: { get: () => instrument.looperData.timeline },
      tracks: { get: () => instrument.looperData.tracks },
    });
    instruments.set(role, instrument);
  });
  const adapter = {
    get: (role) => instruments.get(role),
    ids: (role) =>
      [{ D: "honk-0", C: "honk-1", percussion: "honk-2" }[role]].filter(
        Boolean,
      ),
  };
  prepareKuchBacking(adapter);
  const first = adapter.get("chordLooper"),
    second = adapter.get("alternativeLooper");
  const routes = { D: { trackId: first.tracks[0].trackId, trackIndex: 0 } };
  const learner = compilePattern({
    events: CHORDS.D,
    beats: 16,
    beatMs: 1000,
    routes,
  });
  first.looperController.restoreState(
    first,
    { timeline: learner.toJSON() },
    { preserveConnections: true },
  );
  const short = compilePattern({
    events: [{ ...CHORDS.D[0], beats: 1 }],
    beats: 8,
    beatMs: 1000,
    routes: { D: { trackId: second.tracks[0].trackId, trackIndex: 0 } },
  });
  second.looperController.restoreState(
    second,
    { timeline: short.toJSON() },
    { preserveConnections: true },
  );
  const saved = JSON.stringify(first.looperController.serializeState(first)),
    shortSaved = JSON.stringify(second.looperController.serializeState(second)),
    snapshots = new Map();
  prepareKuchBacking(adapter, { preserveExisting: true, snapshots });
  assert.equal(
    JSON.stringify(first.looperController.serializeState(first)),
    saved,
  );
  assert.equal(second.timeline.fixedWindowBeats, 16);
  assert.equal(snapshots.size, 1);
  const prepared = JSON.stringify(second.timeline.toJSON());
  prepareKuchBacking(adapter, { preserveExisting: true, snapshots });
  assert.equal(JSON.stringify(second.timeline.toJSON()), prepared);
  assert.equal(snapshots.size, 1);
  restoreKuchBacking(adapter, snapshots);
  assert.equal(
    JSON.stringify(second.looperController.serializeState(second)),
    shortSaved,
  );
  assert.equal(
    JSON.stringify(first.looperController.serializeState(first)),
    saved,
  );
});
