import test from "node:test";
import assert from "node:assert/strict";

import { createActionState } from "../../../src/instruments/looper/timeline/actionState.js";
import { LooperActionEventType } from "../../../src/instruments/looper/timeline/LooperActionEvent.js";
import { LooperPlaybackEngine } from "../../../src/instruments/looper/LooperPlaybackEngine.js";
import { LooperTimeline } from "../../../src/instruments/looper/timeline/LooperTimeline.js";

test("LooperTimeline trims only leading silence and preserves its recorded trailing rest", () => {
  const timeline = new LooperTimeline();
  timeline.startRecording(1000);
  timeline.addFieldEvent("track-0", "squeeze", 120, 1, { trackIndex: 0 });
  timeline.addFieldEvent("track-0", "squeeze", 320, 0, { trackIndex: 0 });

  assert.equal(timeline.stopRecording(1500, 24), true);
  assert.deepEqual(
    timeline.getTrack("track-0").events.map((event) => event.timeMs),
    [0, 200],
  );
  assert.equal(timeline.contentEndMs, 200);
  assert.equal(timeline.durationMs, 380);
});

test("LooperTimeline keeps squeeze closed throughout a rest between notes", () => {
  const timeline = new LooperTimeline();
  timeline.addActionEvent("track-0", {
    trackIndex: 0,
    type: LooperActionEventType.SqueezeEnd,
    timeMs: 300,
    value: 0,
    interpolation: "linear",
  });
  timeline.addActionEvent("track-0", {
    trackIndex: 0,
    type: LooperActionEventType.SqueezeStart,
    timeMs: 1000,
    value: 1,
    interpolation: "linear",
  });
  timeline.finalizeDuration(1);
  const snapshot = createActionState();

  assert.equal(timeline.sampleTrack(timeline.getTrack("track-0"), 500, snapshot).squeeze, 0);
  assert.equal(timeline.sampleTrack(timeline.getTrack("track-0"), 999, snapshot).squeeze, 0);
  assert.equal(timeline.sampleTrack(timeline.getTrack("track-0"), 1000, snapshot).squeeze, 1);
});

test("stick hits and individually played Honks keep their shared rhythm across loop wrap", () => {
  const timeline = new LooperTimeline();
  timeline.addDrumHitEvent("track-0", { trackIndex: 0, timeMs: 100, drumType: "boink" });
  timeline.addActionEvent("track-0", {
    trackIndex: 0,
    type: LooperActionEventType.SqueezeStart,
    timeMs: 200,
    value: 1,
    interpolation: "linear",
  });
  timeline.addActionEvent("track-0", {
    trackIndex: 0,
    type: LooperActionEventType.SqueezeEnd,
    timeMs: 300,
    value: 0,
    interpolation: "linear",
  });
  timeline.addDrumHitEvent("track-0", { trackIndex: 0, timeMs: 500, drumType: "hihat" });
  timeline.addActionEvent("track-0", {
    trackIndex: 0,
    type: LooperActionEventType.SqueezeStart,
    timeMs: 800,
    value: 1,
    interpolation: "linear",
  });
  timeline.addActionEvent("track-0", {
    trackIndex: 0,
    type: LooperActionEventType.SqueezeEnd,
    timeMs: 900,
    value: 0,
    interpolation: "linear",
  });
  timeline.recordedDurationMs = 1100;
  timeline.finalizeDuration(1);

  const engine = new LooperPlaybackEngine();
  const drumHits = [];
  let squeeze;
  const handlers = {
    onDrumHit: (_track, event, timeMs) => drumHits.push([event.value, timeMs]),
    onTrackSnapshot: (_track, state) => { squeeze = state.squeeze; },
  };
  engine.start(0);
  engine.update(100, timeline, 1, handlers);
  assert.deepEqual(drumHits, [["boink", 100]]);
  engine.update(200, timeline, 1, handlers);
  assert.equal(squeeze, 1);
  engine.update(499, timeline, 1, handlers);
  assert.equal(squeeze, 0);
  engine.update(500, timeline, 1, handlers);
  assert.deepEqual(drumHits, [["boink", 100], ["hihat", 500]]);
  engine.update(799, timeline, 1, handlers);
  assert.equal(squeeze, 0);
  engine.update(800, timeline, 1, handlers);
  assert.equal(squeeze, 1);
  engine.update(1100, timeline, 1, handlers);
  assert.equal(squeeze, undefined);
  engine.update(1200, timeline, 1, handlers);
  assert.deepEqual(drumHits.at(-1), ["boink", 100]);
  engine.update(1300, timeline, 1, handlers);
  assert.equal(squeeze, 1);
});

test("LooperTimeline linearly samples numeric fields and steps vowel fields", () => {
  const timeline = new LooperTimeline();
  timeline.addFieldEvent("track-0", "bend", 0, -1, { trackIndex: 0 });
  timeline.addFieldEvent("track-0", "bend", 100, 1, { trackIndex: 0 });
  timeline.addFieldEvent("track-0", "vowel", 0, "A", {
    trackIndex: 0,
    interpolation: "step",
  });
  timeline.addFieldEvent("track-0", "vowel", 75, "E", {
    trackIndex: 0,
    interpolation: "step",
  });
  timeline.finalizeDuration(24);
  const snapshot = createActionState();

  timeline.sampleTrack(timeline.getTrack("track-0"), 50, snapshot);

  assert.equal(snapshot.bend, 0);
  assert.equal(snapshot.vowel, "A");
});

test("LooperTimeline emits neutral squeeze and bend during beat-aligned tail padding", () => {
  const timeline = new LooperTimeline();
  timeline.addFieldEvent("track-0", "squeeze", 0, 1, { trackIndex: 0 });
  timeline.addFieldEvent("track-0", "bend", 100, 0.5, { trackIndex: 0 });
  timeline.recordedDurationMs = 300;
  timeline.finalizeDuration(24);
  const snapshot = createActionState();

  timeline.sampleTrack(timeline.getTrack("track-0"), 150, snapshot);

  assert.equal(snapshot.squeeze, 0);
  assert.equal(snapshot.bend, 0);
});

test("LooperTimeline adds a stepped BPM-based gap of up to four beats", () => {
  const timeline = new LooperTimeline();
  timeline.addFieldEvent("track-0", "squeeze", 0, 1, { trackIndex: 0 });
  timeline.addFieldEvent("track-0", "squeeze", 400, 0, { trackIndex: 0 });
  timeline.recordedDurationMs = 1000;
  timeline.beatIntervalMs = 500;

  assert.equal(timeline.setGapBeats(0), 0);
  assert.equal(timeline.durationMs, 1000);
  assert.equal(timeline.setGapBeats(2), 2);
  assert.equal(timeline.durationMs, 2000);
  assert.equal(timeline.setGapBeats(99), 4);
  assert.equal(timeline.durationMs, 3000);

  const restored = LooperTimeline.fromJSON(timeline.toJSON());
  assert.equal(restored.gapBeats, 4);
  assert.equal(restored.durationMs, 3000);
});

test("LooperTimeline orders simultaneous drum events deterministically", () => {
  const timeline = new LooperTimeline();
  timeline.addDrumHitEvent("track-2", { trackIndex: 2, timeMs: 20, drumType: "boink" });
  timeline.addDrumHitEvent("track-0", { trackIndex: 0, timeMs: 20, drumType: "hihat" });

  const entries = timeline.getDrumHitEventsAt(20);

  assert.deepEqual(entries.map(({ track }) => track.trackId), ["track-0", "track-2"]);
});

test("LooperTimeline survives a plain-JSON round trip and rebuilds derived state", () => {
  const timeline = new LooperTimeline();
  timeline.addActionEvent("track-0", {
    trackIndex: 0,
    type: LooperActionEventType.SqueezeStart,
    timeMs: 0,
    value: 1,
    interpolation: "linear",
  });
  timeline.addDrumHitEvent("track-0", { trackIndex: 0, timeMs: 90, drumType: "boink" });
  timeline.recordedDurationMs = 120;
  timeline.finalizeDuration(24);

  const restored = LooperTimeline.fromJSON(JSON.parse(JSON.stringify(timeline.toJSON())));

  assert.equal(restored.hasRecording(), true);
  assert.equal(restored.durationMs, 120);
  assert.equal(restored.getTrack("track-0").hasRecordedField("squeeze"), true);
  assert.equal(restored.getDrumHitEventsAt(90)[0].event.value, "boink");

  restored.getTrack("track-0").events[0].value = 0.25;
  assert.equal(timeline.getTrack("track-0").events[0].value, 1);
});

test("metronome-synchronized recording keeps beat-relative timing and a whole-beat duration", () => {
  const timeline = new LooperTimeline();
  timeline.startRecording(1000, {
    active: true,
    beatIntervalMs: 500,
    beatOriginMs: 1000,
  });
  timeline.addFieldEvent("track-0", "squeeze", 105, 1, { trackIndex: 0 });
  timeline.markMusicalOnset(105);
  timeline.addFieldEvent("track-0", "squeeze", 410, 0, { trackIndex: 0 });
  timeline.stopRecording(1992, 1);

  assert.deepEqual(timeline.getTrack("track-0").events.map((event) => event.timeMs), [105, 410]);
  assert.equal(timeline.recordedDurationMs, 1000);
  assert.equal(timeline.durationMs, 1000);
  assert.deepEqual(LooperTimeline.fromJSON(timeline.toJSON()).toJSON(), timeline.toJSON());
});
