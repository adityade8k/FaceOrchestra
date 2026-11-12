import test from "node:test";
import assert from "node:assert/strict";
import { compilePattern } from "../../src/compositions/CompositionCompiler.js";
import { patternKey } from "../../src/compositions/FixedBackingPlan.js";
import { LooperTimeline } from "../../src/instruments/looper/timeline/LooperTimeline.js";
import { createHarness } from "../helpers/looperCaptureHarness.js";

const pattern = {
  lane: "foundation",
  beats: 2,
  gapBeats: 1,
  events: [{ role: "drum", beat: 0.25, beats: 0.001, sound: "boink", gain: 0.2 }],
};
const compile = (events) =>
  compilePattern({
    events,
    beats: 2,
    beatMs: 500,
    routes: { drum: { trackId: "drum", trackIndex: 1 } },
  });
test("Percussion dynamics survive compiler, clone and saved Looper restoration", () => {
  const t = compile(pattern.events);
  const saved = t.toJSON();
  const restored = LooperTimeline.fromJSON(saved);
  assert.deepEqual(restored.toJSON(), saved);
  assert.equal(restored.getDrumHitEventsBetween(0, 500)[0].event.clone().gain, 0.2);
  const old = compile([{ ...pattern.events[0], gain: undefined }]);
  assert.equal(Object.hasOwn(old.getDrumHitEventsBetween(0, 500)[0].event.toJSON(), "gain"), false);
  assert.notEqual(
    patternKey(pattern),
    patternKey({ ...pattern, events: [{ ...pattern.events[0], gain: 0.4 }] }),
  );
  for (const gain of [NaN, -0.1, 1.1])
    assert.throws(() => compile([{ ...pattern.events[0], gain }]), /gain/);
});
test("Frame playback multiplies authored hit gain by the editable Looper volume", () => {
  const f = createHarness({ connected: true });
  const timeline = compile([
    pattern.events[0],
    { ...pattern.events[0], beat: 0.5, gain: 0 },
    { ...pattern.events[0], beat: 0.75, gain: undefined },
  ]);
  f.controller.stateCodec.restoreState(
    f.looper,
    { timeline: timeline.toJSON(), controls: { recordBeats: 2, volume: 0 } },
    { preserveConnections: true },
  );
  f.controller.armPlayback(f.looper, 0, f.clock, { targetBeat: 0 });
  for (let now = 0; now <= 450; now += 10) {
    f.controller.updateClockedTransports([f.looper], now);
    f.controller.updatePlaybackForLooper(f.looper, now);
  }
  const hits = f.calls.filter((c) => c.kind === "drum");
  assert.equal(hits.length, 3);
  assert.deepEqual(
    hits.map((h) => h.volume),
    [0.515 * 0.2, 0, 0.515],
  );
});
