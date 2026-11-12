import test from "node:test";
import assert from "node:assert/strict";
import { Group, Quaternion, Vector3, MathUtils } from "three";
import { fixture, flushAudio } from "../helpers/manualHonkFixture.mjs";
import { HonkPerformanceRuntimeMethods } from "../../src/app/runtime/HonkPerformanceRuntime.js";
import { XRInteractionRuntimeMethods } from "../../src/app/runtime/XRInteractionRuntime.js";
import { BEND_SENSITIVITY, BEND_LOCK_THRESHOLD_DEGREES } from "../../src/config/honk.js";

// Use production wrist sampling and capture reference with real quaternions;
// keep the existing instrument/audio fixture for observable voice ownership.
function angleFixture(options = {}) {
  const f = fixture(options),
    axis = new Vector3(0, 0, 1);
  const frames = f.controllers.map((c, i) => {
    const group = new Group();
    group.rotation.set(0.3, -0.4, i ? -0.7 : 1.1);
    const neutral = group.quaternion.clone();
    c.updateMatrixWorld = (force) => group.updateMatrixWorld(force);
    c.getWorldQuaternion = (out) => group.getWorldQuaternion(out);
    const state = f.host.controllerStates.get(c);
    state.raySqueezeStartQuaternion = new Quaternion();
    state.raySqueezeStartInverseQuaternion = new Quaternion();
    return { group, neutral };
  });
  f.host.resetRaySqueezeReference = XRInteractionRuntimeMethods.resetRaySqueezeReference;
  f.host.getControllerRollAngle = HonkPerformanceRuntimeMethods.getControllerRollAngle;
  f.host.getControllerRollBend = HonkPerformanceRuntimeMethods.getControllerRollBend;
  return Object.assign(f, {
    rotate(degrees, index = 0) {
      frames[index].group.quaternion
        .copy(frames[index].neutral)
        .multiply(new Quaternion().setFromAxisAngle(axis, MathUtils.degToRad(degrees)));
    },
  });
}

for (const locked of [false, true])
  for (const degrees of [-20, -6.1, -5.9, 0, 5.9, 6.1, 20])
    test(`bend-lock follows wrist angle rather than time (locked=${locked}, degrees=${degrees})`, async () => {
      const f = angleFixture({ locked }),
        c = f.controllers[0],
        state = f.host.controllerStates.get(c);
      const shouldLock = Math.abs(degrees) >= BEND_LOCK_THRESHOLD_DEGREES;
      f.press();
      f.frame(0);
      await flushAudio();
      const voice = f.audio.voices.get("left:h0");
      assert.ok(voice, "Sound starts immediately on contact");
      f.rotate(degrees);
      f.frame(0);
      assert.equal(state.raySqueezeLatched, shouldLock, "Angle alone controls locking");
      assert.ok(
        Math.abs(
          f.honks[0].getLivePerformanceState().bend -
            MathUtils.degToRad(degrees) * BEND_SENSITIVITY,
        ) < 1e-9,
      );
      f.frame(5000);
      assert.equal(state.raySqueezeLatched, shouldLock, "A long hold cannot lock a straight note");
      assert.equal(f.audio.voices.get("left:h0"), voice);
      c.hit = null;
      c.lockedHit = null;
      f.frame(0);
      assert.equal(f.audio.voices.get("left:h0"), shouldLock ? voice : undefined);
      f.rotate(0);
      f.frame(500);
      assert.equal(
        f.audio.voices.get("left:h0"),
        shouldLock ? voice : undefined,
        "An established lock survives returning to neutral",
      );
      assert.equal(f.counters.starts, 1);
      f.release();
      assert.equal(f.audio.voices.size, 0);
      assert.equal(state.raySqueezeLatched, false);
      assert.equal(state.raySqueezeAcquiredAt, null);
    });

for (const direction of [-1, 1])
  test(`crossing the bend threshold and leaving in the same frame keeps the captured note (${direction})`, async () => {
    const f = angleFixture(),
      c = f.controllers[0];
    f.press();
    f.frame(0);
    await flushAudio();
    const voice = f.audio.voices.get("left:h0");
    f.rotate(direction * (BEND_LOCK_THRESHOLD_DEGREES + 0.1));
    c.hit = null;
    f.frame(0);
    assert.equal(f.audio.voices.get("left:h0"), voice);
    assert.equal(f.host.controllerStates.get(c).raySqueezeLatched, true);
    f.release();
    f.press(null);
    f.rotate(direction * 20);
    f.frame(5000);
    assert.equal(f.audio.voices.size, 0, "Rolling in empty space cannot acquire a note");
    assert.equal(f.host.controllerStates.get(c).raySqueezeLatched, false);
    f.release();
  });

for (const elapsed of [1, 50, 99.9, 100, 1000, 5000])
  test(`leaving after ${elapsed} ms stops below the bend-lock threshold`, async () => {
    const f = angleFixture(),
      c = f.controllers[0],
      state = f.host.controllerStates.get(c);
    f.press();
    f.frame(0);
    await flushAudio();
    f.rotate(BEND_LOCK_THRESHOLD_DEGREES - 0.1);
    f.frame(elapsed);
    c.hit = null;
    f.frame(0);
    assert.equal(f.audio.voices.size, 0);
    assert.equal(state.raySqueezeAcquiredAt, null);
    f.frame(500);
    assert.equal(f.audio.voices.size, 0);
    f.release();
  });

test("switching targets or leaving and returning starts a fresh contact", async () => {
  const f = angleFixture({ count: 2 }),
    c = f.controllers[0],
    state = f.host.controllerStates.get(c);
  f.honks[1].x = 5;
  for (let i = 0; i < 4; i++) f.frame(0);
  f.press();
  f.frame(90);
  await flushAudio();
  c.hit = f.honks[1].squeezeCollider;
  f.frame(0);
  await flushAudio();
  assert.equal(f.audio.voices.has("left:h0"), false);
  assert.ok(f.audio.voices.has("left:h1"));
  assert.equal(state.raySqueezeAcquiredAt, f.now);
  f.frame(99);
  c.hit = null;
  f.frame(0);
  assert.equal(f.audio.voices.size, 0);
  f.frame(500);
  c.hit = f.honks[1].squeezeCollider;
  f.frame(0);
  await flushAudio();
  assert.equal(state.raySqueezeAcquiredAt, f.now);
  f.frame(99);
  f.frame(1);
  c.hit = f.honks[0].squeezeCollider;
  f.frame(0);
  await flushAudio();
  assert.ok(f.audio.voices.has("left:h0"), "A new hit takes over from the sustained note");
  assert.equal(f.audio.voices.has("left:h1"), false);
  assert.equal(state.raySqueezeAcquiredAt, f.now);
  f.frame(99);
  f.frame(1);
  f.release();
  f.press();
  f.frame(0);
  await flushAudio();
  c.hit = null;
  f.frame(0);
  assert.equal(f.audio.voices.size, 0, "Every press stops when its ray leaves");
  f.release();
});

test("hover and holding Trigger in empty space cannot retain a note", async () => {
  const f = angleFixture(),
    c = f.controllers[0],
    state = f.host.controllerStates.get(c);
  c.hit = f.honks[0].squeezeCollider;
  f.frame(1000);
  f.press();
  f.frame(99);
  await flushAudio();
  c.hit = null;
  f.frame(0);
  assert.equal(f.audio.voices.size, 0);
  f.frame(1000);
  c.hit = f.honks[0].squeezeCollider;
  f.frame(0);
  await flushAudio();
  assert.equal(state.raySqueezeAcquiredAt, f.now);
  c.hit = null;
  f.frame(1);
  assert.equal(f.audio.voices.size, 0);
  f.release();
});

test("the first frame after a missed update stops a target the ray has left", async () => {
  const f = angleFixture(),
    c = f.controllers[0],
    state = f.host.controllerStates.get(c);
  f.press();
  f.frame(50);
  await flushAudio();
  c.hit = null;
  f.frame(100);
  assert.equal(f.audio.voices.size, 0);
  assert.equal(state.raySqueezeTarget, null);
  f.release();
});

test("each hand stops independently when its ray leaves", async () => {
  const f = angleFixture(),
    [left, right] = f.controllers;
  f.press(f.honks[0].squeezeCollider, left);
  f.frame(100);
  await flushAudio();
  f.press(f.honks[0].squeezeCollider, right);
  f.frame(99);
  await flushAudio();
  right.hit = null;
  f.frame(0);
  assert.ok(f.audio.voices.has("left:h0"));
  assert.equal(f.audio.voices.has("right:h0"), false);
  left.hit = null;
  f.frame(0);
  assert.equal(f.audio.voices.size, 0);
  f.release(left);
  f.release(right);
});

for (const range of [4, 5])
  test(`range ${range} preserves wrist sensitivity and keeps one original voice through the hold`, async () => {
    const f = angleFixture(),
      h = f.honks[0],
      c = f.controllers[0];
    h.pitchBendRange = range;
    f.press();
    f.frame(0);
    await flushAudio();
    const voice = f.audio.voices.get("left:h0");
    f.rotate(BEND_LOCK_THRESHOLD_DEGREES - 0.1);
    f.frame(0);
    assert.equal(f.host.controllerStates.get(c).raySqueezeLatched, false);
    f.rotate(BEND_LOCK_THRESHOLD_DEGREES + 0.1);
    f.frame(0);
    assert.equal(
      f.host.controllerStates.get(c).raySqueezeLatched,
      true,
      "Lock angle is independent of pitch-bend range",
    );
    for (const semitones of [0, -1, -3, 2, -3, -1, -3, -5]) {
      f.rotate(MathUtils.radToDeg(semitones / (4 * BEND_SENSITIVITY)));
      // Settle the existing presentation smoothing without releasing Trigger.
      for (let i = 0; i < 100; i++) f.frame(1000 / 90);
      const expected = Math.max(-range, Math.min(range, semitones));
      assert.ok(Math.abs(h.getLivePerformanceState().bend * range - expected) < 1e-8);
      assert.ok(Math.abs(voice.source.detune.value - expected * 100) < 0.01);
      assert.equal(f.audio.voices.get("left:h0"), voice);
    }
    c.hit = null;
    f.frame();
    assert.equal(f.audio.voices.get("left:h0"), voice, "Bend-lock retains the note off target");
    assert.equal(f.counters.starts, 1);
    f.release();
    assert.equal(f.audio.voices.size, 0);
  });

test("touching Honks with different ranges bend by the same semitones within their limits", async () => {
  const f = angleFixture({ count: 2 });
  f.honks[0].pitchBendRange = 5;
  f.press();
  f.frame(0);
  await flushAudio();
  for (const semitones of [-2, 3, -5]) {
    f.rotate(MathUtils.radToDeg(semitones / (4 * BEND_SENSITIVITY)));
    for (let i = 0; i < 100; i++) f.frame(1000 / 90);
    for (const [i, range] of [5, 4].entries()) {
      const expected = Math.max(-range, Math.min(range, semitones));
      assert.ok(
        Math.abs(f.audio.voices.get(`left:h${i}`).source.detune.value - expected * 100) < 0.01,
      );
    }
  }
  assert.equal(f.counters.starts, 2);
  f.release();
});
