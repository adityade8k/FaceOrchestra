import test from "node:test";
import assert from "node:assert/strict";

import { LooperPlaybackEngine } from "../../../src/instruments/looper/LooperPlaybackEngine.js";
import { LooperActionEventType } from "../../../src/instruments/looper/timeline/LooperActionEvent.js";
import { LooperTimeline } from "../../../src/instruments/looper/timeline/LooperTimeline.js";

function addHonkNote(timeline, trackId, attackMs, releaseMs, trackIndex = 0) {
  timeline.addActionEvent(trackId, {
    trackIndex,
    type: LooperActionEventType.SqueezeStart,
    timeMs: attackMs,
    value: 1,
    interpolation: "linear",
  });
  timeline.addActionEvent(trackId, {
    trackIndex,
    type: LooperActionEventType.SqueezeEnd,
    timeMs: releaseMs,
    value: 0,
    interpolation: "linear",
  });
}

function createReportedReproduction() {
  const timeline = new LooperTimeline();
  timeline.beatIntervalMs = 500;
  addHonkNote(timeline, "track-0", 100, 200);
  addHonkNote(timeline, "track-0", 1100, 1200);
  addHonkNote(timeline, "track-0", 1600, 1900);
  timeline.setGapBeats(0);
  return timeline;
}

test("zero gap preserves the reported 100/1100/1600 X o X X phrase", () => {
  const timeline = createReportedReproduction();

  assert.equal(timeline.contentEndMs, 1800);
  assert.equal(timeline.recordedDurationMs, 1800);
  assert.equal(timeline.durationMs, 1800);
  assert.deepEqual(timeline.getMusicalOnsetTimes(), [0, 1000, 1500]);
});

test("Honk playback releases at wrap and repeats attacks with a 1800 ms period", () => {
  const timeline = createReportedReproduction();
  const engine = new LooperPlaybackEngine();
  const attacks = [];
  let active = false;
  let now = 0;
  const handlers = {
    onReleaseTrack: () => { active = false; },
    onTrackSnapshot: (_track, snapshot) => {
      const nextActive = (snapshot.squeeze || 0) > 0.025;
      if (nextActive && !active) attacks.push(now);
      active = nextActive;
    },
  };

  engine.start(0);
  for (now = 0; now <= 3600; now++) {
    engine.update(now, timeline, 1, handlers);
  }

  assert.deepEqual(attacks, [0, 1000, 1500, 1800, 2800, 3300, 3600]);
});

test("a synthetic final release crossing the phrase beat does not add a beat", () => {
  const timeline = new LooperTimeline();
  timeline.beatIntervalMs = 500;
  addHonkNote(timeline, "track-0", 100, 200);
  timeline.addActionEvent("track-0", {
    trackIndex: 0,
    type: LooperActionEventType.SqueezeStart,
    timeMs: 900,
    value: 1,
    interpolation: "linear",
  });
  timeline.addActionEvent("track-0", {
    trackIndex: 0,
    type: LooperActionEventType.SqueezeEnd,
    timeMs: 1300,
    value: 0,
    interpolation: "linear",
    synthetic: true,
  });
  timeline.finalizeDuration();

  assert.equal(timeline.contentEndMs, 1200);
  assert.equal(timeline.durationMs, 1200);
});

test("an attack exactly on a beat needs no extra beat after its release", () => {
  const timeline = new LooperTimeline();
  timeline.beatIntervalMs = 500;
  addHonkNote(timeline, "track-0", 1000, 1100);
  timeline.finalizeDuration();

  assert.equal(timeline.durationMs, 100);
});

test("a single-note beat-aware loop includes a real release beyond its onset beat", () => {
  const atZero = new LooperTimeline();
  atZero.beatIntervalMs = 500;
  addHonkNote(atZero, "track-0", 0, 100);
  atZero.finalizeDuration();

  const afterZero = new LooperTimeline();
  afterZero.beatIntervalMs = 500;
  addHonkNote(afterZero, "track-0", 100, 700);
  afterZero.finalizeDuration();

  assert.equal(atZero.durationMs, 100);
  assert.equal(afterZero.durationMs, 600);
});

test("the latest onset across tracks and simultaneous chord attacks sets one phrase boundary", () => {
  const timeline = new LooperTimeline();
  timeline.beatIntervalMs = 500;
  addHonkNote(timeline, "track-0", 100, 200, 0);
  addHonkNote(timeline, "track-1", 100, 250, 1);
  addHonkNote(timeline, "track-0", 700, 1250, 0);
  addHonkNote(timeline, "track-1", 700, 900, 1);
  timeline.finalizeDuration();

  assert.deepEqual(timeline.getMusicalOnsetTimes(), [0, 0, 600, 600]);
  assert.equal(timeline.durationMs, 1150);
});

test("percussion-only and mixed loops use percussion and Honk onsets", () => {
  const percussion = new LooperTimeline();
  percussion.beatIntervalMs = 500;
  percussion.addDrumHitEvent("drums", { timeMs: 100, drumType: "boink" });
  percussion.addDrumHitEvent("drums", { timeMs: 650, drumType: "hihat" });
  percussion.finalizeDuration();

  const mixed = new LooperTimeline();
  mixed.beatIntervalMs = 500;
  mixed.addDrumHitEvent("drums", { timeMs: 100, drumType: "boink" });
  addHonkNote(mixed, "track-0", 1200, 1800);
  mixed.finalizeDuration();

  assert.equal(percussion.durationMs, 1070);
  assert.equal(mixed.durationMs, 1700);
});

test("Gap 0-4 adds exactly one whole beat per step without changing its base", () => {
  const timeline = createReportedReproduction();

  for (let gapBeats = 0; gapBeats <= 4; gapBeats += 1) {
    assert.equal(timeline.setGapBeats(gapBeats), gapBeats);
    assert.equal(timeline.recordedDurationMs, 1800);
    assert.equal(timeline.durationMs, 1800 + gapBeats * 500);
  }
});

test("a large clock update crosses multiple boundaries without missing or duplicating hits", () => {
  const timeline = new LooperTimeline();
  timeline.beatIntervalMs = 500;
  timeline.addDrumHitEvent("drums", { timeMs: 0, drumType: "boink" });
  timeline.addDrumHitEvent("drums", { timeMs: 100, drumType: "hihat" });
  timeline.finalizeDuration();
  const engine = new LooperPlaybackEngine();
  const hits = [];
  let boundaries = 0;

  engine.start(0);
  engine.updateFromClock(timeline.durationMs * 3, timeline, {
    onDrumHit: (_track, event) => hits.push(event.value),
    onLoopBoundary: () => { boundaries += 1; },
  });

  assert.equal(boundaries, 3);
  assert.deepEqual(hits, ["boink", "hihat", "boink", "hihat", "boink", "hihat", "boink"]);
});

test("JSON restoration repairs a stored extra-beat duration and preserves exact Gap steps", () => {
  const serialized = createReportedReproduction().toJSON();
  serialized.recordedDurationMs = 2500;
  serialized.durationMs = 2500;

  const restored = LooperTimeline.fromJSON(serialized);

  assert.equal(restored.contentEndMs, 1800);
  assert.equal(restored.recordedDurationMs, 1800);
  assert.equal(restored.durationMs, 1800);
  restored.setGapBeats(1);
  assert.equal(restored.durationMs, 2300);
  restored.setGapBeats(0);
  assert.equal(restored.durationMs, 1800);
});
