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

test("sub-gate squeeze noise creates no attack, release, or musical onset", () => {
  const recorder = new LooperGestureRecorder();
  const timeline = new LooperTimeline();
  const track = new LooperTrack({ index: 0, connectedHonkId: "honk-1" });
  let action = { squeeze: 0 };
  const capture = () => action;

  recorder.start(timeline, [track], 1000, capture);
  for (const [elapsedMs, squeeze] of [
    [40, 0.019],
    [80, 0.024],
    [120, 0.006],
    [160, 0.023],
    [200, 0],
  ]) {
    action = { squeeze };
    recorder.updateTrack(timeline, track, 1000 + elapsedMs, capture);
  }

  const squeezeEvents = timeline.getTrack(track.trackId).events.filter(({ type }) => [
    LooperActionEventType.Squeeze,
    LooperActionEventType.SqueezeStart,
    LooperActionEventType.SqueezeEnd,
  ].includes(type));
  assert.deepEqual(squeezeEvents, []);
  assert.deepEqual(timeline.getMusicalOnsetTimes(), []);
  assert.equal(recorder.isMusicalOnset({ squeeze: 0.025 }), false);
  assert.equal(recorder.isMusicalOnset({ squeeze: 0.026 }), true);
});

test("a real squeeze gate crossing is captured inside the sample interval", () => {
  const recorder = new LooperGestureRecorder({ sampleIntervalMs: 100 });
  const timeline = new LooperTimeline();
  const track = new LooperTrack({ index: 0, connectedHonkId: "honk-1" });
  let action = { squeeze: 0, bend: 0 };
  const capture = () => action;

  recorder.start(timeline, [track], 1000, capture);
  action = { squeeze: 0, bend: 0.5 };
  recorder.updateTrack(timeline, track, 1000, capture);
  action = { squeeze: 0.6, bend: 0.5 };
  recorder.updateTrack(timeline, track, 1010, capture);
  action = { squeeze: 0.014, bend: 0.5 };
  recorder.updateTrack(timeline, track, 1015, capture);

  const squeezeEvents = timeline.getTrack(track.trackId).events.filter(({ type }) => [
    LooperActionEventType.SqueezeStart,
    LooperActionEventType.SqueezeEnd,
  ].includes(type));
  assert.deepEqual(squeezeEvents.map(({ type, timeMs, value }) => [type, timeMs, value]), [
    [LooperActionEventType.SqueezeStart, 10, 0.6],
    [LooperActionEventType.SqueezeEnd, 15, 0],
  ]);
  assert.deepEqual(timeline.getMusicalOnsetTimes(), [10]);
});

test("squeeze gate hysteresis ignores noise around the onset threshold", () => {
  const recorder = new LooperGestureRecorder({ sampleIntervalMs: 100 });
  const timeline = new LooperTimeline();
  const track = new LooperTrack({ index: 0, connectedHonkId: "honk-1" });
  let action = { squeeze: 0 };
  const capture = () => action;

  recorder.start(timeline, [track], 0, capture);
  for (const [timeMs, squeeze] of [
    [10, 0.026],
    [20, 0.024],
    [30, 0.027],
    [40, 0.023],
    [50, 0.014],
  ]) {
    action = { squeeze };
    recorder.updateTrack(timeline, track, timeMs, capture);
  }

  const gates = timeline.getTrack(track.trackId).events.filter(({ type }) => (
    type === LooperActionEventType.SqueezeStart || type === LooperActionEventType.SqueezeEnd
  ));
  assert.deepEqual(gates.map(({ type, timeMs }) => [type, timeMs]), [
    [LooperActionEventType.SqueezeStart, 10],
    [LooperActionEventType.SqueezeEnd, 50],
  ]);
});

test("a smooth noisy gesture produces a bounded automation timeline", () => {
  const smoothEventCount = recordRepresentativeSmoothGesture(0);
  const noisyEventCount = recordRepresentativeSmoothGesture(0.004);

  assert.ok(smoothEventCount <= 140, `expected at most 140 events, received ${smoothEventCount}`);
  assert.ok(noisyEventCount <= 140, `expected at most 140 events, received ${noisyEventCount}`);
  assert.ok(
    noisyEventCount <= smoothEventCount * 1.15,
    `minor noise expanded ${smoothEventCount} events to ${noisyEventCount}`,
  );
});

function recordRepresentativeSmoothGesture(noiseAmplitude) {
  const recorder = new LooperGestureRecorder();
  const timeline = new LooperTimeline();
  const track = new LooperTrack({ index: 0, connectedHonkId: "honk-1" });
  let action = {
    squeeze: 0,
    bend: 0,
    earLeft: 0,
    earRight: 0,
    nose: 0,
    vowel: "A",
  };
  const capture = () => action;

  recorder.start(timeline, [track], 0, capture);
  for (let elapsedMs = 0; elapsedMs <= 1000; elapsedMs += 8) {
    const phase = elapsedMs / 1000;
    const noise = (elapsedMs / 8) % 2 === 0 ? noiseAmplitude : -noiseAmplitude;
    action = {
      squeeze: 0.1 + phase * 0.7 + noise,
      bend: -0.8 + phase * 1.6 + noise,
      earLeft: 0.1 + phase * 0.8 + noise,
      earRight: 0.9 - phase * 0.8 + noise,
      nose: 0.1 + phase * 0.8 + noise,
      vowel: "A",
    };
    recorder.updateTrack(timeline, track, elapsedMs, capture);
  }

  const events = timeline.getTrack(track.trackId).events;
  assert.equal(events.every(({ interpolation }) => interpolation === "linear"), true);
  return events.length;
}
