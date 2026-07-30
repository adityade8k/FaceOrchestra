import test from "node:test";
import assert from "node:assert/strict";

import { LooperGestureRecorder } from "../../../src/instruments/looper/LooperGestureRecorder.js";
import { LooperTrack } from "../../../src/instruments/looper/LooperTrack.js";
import { LooperActionEventType } from "../../../src/instruments/looper/timeline/LooperActionEvent.js";
import { LooperTimeline } from "../../../src/instruments/looper/timeline/LooperTimeline.js";

test("finalizing an active recording preserves its last sample and neutral releases", () => {
  const recorder = new LooperGestureRecorder({ sampleIntervalMs: 1000 });
  const timeline = new LooperTimeline();
  const track = new LooperTrack({ index: 0, connectedHonkId: "honk-1" });
  let action = { squeeze: 0, bend: 0, earLeft: 0, earRight: 0, nose: 0, vowel: "A" };
  const capture = () => action;

  recorder.start(timeline, [track], 1000, capture);
  action = { ...action, squeeze: 1, bend: 0.5 };
  recorder.updateTrack(timeline, track, 1100, capture);
  action = { ...action, earLeft: 0.75, nose: 0.4, vowel: "E" };
  const hasRecording = recorder.stop(timeline, [track], 1200, 24, capture);

  const events = timeline.getTrack(track.trackId).events;
  assert.equal(hasRecording, true);
  assert.equal(timeline.recording, false);
  assert.equal(timeline.durationMs, 100);
  assert.equal(events.some(({ type, timeMs, value }) => (
    type === LooperActionEventType.SqueezeStart && timeMs === 0 && value === 1
  )), true);
  assert.equal(events.some(({ type, timeMs, value }) => (
    type === LooperActionEventType.SqueezeEnd && timeMs === 100 && value === 0
  )), true);
  assert.equal(events.some(({ type, timeMs, value }) => (
    type === LooperActionEventType.Bend && timeMs === 100 && value === 0
  )), true);
  assert.equal(events.some(({ type, timeMs, value }) => (
    type === LooperActionEventType.EarLeft && timeMs === 100 && value === 0.75
  )), true);
  assert.equal(events.some(({ type, timeMs, value }) => (
    type === LooperActionEventType.Nose && timeMs === 100 && value === 0.4
  )), true);
  assert.equal(events.some(({ type, timeMs, value }) => (
    type === LooperActionEventType.Vowel && timeMs === 100 && value === "E"
  )), true);

  const serialized = timeline.toJSON();
  assert.equal(Object.hasOwn(serialized, "recording"), false);
  const restored = LooperTimeline.fromJSON(JSON.parse(JSON.stringify(serialized)));
  assert.equal(restored.recording, false);
  assert.equal(restored.durationMs, timeline.durationMs);
  assert.deepEqual(restored.toJSON(), serialized);
});
