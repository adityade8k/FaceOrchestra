import test from "node:test";
import assert from "node:assert/strict";
import { MetronomeInstrument } from "../../../src/instruments/metronome/MetronomeInstrument.js";

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
