import test from "node:test";
import assert from "node:assert/strict";

import { LooperGestureRecorder } from "../../../src/instruments/looper/LooperGestureRecorder.js";
import { LooperTrack } from "../../../src/instruments/looper/LooperTrack.js";
import { createActionState } from "../../../src/instruments/looper/timeline/actionState.js";
import { LooperActionEventType } from "../../../src/instruments/looper/timeline/LooperActionEvent.js";
import {
  LOOPER_TIMELINE_SCHEMA_VERSION,
  LooperTimeline,
} from "../../../src/instruments/looper/timeline/LooperTimeline.js";

test("pressing Stop long after the last note discards trailing record time", () => {
  const timeline = recordedNote({ onsetMs: 120, releaseMs: 320, stopMs: 1500 });
  assert.deepEqual(eventTimes(timeline), [0, 200]);
  assert.equal(timeline.contentEndMs, 200);
  assert.equal(timeline.recordedDurationMs, 200);
  assert.equal(timeline.durationMs, 200);
});

test("a clocked phrase is not padded to a whole beat", () => {
  const timeline = new LooperTimeline();
  timeline.startRecording(1000, { beatIntervalMs: 500, beatOriginMs: 1000 });
  timeline.markMusicalOnset(105);
  timeline.addActionEvent("track-0", gate(LooperActionEventType.SqueezeStart, 105, 1));
  timeline.addActionEvent("track-0", gate(LooperActionEventType.SqueezeEnd, 410, 0));
  timeline.stopRecording(1992, 1);
  assert.deepEqual(eventTimes(timeline), [0, 305]);
  assert.equal(timeline.durationMs, 305);
  assert.notEqual(timeline.durationMs % timeline.beatIntervalMs, 0);
});

test("gap zero adds no trailing silence", () => {
  const timeline = completedTimeline(400, 500);
  timeline.setGapBeats(0);
  assert.equal(timeline.gapBeats, 0);
  assert.equal(timeline.durationMs, 400);
  assert.equal(timeline.isTailPaddingTime(400), false);
});

test("gaps one through four add exactly that many source-tempo beats", () => {
  for (let beats = 1; beats <= 4; beats += 1) {
    const timeline = completedTimeline(400, 500);
    timeline.setGapBeats(beats);
    assert.equal(timeline.durationMs, 400 + beats * 500);
  }
});

test("a held note receives a final note-off at Stop", () => {
  const recorder = new LooperGestureRecorder({ sampleIntervalMs: 1 });
  const timeline = new LooperTimeline();
  const track = new LooperTrack({ index: 0, connectedHonkId: "honk-a" });
  let action = { squeeze: 0 };
  const capture = () => action;
  recorder.start(timeline, [track], 1000, capture);
  action = { squeeze: 1 };
  recorder.updateTrack(timeline, track, 1100, capture);
  recorder.stop(timeline, [track], 1400, 1, capture);
  assert.deepEqual(eventTimes(timeline), [0, 300]);
  assert.equal(timeline.getTrack(track.trackId).events.at(-1).type, LooperActionEventType.SqueezeEnd);
  assert.equal(timeline.durationMs, 300);
});

test("parameter changes after the last released note do not extend the phrase", () => {
  const timeline = new LooperTimeline();
  timeline.startRecording(1000);
  timeline.addActionEvent("track-0", gate(LooperActionEventType.SqueezeStart, 100, 1));
  timeline.addActionEvent("track-0", gate(LooperActionEventType.SqueezeEnd, 300, 0));
  timeline.addFieldEvent("track-0", "vowel", 700, "E", { interpolation: "step" });
  timeline.addFieldEvent("track-0", "nose", 800, 0.9);
  timeline.stopRecording(2000, 1);
  assert.equal(timeline.durationMs, 200);
  assert.deepEqual(eventTimes(timeline), [0, 200]);
});

test("a final percussion event determines musical content end", () => {
  const timeline = new LooperTimeline();
  timeline.startRecording(1000);
  timeline.addActionEvent("track-0", gate(LooperActionEventType.SqueezeStart, 100, 1));
  timeline.addActionEvent("track-0", gate(LooperActionEventType.SqueezeEnd, 300, 0));
  timeline.addDrumHitEvent("percussion", { timeMs: 650, drumType: "hihat" });
  timeline.markMusicalOnset(100);
  timeline.stopRecording(2000, 1);
  assert.equal(timeline.contentEndMs, 550);
  assert.equal(timeline.durationMs, 550);
  assert.equal(timeline.getDrumHitEventsAt(550)[0].event.value, "hihat");
});

test("serialization/restoration preserves phrase duration and zero-gap default", () => {
  const timeline = completedTimeline(375, 480);
  const serialized = timeline.toJSON();
  const restored = LooperTimeline.fromJSON(JSON.parse(JSON.stringify(serialized)));
  assert.equal(serialized.schemaVersion, LOOPER_TIMELINE_SCHEMA_VERSION);
  assert.equal(restored.gapBeats, 0);
  assert.equal(restored.recordedDurationMs, 375);
  assert.equal(restored.durationMs, 375);
  assert.deepEqual(restored.toJSON(), serialized);
});

test("schema-v2 recordings migrate by trimming record-to-stop and beat padding", () => {
  const legacy = completedTimeline(310, 500).toJSON();
  legacy.schemaVersion = 2;
  legacy.recordedDurationMs = 1000;
  legacy.durationMs = 1500;
  legacy.gapBeats = 1;
  const restored = LooperTimeline.fromJSON(legacy);
  assert.equal(restored.contentEndMs, 310);
  assert.equal(restored.recordedDurationMs, 310);
  assert.equal(restored.durationMs, 810);
});

test("recordings without a musical onset are invalid", () => {
  const timeline = new LooperTimeline();
  timeline.startRecording(1000);
  timeline.addFieldEvent("track-0", "vowel", 100, "O");
  assert.equal(timeline.stopRecording(1500, 1), false);
  assert.equal(timeline.hasRecording(), false);
});

test("zero-gap sampling retriggers the persistent gate exactly at wrap", () => {
  const timeline = completedTimeline(100, 500);
  const snapshot = createActionState();
  timeline.sampleTrack(timeline.getTrack("track-0"), 99, snapshot);
  assert.equal(snapshot.squeeze > 0, true);
  timeline.sampleTrack(timeline.getTrack("track-0"), 100, snapshot);
  assert.equal(snapshot.squeeze, 0);
  timeline.sampleTrack(timeline.getTrack("track-0"), 0, snapshot);
  assert.equal(snapshot.squeeze, 1);
});

function recordedNote({ onsetMs, releaseMs, stopMs }) {
  const timeline = new LooperTimeline();
  timeline.startRecording(1000);
  timeline.addActionEvent("track-0", gate(LooperActionEventType.SqueezeStart, onsetMs, 1));
  timeline.addActionEvent("track-0", gate(LooperActionEventType.SqueezeEnd, releaseMs, 0));
  timeline.markMusicalOnset(onsetMs);
  timeline.stopRecording(stopMs, 1);
  return timeline;
}

function completedTimeline(releaseMs, beatIntervalMs) {
  const timeline = new LooperTimeline();
  timeline.beatIntervalMs = beatIntervalMs;
  timeline.addActionEvent("track-0", gate(LooperActionEventType.SqueezeStart, 0, 1));
  timeline.addActionEvent("track-0", gate(LooperActionEventType.SqueezeEnd, releaseMs, 0));
  timeline.finalizeDuration(1);
  return timeline;
}

function gate(type, timeMs, value) {
  return { trackIndex: 0, type, timeMs, value, interpolation: "linear" };
}

function eventTimes(timeline) {
  return timeline.getTrack("track-0")?.events.map((event) => event.timeMs) || [];
}
