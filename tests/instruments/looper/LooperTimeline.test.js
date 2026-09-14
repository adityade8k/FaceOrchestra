import test from "node:test";
import assert from "node:assert/strict";

import { createActionState } from "../../../src/instruments/looper/timeline/actionState.js";
import { LooperActionEventType } from "../../../src/instruments/looper/timeline/LooperActionEvent.js";
import { LooperPlaybackEngine } from "../../../src/instruments/looper/LooperPlaybackEngine.js";
import { LooperTimeline } from "../../../src/instruments/looper/timeline/LooperTimeline.js";

test("LooperTimeline trims silence before the first sound and after the last sound", () => {
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
  assert.equal(timeline.recordedDurationMs, 200);
  assert.equal(timeline.durationMs, 200);
});

test("LooperTimeline keeps squeeze closed throughout a rest between notes", () => {
  const timeline = new LooperTimeline();
  timeline.addActionEvent("track-0", {type: "squeezeStart", timeMs: 0, value: 1});
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
  timeline.finalizeDuration(1);

  const engine = new LooperPlaybackEngine();
  const drumHits = [];
  let squeeze;
  const handlers = {
    onDrumHit: (_track, event, timeMs) => drumHits.push([event.value, timeMs]),
    onTrackSnapshot: (_track, state) => { squeeze = state.squeeze; },
  };
  engine.start(0);
  engine.update(0, timeline, 1, handlers);
  assert.deepEqual(drumHits, [["boink", 0]]);
  engine.update(100, timeline, 1, handlers);
  assert.equal(squeeze, 1);
  engine.update(399, timeline, 1, handlers);
  assert.equal(squeeze, 0);
  engine.update(400, timeline, 1, handlers);
  assert.deepEqual(drumHits, [["boink", 0], ["hihat", 400]]);
  engine.update(699, timeline, 1, handlers);
  assert.equal(squeeze, 0);
  engine.update(700, timeline, 1, handlers);
  assert.equal(squeeze, 1);
  engine.update(800, timeline, 1, handlers);
  assert.equal(squeeze, 0);
  engine.update(timeline.durationMs, timeline, 1, handlers);
  assert.deepEqual(drumHits.at(-1), ["boink", 0]);
  engine.update(timeline.durationMs+100.000001, timeline, 1, handlers);
  assert.equal(squeeze, 1);
});

test("LooperTimeline linearly samples numeric fields and steps vowel fields", () => {
  const timeline = new LooperTimeline();
  timeline.addActionEvent("track-0", {type: "squeezeStart", timeMs: 0, value: 1});
  timeline.addActionEvent("track-0", {type: "squeezeEnd", timeMs: 100, value: 0});
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

test("LooperTimeline emits neutral squeeze and bend during an intentional beat gap", () => {
  const timeline = new LooperTimeline();
  timeline.addFieldEvent("track-0", "squeeze", 0, 1, { trackIndex: 0 });
  timeline.addFieldEvent("track-0", "bend", 100, 0.5, { trackIndex: 0 });
  timeline.beatIntervalMs = 300;
  timeline.setGapBeats(1, 24);
  const snapshot = createActionState();

  timeline.sampleTrack(timeline.getTrack("track-0"), 300, snapshot);

  assert.equal(snapshot.squeeze, 0);
  assert.equal(snapshot.bend, 0);
});

test("LooperTimeline adds a stepped BPM-based gap of up to four beats", () => {
  const timeline = new LooperTimeline();
  timeline.addFieldEvent("track-0", "squeeze", 0, 1, { trackIndex: 0 });
  timeline.addFieldEvent("track-0", "squeeze", 400, 0, { trackIndex: 0 });
  timeline.beatIntervalMs = 500;

  assert.equal(timeline.setGapBeats(0), 0);
  assert.equal(timeline.durationMs, 400);
  assert.equal(timeline.setGapBeats(2), 2);
  assert.equal(timeline.durationMs, 1400);
  assert.equal(timeline.setGapBeats(99), 4);
  assert.equal(timeline.durationMs, 2400);

  const restored = LooperTimeline.fromJSON(timeline.toJSON());
  assert.equal(restored.gapBeats, 4);
  assert.equal(restored.durationMs, 2400);
});

test("silent late morphs and redundant cleanup releases do not extend musical content", () => {
  const timeline = new LooperTimeline();
  timeline.beatIntervalMs = 500;
  timeline.addActionEvent("track-0", {
    trackIndex: 0,
    type: LooperActionEventType.SqueezeStart,
    timeMs: 100,
    value: 1,
  });
  timeline.addActionEvent("track-0", {
    trackIndex: 0,
    type: LooperActionEventType.SqueezeEnd,
    timeMs: 200,
    value: 0,
  });
  timeline.addFieldEvent("track-0", "earLeft", 1200, 1, { trackIndex: 0 });
  timeline.addActionEvent("track-0", {
    trackIndex: 0,
    type: LooperActionEventType.SqueezeEnd,
    timeMs: 5000,
    value: 0,
    synthetic: true,
  });
  timeline.finalizeDuration();

  assert.equal(timeline.getIntentionalContentEndMs(), 100);
  assert.equal(timeline.recordedDurationMs, 100);
  assert.equal(timeline.contentEndMs, 100);
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
  assert.equal(restored.durationMs, 1080);
  assert.equal(restored.getTrack("track-0").hasRecordedField("squeeze"), true);
  assert.equal(restored.getDrumHitEventsAt(90)[0].event.value, "boink");

  restored.getTrack("track-0").events[0].value = 0.25;
  assert.equal(timeline.getTrack("track-0").events[0].value, 1);

  const legacyWithStopTime = timeline.toJSON();
  legacyWithStopTime.durationMs = 1200;
  legacyWithStopTime.recordedDurationMs = 1200;
  assert.equal(LooperTimeline.fromJSON(legacyWithStopTime).durationMs, 1080);
});

test("schema-v4 gate recordings migrate without turning held notes into ramps", () => {
  const restored = LooperTimeline.fromJSON({
    schemaVersion: 4,
    durationMs: 500,
    recordedDurationMs: 500,
    tracks: [{
      trackId: "track-0",
      trackIndex: 0,
      baselineActionState: { squeeze: 0 },
      events: [
        { id: 1, type: "squeezeStart", timeMs: 0, value: 1, interpolation: "linear" },
        { id: 2, type: "squeezeEnd", timeMs: 500, value: 0, interpolation: "linear" },
      ],
    }],
  });
  const snapshot = createActionState();

  assert.equal(restored.sampleTrack(restored.getTrack("track-0"), 250, snapshot).squeeze, 1);
  assert.equal(restored.toJSON().schemaVersion, 8);
});

test("a single strike uses its complete finite percussion envelope", () => {
  const timeline = new LooperTimeline();
  timeline.addDrumHitEvent("track-0", { trackIndex: 0, timeMs: 0, drumType: "boink" });
  timeline.setGapBeats(0, 24);

  assert.equal(timeline.contentEndMs, 990.0000000000001);
  assert.equal(timeline.durationMs, 990.0000000000001);
});

test("metronome-synchronized recording keeps relative timing and full hold without beat padding", () => {
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

  assert.deepEqual(timeline.getTrack("track-0").events.map((event) => event.timeMs), [0, 305]);
  assert.equal(timeline.recordedDurationMs, 305);
  assert.equal(timeline.durationMs, 305);
  assert.deepEqual(LooperTimeline.fromJSON(timeline.toJSON()).toJSON(), timeline.toJSON());
});

test("zero gap repeats immediately after the final completed note", () => {
  const timeline = new LooperTimeline();
  timeline.beatIntervalMs = 500;
  timeline.addFieldEvent("track-0", "squeeze", 0, 1, { trackIndex: 0 });
  timeline.addFieldEvent("track-0", "squeeze", 100, 0, { trackIndex: 0 });
  timeline.addFieldEvent("track-0", "squeeze", 500, 1, { trackIndex: 0 });
  timeline.addFieldEvent("track-0", "squeeze", 600, 0, { trackIndex: 0 });
  timeline.setGapBeats(0);

  const engine = new LooperPlaybackEngine();
  const snapshots = [];
  engine.start(0);
  engine.update(0, timeline, 1, {
    onTrackSnapshot: (_track, snapshot, timeMs) => snapshots.push([timeMs, snapshot.squeeze]),
  });
  engine.update(500, timeline, 1, {
    onTrackSnapshot: (_track, snapshot, timeMs) => snapshots.push([timeMs, snapshot.squeeze]),
  });
  engine.update(600, timeline, 1, {
    onTrackSnapshot: (_track, snapshot, timeMs) => snapshots.push([timeMs, snapshot.squeeze]),
  });

  assert.equal(timeline.durationMs, 600);
  assert.deepEqual(snapshots, [[0, 1], [500, 1], [0, 1]]);
});
