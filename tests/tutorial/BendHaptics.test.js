import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { BendHaptics, bendHapticStops, BEND_HAPTIC_PULSE } from "../../src/tutorial/BendHaptics.js";
import { TutorialTimingCues } from "../../src/tutorial/TutorialTimingCues.js";
import { HonkPerformanceRuntimeMethods } from "../../src/app/runtime/HonkPerformanceRuntime.js";
import { HapticsService } from "../../src/xr/HapticsService.js";
import { BEND_SENSITIVITY, MAX_PITCH_BEND_SEMITONES } from "../../src/config/honk.js";
import { cueCanvas } from "../helpers/cueCanvas.js";

const curve = values => values.map((semitones, i) => ({ semitones, fraction: i / (values.length - 1) }));
const event = { role: "lead", midi: 60, beat: 0, beats: 8, bend: curve([0, 0, 1.5, 1.5, -2, -2]) };

function fixture({ range = 4, twoHands = false } = {}) {
  const pulses = [], targets = new Map(), scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  const r = { scene, controllers: [], controllerStates: new Map(),
    getUserCamera: () => camera,
    getControllerGamepad: c => c.userData.gamepad,
    getControllerVoiceId: c => c.uuid, getInstrumentVoiceId: (id, h) => `${id}:${h.id}`,
    getControllerRollAngle: HonkPerformanceRuntimeMethods.getControllerRollAngle,
    getControllerRollBend: HonkPerformanceRuntimeMethods.getControllerRollBend,
    hapticsService: new HapticsService(), tutorial: { guidedPlayOffset: { milliseconds: 0 } },
  };
  const a = { r, gestures: new Map(), lastStrikes: new Map(),
    get: role => targets.get(role), ids: role => [targets.get(role)?.id] };
  for (const role of twoHands ? ["lead", "other"] : ["lead"]) {
    const c = new THREE.Group(), root = new THREE.Group();
    scene.add(c, root); r.controllers.push(c);
    c.userData.gamepad = { hapticActuators: [{ pulse(intensity, durationMs) {
      pulses.push({ controller: c, intensity, durationMs }); return Promise.resolve(true);
    } }] };
    const target = { id: role, root, pitchBendRange: range, hornHolders: new Set([c.uuid]),
      hasAudioVoice: () => true,
      getSqueezeColliderSphere: () => ({ center: root.position, radius: .1 }),
      getProcessedLivePerformanceState: () => ({ bend: 0 }),
      getLivePerformanceState: () => ({ bend: r.getControllerRollBend(c, interaction) }),
    };
    const interaction = { instrumentState: target, bendStartInverseQuaternion: new THREE.Quaternion() };
    targets.set(role, target);
    r.controllerStates.set(c, { trigger: true, raySqueezeInstrumentState: target,
      raySqueezeStartInverseQuaternion: interaction.bendStartInverseQuaternion });
    a.gestures.set(c, { id: `${role}-hold`, role, origin: "learner", targetId: role,
      voiced: true, startMs: 0, voicedStartMs: 0 });
  }
  const haptics = new BendHaptics(a), events = [event];
  if (twoHands) events.push({ ...event, role: "other" });
  return { r, a, targets, pulses, haptics, events,
    roll(semitones, index = 0) {
      r.controllers[index].rotation.z = semitones / MAX_PITCH_BEND_SEMITONES / BEND_SENSITIVITY;
    },
    update() { haptics.update(events); },
  };
}

test("stops match semitone marks, fractional holds and turns, not interpolated samples", () => {
  assert.deepEqual(bendHapticStops([{ bend: curve([0, .2, .6, 1.5, 1.5, .7, -.5, 0]) }]),
    [-4, -3, -2, -1, -.5, 0, 1, 1.5, 2, 3, 4]);
  assert.deepEqual(bendHapticStops([], 5), [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5]);
});

for (const range of [4, 5]) test(`range ${range}: thuds occur at exact wrist targets in both directions`, () => {
  const f = fixture({ range }); f.update();
  assert.equal(f.pulses.length, 0, "Acquiring a neutral hold does not pulse");
  for (const value of [1, 1.5, 2, 3, 4, ...(range === 5 ? [5] : [])]) {
    f.roll(value - .001); f.update();
    const before = f.pulses.length;
    f.roll(value); f.update();
    assert.equal(f.pulses.length, before + 1, `Exactly +${value}, before audio smoothing settles`);
  }
  for (const value of [range - 1, ...Array.from({ length: range * 2 - 1 }, (_, i) => range - 2 - i)]) {
    f.roll(value + .001); f.update();
    const before = f.pulses.length;
    f.roll(value); f.update();
    assert.equal(f.pulses.length, before + 1, `Exactly ${value} on the return/downward roll`);
  }
  for (const pulse of f.pulses) {
    assert.equal(pulse.intensity, BEND_HAPTIC_PULSE.intensity);
    assert.equal(pulse.durationMs, BEND_HAPTIC_PULSE.durationMs);
  }
});

test("resting and jitter stay quiet; leaving and returning rearms at the same target", () => {
  const f = fixture(); f.update(); f.roll(1); f.update();
  for (const value of [1, .99, 1.02, .98, 1, 1.03, 1]) { f.roll(value); f.update(); }
  assert.equal(f.pulses.length, 1);
  f.roll(.85); f.update(); f.roll(.999); f.update();
  assert.equal(f.pulses.length, 1);
  f.roll(1); f.update(); assert.equal(f.pulses.length, 2);
  f.roll(1.2); f.update(); f.roll(1); f.update(); assert.equal(f.pulses.length, 3);
});

test("large frame jumps produce one timely thud with no delayed backlog", () => {
  const f = fixture(); f.update(); f.roll(3.2); f.update();
  assert.equal(f.pulses.length, 1);
  for (let i = 0; i < 100; i++) f.update();
  assert.equal(f.pulses.length, 1);
  f.roll(-3.2); f.update(); assert.equal(f.pulses.length, 2);
});

test("each hand pulses independently and released, replaced or disconnected holds reset", () => {
  const f = fixture({ twoHands: true }), [left, right] = f.r.controllers;
  f.update(); f.roll(1); f.update(); f.roll(-1, 1); f.update();
  assert.deepEqual(f.pulses.map(p => p.controller), [left, right]);
  f.r.controllerStates.get(left).trigger = false; f.roll(2); f.update();
  assert.equal(f.haptics.holds.has(left), false);
  f.r.controllerStates.get(left).trigger = true;
  f.a.gestures.get(left).id = "new-hold"; f.roll(0); f.update();
  assert.equal(f.pulses.length, 2);
  f.roll(1); f.update(); assert.equal(f.pulses.length, 3);
  left.userData.inputConnected = false; f.roll(2); f.update();
  assert.equal(f.pulses.length, 3); assert.equal(f.haptics.holds.has(left), false);
});

for (const excluded of ["virtual", "demonstration", "unvoiced", "ambiguous", "no-gamepad", "stick"]) {
  test(`${excluded} input cannot produce bend haptics`, () => {
    const f = fixture(), c = f.r.controllers[0], target = f.targets.get("lead");
    if (excluded === "virtual") c.userData.virtualTutorial = true;
    if (excluded === "demonstration") f.a.gestures.get(c).origin = "demonstration";
    if (excluded === "unvoiced") target.hasAudioVoice = () => false;
    if (excluded === "ambiguous") target.hornHolders.add("other-owner");
    if (excluded === "no-gamepad") delete c.userData.gamepad;
    if (excluded === "stick") f.r.controllerStates.get(c).stickActive = true;
    f.update(); f.roll(1); f.update(); assert.equal(f.pulses.length, 0);
  });
}

test("unsupported and rejected actuators do not interrupt guidance", async () => {
  const f = fixture(), c = f.r.controllers[0];
  c.userData.gamepad = {}; f.update(); f.roll(1); f.update();
  c.userData.gamepad = { hapticActuators: [{ pulse() { return Promise.reject(new Error("Unavailable")); } }] };
  f.roll(2); f.update();
  await new Promise(resolve => setImmediate(resolve));
});

for (const mode of ["practice", "recording"]) test(`${mode} cues use live wrist haptics independent of visual timing offset`, () => {
  const f = fixture(), cues = new TutorialTimingCues(f.a, { createCanvas: cueCanvas });
  const session = { mode, step: { timed: true, events: f.events },
    beatMs: 1000, anchorMs: 0, beatAt: now => now / 1000 };
  try {
    cues.update(session, 0); f.roll(1); cues.update(session, 100);
    assert.equal(f.pulses.length, 1);
    f.r.tutorial.guidedPlayOffset.milliseconds = 1000; cues.update(session, 200);
    assert.equal(f.pulses.length, 1, "Moving the visual target does not vibrate the controller");
    f.roll(1.5); cues.update(session, 300); assert.equal(f.pulses.length, 2);
    cues.update(session, 400, { active: false });
    assert.equal(cues.bendHaptics.holds.size, 0);
    f.roll(2); cues.update(null, 500); assert.equal(f.pulses.length, 2);
    cues.update({ ...session, mode: "demonstration" }, 600);
    assert.equal(cues.bendHaptics.holds.size, 0);
  } finally { cues.dispose(); }
});
