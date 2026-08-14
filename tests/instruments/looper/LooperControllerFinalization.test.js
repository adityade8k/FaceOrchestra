import test from "node:test";
import assert from "node:assert/strict";

import { LooperController } from "../../../src/instruments/looper/LooperController.js";
import { LooperPlaybackEngine } from "../../../src/instruments/looper/LooperPlaybackEngine.js";
import { LooperControlMapping } from "../../../src/instruments/looper/looperControlMapping.js";
import { LooperActionEventType } from "../../../src/instruments/looper/timeline/LooperActionEvent.js";

const BEAT_INTERVAL_MS = 500;

test("controller finalization gives immediate and delayed Stop the same beat-aware phrase", () => {
  const immediate = recordHonkPhrase({ stopMs: 2200 });
  const delayed = recordHonkPhrase({ stopMs: 5000 });
  const muchLater = recordHonkPhrase({ stopMs: 20_000 });

  for (const recording of [immediate, delayed, muchLater]) {
    assert.equal(recording.timeline.recordedDurationMs, 2000);
    assert.equal(recording.timeline.durationMs, 2000);
    assert.deepEqual(recording.timeline.getMusicalOnsetTimes(), [100, 1100, 1600]);
    assert.deepEqual(getPlaybackAttacks(recording.timeline), [
      100, 1100, 1600, 2100, 3100, 3600, 4100,
    ]);
    assert.equal(recording.timeline.tracks.size, 1);
  }

  assert.equal(immediate.timeline.firstOnsetElapsedMs, delayed.timeline.firstOnsetElapsedMs);
  assert.equal(immediate.timeline.firstOnsetElapsedMs, 100);
  assert.deepEqual(immediate.timeline.toJSON(), delayed.timeline.toJSON());
  assert.deepEqual(delayed.timeline.toJSON(), muchLater.timeline.toJSON());
});

test("a release tail after the phrase boundary and a held-at-Stop safety release add no beats", () => {
  const tail = recordHonkPhrase({ stopMs: 5000, finalReleaseMs: 2400 });
  assert.equal(tail.timeline.contentEndMs, 2400);
  assert.equal(tail.timeline.recordedDurationMs, 2000);

  const held = recordHonkPhrase({ stopMs: 5000, holdFinalNote: true });
  const track = held.timeline.getTrack("track-0");
  const releasesAtStop = track.events.filter((event) => (
    event.type === LooperActionEventType.SqueezeEnd && event.timeMs === 5000
  ));
  assert.equal(releasesAtStop.length, 1);
  assert.equal(held.timeline.recordedDurationMs, 2000);
  assert.equal(held.timeline.durationMs, 2000);
  assert.deepEqual(held.timeline.getMusicalOnsetTimes(), [100, 1100, 1600]);
  assert.deepEqual(getPlaybackAttacks(held.timeline), [
    100, 1100, 1600, 2100, 3100, 3600, 4100,
  ]);
});

test("successfully inferred recordings retain launch phase while non-beat fallback still trims", () => {
  const inferred = createHarness({ connected: false });
  inferred.controller.startRecording(inferred.looper, 0);
  for (const attackMs of [100, 600, 1100, 1600]) {
    setHonk(inferred, 0, attackMs, 1);
    setHonk(inferred, 0, attackMs + 100, 0);
  }
  inferred.controller.stopRecording(inferred.looper, 5000);
  assert.equal(inferred.timeline.beatAnalysis?.inferred, true);
  assert.equal(inferred.timeline.beatIntervalMs, 500);
  assert.equal(inferred.timeline.recordedDurationMs, 2000);
  assert.deepEqual(inferred.timeline.getMusicalOnsetTimes(), [100, 600, 1100, 1600]);
  assert.equal(inferred.timeline.durationMs + 100, 2100);

  const fallback = createHarness({ connected: false });
  fallback.controller.startRecording(fallback.looper, 0);
  setHonk(fallback, 0, 100, 1);
  setHonk(fallback, 0, 250, 0);
  fallback.controller.stopRecording(fallback.looper, 5000);
  assert.equal(fallback.timeline.beatIntervalMs, 0);
  assert.deepEqual(fallback.timeline.getMusicalOnsetTimes(), [0]);
  assert.equal(fallback.timeline.recordedDurationMs, 150);
});

test("latest simultaneous and cross-track Honk onsets control one boundary", () => {
  const harness = createHarness({ connected: true, trackCount: 2 });
  harness.controller.startRecording(harness.looper, 0);

  setHonk(harness, 0, 100, 1);
  setHonk(harness, 1, 100, 1);
  setHonk(harness, 0, 200, 0);
  setHonk(harness, 1, 250, 0);
  setHonk(harness, 0, 700, 1);
  setHonk(harness, 1, 700, 1);
  setHonk(harness, 0, 800, 0);
  setHonk(harness, 1, 900, 0);
  harness.controller.stopRecording(harness.looper, 5000);

  assert.deepEqual(harness.timeline.getMusicalOnsetTimes(), [100, 100, 700, 700]);
  assert.equal(harness.timeline.recordedDurationMs, 1000);
});

test("controller records percussion-only and mixed phrases from their latest onset", () => {
  const percussion = createHarness({ connected: true, trackCount: 1 });
  percussion.controller.startRecording(percussion.looper, 0);
  percussion.controller.recordSelfDrumHit(percussion.looper, "boink", 100);
  percussion.controller.recordSelfDrumHit(percussion.looper, "hihat", 650);
  percussion.controller.stopRecording(percussion.looper, 5000);
  assert.deepEqual(percussion.timeline.getMusicalOnsetTimes(), [100, 650]);
  assert.equal(percussion.timeline.recordedDurationMs, 1000);

  const mixed = createHarness({ connected: true, trackCount: 1 });
  mixed.controller.startRecording(mixed.looper, 0);
  mixed.controller.recordSelfDrumHit(mixed.looper, "boink", 100);
  setHonk(mixed, 0, 1200, 1);
  setHonk(mixed, 0, 1300, 0);
  mixed.controller.stopRecording(mixed.looper, 5000);
  assert.deepEqual(mixed.timeline.getMusicalOnsetTimes(), [100, 1200]);
  assert.equal(mixed.timeline.recordedDurationMs, 1500);
});

test("controller Gap 0 through 4 adds whole beats without changing the base phrase", () => {
  const recording = recordHonkPhrase({ stopMs: 5000 });

  for (let gapBeats = 0; gapBeats <= 4; gapBeats += 1) {
    recording.controller.setControlValue(
      recording.looper,
      "gap",
      LooperControlMapping.getGapControlFromBeats(gapBeats),
    );
    assert.equal(recording.timeline.recordedDurationMs, 2000);
    assert.equal(recording.timeline.durationMs, 2000 + gapBeats * BEAT_INTERVAL_MS);
  }
});

test("controller restoration repairs Stop-time padding without changing attacks", () => {
  const original = recordHonkPhrase({ stopMs: 5000 });
  const serialized = JSON.parse(JSON.stringify({
    controls: { volume: 0, gap: -1 },
    timeline: original.timeline.toJSON(),
  }));
  serialized.timeline.recordedDurationMs = 5000;
  serialized.timeline.durationMs = 5000;

  const restored = createHarness({ connected: true });
  restored.controller.restoreState(restored.looper, serialized);

  assert.equal(restored.timeline.recordedDurationMs, 2000);
  assert.equal(restored.timeline.durationMs, 2000);
  assert.deepEqual(restored.timeline.getMusicalOnsetTimes(), [100, 1100, 1600]);
});

function recordHonkPhrase({
  stopMs,
  connected = true,
  finalReleaseMs = 2100,
  holdFinalNote = false,
} = {}) {
  const harness = createHarness({ connected });
  harness.controller.startRecording(harness.looper, 0);
  setHonk(harness, 0, 100, 1);
  setHonk(harness, 0, 200, 0);
  setHonk(harness, 0, 1100, 1);
  setHonk(harness, 0, 1200, 0);
  setHonk(harness, 0, 1600, 1);
  if (!holdFinalNote) setHonk(harness, 0, finalReleaseMs, 0);
  harness.controller.stopRecording(harness.looper, stopMs);
  return harness;
}

function createHarness({ connected, trackCount = 8 }) {
  const inputs = Array.from({ length: trackCount }, () => ({
    squeeze: 0,
    bend: 0,
    musicalOnset: false,
  }));
  const clock = {
    active: connected,
    connected,
    metronomeId: connected ? "metro-a" : null,
    beatIntervalMs: connected ? BEAT_INTERVAL_MS : 0,
    beatOriginMs: connected ? 0 : null,
    beatPosition: connected ? 0 : null,
  };
  const adapter = {
    getTimingForLooper: () => ({ ...clock }),
    captureActionByHonkId: (honkId) => ({ ...inputs[Number(honkId.split("-").at(-1))] }),
    updateVisuals() {},
    ensureAudio() {},
  };
  const controller = new LooperController(adapter);
  const looper = { id: "looper-a", root: { visible: true }, hitTargets: {} };
  looper.looperData = controller.createStateData(looper, { trackCount });
  for (let index = 0; index < trackCount; index += 1) {
    looper.looperData.tracks[index].connectedHonkId = `honk-${index}`;
  }
  return {
    controller,
    looper,
    inputs,
    clock,
    get timeline() {
      return looper.looperData.timeline;
    },
  };
}

function setHonk(harness, trackIndex, now, squeeze) {
  harness.inputs[trackIndex].squeeze = squeeze;
  harness.inputs[trackIndex].musicalOnset = squeeze > 0.025;
  if (harness.clock.connected) harness.clock.beatPosition = now / BEAT_INTERVAL_MS;
  harness.controller.updateRecordings([harness.looper], now);
}

function getPlaybackAttacks(timeline) {
  const engine = new LooperPlaybackEngine();
  const attacks = [];
  let active = false;
  let now = 0;
  const handlers = {
    onReleaseTrack() {
      active = false;
    },
    onTrackSnapshot(_track, snapshot) {
      const nextActive = Number(snapshot.squeeze || 0) > 0.025;
      if (nextActive && !active) attacks.push(now);
      active = nextActive;
    },
  };
  engine.start(0);
  for (now of [0, 100, 200, 1100, 1200, 1600, 1700, 2000, 2100, 2200, 3100, 3200, 3600, 3700, 4000, 4100]) {
    engine.update(now, timeline, 1, handlers);
  }
  return attacks;
}
