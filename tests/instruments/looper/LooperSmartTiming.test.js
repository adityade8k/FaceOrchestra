import test from "node:test";
import assert from "node:assert/strict";

import { LooperGestureRecorder } from "../../../src/instruments/looper/LooperGestureRecorder.js";
import {
  LooperPlaybackEngine,
  getNextBeatStart,
} from "../../../src/instruments/looper/LooperPlaybackEngine.js";
import { LooperTrack } from "../../../src/instruments/looper/LooperTrack.js";
import { LooperTimeline } from "../../../src/instruments/looper/timeline/LooperTimeline.js";

const smartTiming = {
  active: true,
  bpm: 120,
  beatIntervalMs: 500,
  beatOriginMs: 1000,
  nearestBeatMs: 1000,
};

test("clocked recording trims launch-alignment time before its first onset", () => {
  const recorder = new LooperGestureRecorder({ sampleIntervalMs: 1 });
  const timeline = new LooperTimeline();
  const track = new LooperTrack({ index: 0, connectedHonkId: "honk-1" });
  let action = { squeeze: 0, bend: 0, earLeft: 0 };
  const capture = () => action;

  recorder.start(timeline, [track], 1000, capture, smartTiming);
  assert.equal(timeline.recording, true);
  recorder.updateTrack(timeline, track, 1040, capture);
  assert.equal(timeline.getTrack(track.trackId).events.length, 0);

  action = { ...action, squeeze: 1 };
  recorder.updateTrack(timeline, track, 1050, capture);
  action = { ...action, squeeze: 0 };
  recorder.updateTrack(timeline, track, 1275, capture);
  recorder.stop(timeline, [track], 1600, 1, capture);

  assert.deepEqual(timeline.getTrack(track.trackId).events.map((event) => event.timeMs), [0, 225]);
  assert.equal(timeline.contentEndMs, 225);
  assert.equal(timeline.durationMs, 225);
});

test("clocked recording rejects recordings with no musical onset", () => {
  const recorder = new LooperGestureRecorder({ sampleIntervalMs: 1 });
  const track = new LooperTrack({ index: 0, connectedHonkId: "honk-1" });
  let action = { squeeze: 0 };
  const capture = () => action;
  const timeline = new LooperTimeline();

  recorder.start(timeline, [track], 500, capture, smartTiming);
  action = { squeeze: 1 };
  recorder.updateTrack(timeline, track, 975, capture);
  action = { squeeze: 0 };
  recorder.updateTrack(timeline, track, 1100, capture);
  assert.equal(recorder.stop(timeline, [track], 1500, 1, capture), true);
  assert.equal(timeline.durationMs, 125);

  const empty = new LooperTimeline();
  recorder.start(empty, [track], 2000, capture, smartTiming);
  assert.equal(recorder.stop(empty, [track], 2400, 1, capture), false);
  assert.equal(empty.hasRecording(), false);
});

test("a held final note is safely released at Stop and makes Stop its real endpoint", () => {
  const recorder = new LooperGestureRecorder({ sampleIntervalMs: 1 });
  const timeline = new LooperTimeline();
  const track = new LooperTrack({ index: 0, connectedHonkId: "honk-1" });
  let action = { squeeze: 0 };
  const capture = () => action;
  recorder.start(timeline, [track], 1000, capture, smartTiming);
  action = { squeeze: 1 };
  recorder.updateTrack(timeline, track, 1000, capture);

  recorder.stop(timeline, [track], 1400, 1, capture);

  assert.deepEqual(timeline.getTrack(track.trackId).events.map((event) => event.timeMs), [0, 400]);
  assert.equal(timeline.contentEndMs, 400);
});

test("clocked playback chooses the next beat and stays silent while waiting", () => {
  const timing = { beatOriginMs: 1000, beatIntervalMs: 500 };
  assert.equal(getNextBeatStart(1480, timing), 1500);
  assert.equal(getNextBeatStart(1500, timing), 2000);

  const timeline = new LooperTimeline();
  timeline.addFieldEvent("track-0", "squeeze", 0, 1, { trackIndex: 0 });
  timeline.addFieldEvent("track-0", "squeeze", 100, 0, { trackIndex: 0 });
  timeline.finalizeDuration(1);
  const engine = new LooperPlaybackEngine();
  let snapshots = 0;
  engine.start(1500);
  engine.update(1499, timeline, 1, { onTrackSnapshot: () => { snapshots += 1; } });
  assert.equal(snapshots, 0);
  assert.equal(engine.elapsedMs, 0);
  engine.update(1500, timeline, 1, { onTrackSnapshot: () => { snapshots += 1; } });
  assert.equal(snapshots, 1);
});

test("loop position is derived without accumulating boundary drift", () => {
  const timeline = new LooperTimeline();
  timeline.addFieldEvent("track-0", "squeeze", 0, 1, { trackIndex: 0 });
  timeline.addFieldEvent("track-0", "squeeze", 100, 0, { trackIndex: 0 });
  timeline.recordedDurationMs = 100;
  timeline.finalizeDuration(1);
  const engine = new LooperPlaybackEngine();
  engine.start(10_000);

  for (let now = 10_007; now <= 20_003; now += 7) {
    engine.update(now, timeline, 1);
  }

  assert.equal(engine.elapsedMs, 3);
});

test("percussion timing stays relative to a clocked loop's launch beat", () => {
  const timeline = new LooperTimeline();
  timeline.startRecording(1000, smartTiming);
  timeline.markMusicalOnset(120);
  timeline.addDrumHitEvent("percussion", { timeMs: 120, drumType: "boink" });
  timeline.addDrumHitEvent("percussion", { timeMs: 410, drumType: "hihat" });
  timeline.stopRecording(1800, 1);

  assert.equal(timeline.contentEndMs, 290);
  assert.equal(timeline.durationMs, 290);
});
