import test from "node:test";
import assert from "node:assert/strict";
import { MetronomeInstrument } from "../../../src/instruments/metronome/MetronomeInstrument.js";
import { getMetronomePendulumAngle } from "../../../src/instruments/metronome/MetronomePendulumRig.js";

test("default controls initialize the handle rig at both value-range midpoints", () => {
  const values = {};
  const metronome = new MetronomeInstrument({
    id: "metro-default-handles",
    root: object3D(),
    handleRig: { setValue: (parameter, value) => { values[parameter] = value; } },
  });

  assert.equal(metronome.bpm, 135);
  assert.equal(metronome.volume, 0.5);
  assert.deepEqual(values, { bpm: 135, volume: 0.5 });
});

test("metronome clamps controls, schedules clicks by BPM, and pauses", () => {
  const clicks = [];
  const metronome = new MetronomeInstrument({
    id: "metro-1",
    root: object3D(),
    audioSystem: { triggerMetronomeClick: (options) => clicks.push(options) },
  });
  metronome.setBpm(120);
  metronome.setVolume(0.4);
  metronome.play(1000);

  assert.equal(metronome.update(1000), true);
  assert.equal(metronome.update(1499), false);
  assert.equal(metronome.update(1500), true);
  assert.deepEqual(clicks, [{ volume: 0.4 }, { volume: 0.4 }]);
  assert.equal(metronome.pause(), false);
  assert.equal(metronome.update(2000), false);
});

test("transport observers report pause immediately for direct pulse cleanup", () => {
  const events = [];
  const metronome = new MetronomeInstrument({
    id: "metro-lifecycle",
    root: object3D(),
    onTransportChange: ({ metronome: source, playing, now }) => {
      events.push({ id: source.id, playing, now });
    },
  });

  metronome.play(1000);
  metronome.pause(1250);
  assert.deepEqual(events, [
    { id: "metro-lifecycle", playing: true, now: 1000 },
    { id: "metro-lifecycle", playing: false, now: 1250 },
  ]);
});

test("pause silences clicks but preserves a phase-continuous clock for linked Loopers", () => {
  const clicks = [];
  const metronome = new MetronomeInstrument({
    id: "metro-silent-grid",
    root: object3D(),
    audioSystem: { triggerMetronomeClick: () => clicks.push(true) },
  });
  metronome.setBpm(120);
  metronome.play(1000);
  metronome.update(1000);
  metronome.pause(1250);

  assert.deepEqual(metronome.getBeatTiming(1750), {
    active: false,
    clockAvailable: true,
    bpm: 120,
    beatIntervalMs: 500,
    beatOriginMs: 1000,
    nearestBeatMs: 2000,
    beatPosition: 1.5,
    lastBeatMs: 1500,
    lastEmittedBeatOrdinal: null,
  });
  assert.equal(metronome.update(1750), false);
  assert.equal(clicks.length, 1);

  metronome.play(1750);
  assert.equal(metronome.nextTickMs, 2000);
  assert.equal(metronome.update(1999), false);
  assert.equal(metronome.update(2000), true);
  assert.equal(clicks.length, 2);
});

test("BPM changes preserve the silent paused clock phase", () => {
  const metronome = new MetronomeInstrument({ id: "metro-paused-bpm", root: object3D() });
  const originalNow = performance.now;
  performance.now = () => 1750;
  try {
    metronome.setBpm(120);
    metronome.play(1000);
    metronome.pause(1250);
    const before = metronome.getBeatTiming(1750).beatPosition;
    metronome.setBpm(60);
    const after = metronome.getBeatTiming(1750);
    assert.equal(after.active, false);
    assert.equal(after.clockAvailable, true);
    assert.equal(after.beatPosition, before);
    assert.equal(after.beatOriginMs, 250);
  } finally {
    performance.now = originalNow;
  }
});

test("metronome persists BPM and volume but restores paused", () => {
  const metronome = new MetronomeInstrument({ id: "metro-2", root: object3D() });
  metronome.restore({ bpm: 999, volume: -2 });
  assert.equal(metronome.bpm, 240);
  assert.equal(metronome.volume, 0);
  assert.equal(metronome.playing, false);
  assert.deepEqual(
    { bpm: metronome.serialize().bpm, volume: metronome.serialize().volume },
    { bpm: 240, volume: 0 },
  );
});

test("changing BPM while playing preserves beat phase instead of immediately retriggering", () => {
  const clicks = [];
  const metronome = new MetronomeInstrument({
    id: "metro-smooth",
    root: object3D(),
    audioSystem: { triggerMetronomeClick: () => clicks.push(true) },
  });
  const originalNow = performance.now;
  performance.now = () => 1250;
  try {
    metronome.setBpm(120);
    metronome.play(1000);
    metronome.update(1000);
    metronome.setBpm(60);
    assert.equal(metronome.nextTickMs, 1750);
    assert.equal(metronome.update(1251), false);
    assert.equal(metronome.update(1750), true);
    assert.equal(clicks.length, 2);
  } finally {
    performance.now = originalNow;
  }
});

test("changing BPM after an odd beat preserves pendulum side and direction", () => {
  const metronome = new MetronomeInstrument({
    id: "metro-phase-parity",
    root: object3D(),
  });
  const originalNow = performance.now;
  performance.now = () => 1625;
  try {
    metronome.setBpm(120);
    metronome.play(1000);
    metronome.update(1000);
    metronome.update(1500);

    const swingRadians = 0.4;
    const before = getMetronomePendulumAngle({
      nowMs: 1625,
      beatOriginMs: metronome.beatOriginMs,
      bpm: metronome.bpm,
      swingRadians,
    });
    metronome.setBpm(60);
    const after = getMetronomePendulumAngle({
      nowMs: 1625,
      beatOriginMs: metronome.beatOriginMs,
      bpm: metronome.bpm,
      swingRadians,
    });

    assert.ok(before < 0);
    assert.ok(Math.abs(after - before) < 1e-12);
    assert.equal(metronome.nextBeatIndex, 2);
    assert.equal(metronome.nextTickMs, 2375);
    assert.equal(metronome.beatOriginMs, 375);
  } finally {
    performance.now = originalNow;
  }
});

test("missed frames retain the pendulum beat ordinal across a BPM change", () => {
  const metronome = new MetronomeInstrument({
    id: "metro-missed-frames",
    root: object3D(),
  });
  const originalNow = performance.now;
  performance.now = () => 2675;
  try {
    metronome.setBpm(120);
    metronome.play(1000);
    metronome.update(1000);
    metronome.update(2600);
    assert.equal(metronome.nextBeatIndex, 4);
    assert.equal(metronome.nextTickMs, 3000);

    const swingRadians = 0.4;
    const before = getMetronomePendulumAngle({
      nowMs: 2675,
      beatOriginMs: metronome.beatOriginMs,
      bpm: metronome.bpm,
      swingRadians,
    });
    const beforeNext = getMetronomePendulumAngle({
      nowMs: 2676,
      beatOriginMs: metronome.beatOriginMs,
      bpm: metronome.bpm,
      swingRadians,
    });
    metronome.setBpm(60);
    const after = getMetronomePendulumAngle({
      nowMs: 2675,
      beatOriginMs: metronome.beatOriginMs,
      bpm: metronome.bpm,
      swingRadians,
    });
    const afterNext = getMetronomePendulumAngle({
      nowMs: 2676,
      beatOriginMs: metronome.beatOriginMs,
      bpm: metronome.bpm,
      swingRadians,
    });

    assert.ok(Math.abs(after - before) < 1e-12);
    assert.equal(Math.sign(afterNext - after), Math.sign(beforeNext - before));
    assert.equal(metronome.nextBeatIndex, 4);
    assert.equal(metronome.nextTickMs, 3325);
    assert.equal(metronome.beatOriginMs, -675);
  } finally {
    performance.now = originalNow;
  }
});

test("metronome drives and resets its pendulum rig with playback lifecycle", () => {
  const updates = [];
  let resets = 0;
  let disposals = 0;
  const pendulumRig = {
    update(options) {
      updates.push({ ...options });
      return 0.25;
    },
    reset() {
      resets += 1;
      return 0;
    },
    dispose() {
      disposals += 1;
    },
  };
  const metronome = new MetronomeInstrument({
    id: "metro-pendulum",
    root: object3D(),
    bpm: 120,
    pendulumRig,
  });

  metronome.play(1000);
  metronome.update(1250);
  assert.deepEqual(updates, [
    { nowMs: 1000, bpm: 120, beatOriginMs: 1000, playing: true },
    { nowMs: 1250, bpm: 120, beatOriginMs: 1000, playing: true },
  ]);

  metronome.pause();
  assert.equal(resets, 1);
  metronome.dispose();
  assert.equal(resets, 2);
  assert.equal(disposals, 1);
  assert.equal(metronome.pendulumRig, null);
});

test("a duplicated metronome copies controls and scale but starts paused with independent rigs", () => {
  const sourceRig = { values: {}, setValue(parameter, value) { this.values[parameter] = value; } };
  const duplicateRig = { values: {}, setValue(parameter, value) { this.values[parameter] = value; } };
  const source = new MetronomeInstrument({
    id: "metro-source", root: object3D(), bpm: 175, volume: 0.35, handleRig: sourceRig,
  });
  source.baseScale = 3.25;
  source.play(1000);
  const duplicate = new MetronomeInstrument({
    id: "metro-copy", root: object3D(), bpm: source.bpm, volume: source.volume, handleRig: duplicateRig,
  });
  duplicate.baseScale = source.baseScale;
  duplicate.setBpm(duplicate.bpm);
  duplicate.setVolume(duplicate.volume);

  assert.equal(duplicate.bpm, 175);
  assert.equal(duplicate.volume, 0.35);
  assert.equal(duplicate.baseScale, 3.25);
  assert.equal(duplicate.playing, false);
  assert.deepEqual(duplicateRig.values, { bpm: 175, volume: 0.35 });
  assert.notStrictEqual(duplicate.handleRig, source.handleRig);
});

test("metronome playback keeps its schedule while the scene is in placement mode", () => {
  const clicks = [];
  const metronome = new MetronomeInstrument({
    id: "metro-placement",
    root: object3D(),
    audioSystem: { triggerMetronomeClick: () => clicks.push(true) },
  });
  metronome.setBpm(120);
  metronome.play(1000);
  metronome.pendingPlacement = true;

  assert.equal(metronome.update(1000), true);
  assert.equal(metronome.update(1500), true);
  assert.equal(clicks.length, 2);
  assert.equal(metronome.playing, true);
});

test("Play eye latches without restarting cadence and Pause eye resets playback", () => {
  const events = [];
  const buttonRig = {
    setPressed(action, pressed) { events.push(`set:${action}:${pressed}`); },
    press(action, now) { events.push(`press:${action}:${now}`); },
    reset() { events.push("reset"); },
    update() {},
  };
  const metronome = new MetronomeInstrument({
    id: "metro-eyes",
    root: object3D(),
    buttonRig,
  });

  metronome.pressButton("play", 1000);
  const originalSchedule = {
    nextTickMs: metronome.nextTickMs,
    nextBeatIndex: metronome.nextBeatIndex,
    beatOriginMs: metronome.beatOriginMs,
  };
  metronome.pressButton("play", 1250);

  assert.equal(metronome.playing, true);
  assert.deepEqual(
    {
      nextTickMs: metronome.nextTickMs,
      nextBeatIndex: metronome.nextBeatIndex,
      beatOriginMs: metronome.beatOriginMs,
    },
    originalSchedule,
  );
  assert.equal(events.at(-1), "press:play:1250");

  metronome.pressButton("pause", 1300);
  assert.equal(metronome.playing, false);
  assert.equal(metronome.nextTickMs, null);
  assert.equal(metronome.nextBeatIndex, null);
  assert.deepEqual(events.slice(-2), ["reset", "press:pause:1300"]);
});

function object3D() {
  return {
    visible: true,
    userData: {},
    position: tuple(0, 0, 0),
    quaternion: tuple(0, 0, 0, 1),
    scale: tuple(1, 1, 1),
    traverse() {},
    removeFromParent() {},
  };
}

function tuple(...values) {
  return { toArray: () => [...values], fromArray(next) { values = [...next]; } };
}
