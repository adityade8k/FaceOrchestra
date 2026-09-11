import test from "node:test";
import assert from "node:assert/strict";

import { LooperController } from "../../../src/instruments/looper/LooperController.js";
import { LooperGestureRecorder } from "../../../src/instruments/looper/LooperGestureRecorder.js";
import { LooperTrack } from "../../../src/instruments/looper/LooperTrack.js";
import { createActionState } from "../../../src/instruments/looper/timeline/actionState.js";
import { LooperActionEventType } from "../../../src/instruments/looper/timeline/LooperActionEvent.js";
import { LooperTimeline } from "../../../src/instruments/looper/timeline/LooperTimeline.js";

test("a genuine squeeze release does not turn a held note into a fade", () => {
  const timeline = new LooperTimeline();
  timeline.addActionEvent("track-0", {
    type: LooperActionEventType.SqueezeStart,
    timeMs: 0,
    value: 1,
    interpolation: "linear",
  });
  timeline.addActionEvent("track-0", {
    type: LooperActionEventType.SqueezeEnd,
    timeMs: 500,
    value: 0,
    interpolation: "linear",
  });
  timeline.finalizeDuration();
  const snapshot = createActionState();

  assert.equal(timeline.sampleTrack(timeline.getTrack("track-0"), 250, snapshot).squeeze, 1);
  assert.equal(timeline.sampleTrack(timeline.getTrack("track-0"), 499, snapshot).squeeze, 1);
  assert.equal(timeline.sampleTrack(timeline.getTrack("track-0"), 500, snapshot).squeeze, 0);
});

test("standalone beat inference preserves off-grid attacks and releases exactly", () => {
  const { controller, looper, input } = createRecordingHarness();
  controller.startRecording(looper, 0);
  for (const [timeMs, squeeze] of [[0, 1], [80, 0], [510, 1], [590, 0], [1000, 1], [1080, 0]]) {
    input.squeeze = squeeze;
    input.musicalOnset = squeeze > 0;
    controller.updateRecordings([looper], timeMs);
  }
  controller.stopRecording(looper, 1400);

  const gates = looper.looperData.timeline.getTrack("track-0").gateEvents;
  assert.deepEqual(gates.map(({ timeMs }) => timeMs), [0, 80, 510, 590, 1000, 1080]);
  assert.equal(looper.looperData.timeline.beatAnalysis?.beatIntervalMs, 500);
});

test("frame capture retains repeated local bend turns and exact plateaus", () => {
  const recorder = new LooperGestureRecorder();
  const timeline = new LooperTimeline();
  const track = new LooperTrack({ index: 0, connectedHonkId: "honk-a" });
  let action = { squeeze: 1, musicalOnset: true, bend: 0 };
  const capture = () => action;
  recorder.start(timeline, [track], 0, capture);
  for (const [timeMs, bend] of [[0, 0], [11, 0.9], [22, 0], [33, 0], [44, 0.6], [55, 0], [66, 0.4], [77, 0]]) {
    action = { ...action, bend };
    recorder.updateTrack(timeline, track, timeMs, capture);
  }
  action = { ...action, squeeze: 0, musicalOnset: false };
  recorder.updateTrack(timeline, track, 88, capture);
  recorder.stop(timeline, [track], 100, 1, capture);

  const snapshot = createActionState();
  for (const [timeMs, expected] of [[11, 0.9], [22, 0], [33, 0], [44, 0.6], [55, 0], [66, 0.4], [77, 0]]) {
    timeline.sampleTrack(timeline.getTrack("track-0"), timeMs, snapshot);
    assert.equal(snapshot.bend, expected);
  }
});

test("a baseline never defines standalone pre-roll and held-at-Stop preserves duration", () => {
  const recorder = new LooperGestureRecorder();
  const timeline = new LooperTimeline();
  const track = new LooperTrack({ index: 0, connectedHonkId: "honk-a" });
  let action = { squeeze: 0, musicalOnset: false, bend: 0 };
  const capture = () => action;
  recorder.start(timeline, [track], 0, capture);
  action = { squeeze: 1, musicalOnset: true, bend: 0.5 };
  recorder.updateTrack(timeline, track, 100, capture);
  recorder.stop(timeline, [track], 300, 1, capture);

  assert.deepEqual(timeline.getMusicalOnsetTimes(), [0]);
  assert.equal(timeline.getTrack("track-0").baselineActionState.bend, 0);
  assert.equal(timeline.recordedDurationMs, 200);
  assert.equal(timeline.getTrack("track-0").gateEvents.at(-1).preserveDuration, true);
});

test("audio lookahead schedules a complete short note between visual frames", () => {
  const calls = [];
  const adapter = {
    ensureAudio() {},
    getAudioCurrentTime: () => 10,
    getTimingForLooper: () => ({ connected: false }),
    isPlayableHonkId: () => true,
    getPlaybackTargetIds: (_track, honkId) => [honkId],
    startActionVoice: (voiceId, _honkId, options) => calls.push(["start", voiceId, options.scheduledTime]),
    updateActionVoiceByHonkId() {},
    releaseActionVoice: (voiceId, _honkId, options) => calls.push(["end", voiceId, options.scheduledTime]),
    cancelActionVoice: (voiceId) => calls.push(["cancel", voiceId]),
    updateVisuals() {},
  };
  const controller = new LooperController(adapter);
  const looper = { id: "looper-a", root: { visible: true }, hitTargets: {} };
  looper.looperData = controller.createStateData(looper, { trackCount: 1 });
  looper.looperData.tracks[0].connectedHonkId = "honk-a";
  const timeline = new LooperTimeline();
  timeline.addActionEvent("track-0", {
    trackIndex: 0,
    type: LooperActionEventType.SqueezeStart,
    timeMs: 30,
    value: 1,
  });
  timeline.addActionEvent("track-0", {
    trackIndex: 0,
    type: LooperActionEventType.SqueezeEnd,
    timeMs: 50,
    value: 0,
    releaseOrigin: "controller",
  });
  timeline.addActionEvent("track-0", {
    trackIndex: 0,
    type: LooperActionEventType.SqueezeStart,
    timeMs: 70,
    value: 1,
  });
  timeline.addActionEvent("track-0", {
    trackIndex: 0,
    type: LooperActionEventType.SqueezeEnd,
    timeMs: 80,
    value: 0,
    releaseOrigin: "controller",
  });
  timeline.finalizeDuration();
  timeline.durationMs = 200;
  timeline.recordedDurationMs = 200;
  looper.looperData.timeline = timeline;
  looper.looperData.hasRecording = true;

  controller.startPlayback(looper, 1000);
  controller.stopAudioScheduler(looper, { release: false });

  assert.deepEqual(calls.map(([kind, _voiceId, time]) => [kind, time]), [
    ["start", 10.03],
    ["end", 10.05],
    ["start", 10.07],
    ["end", 10.08],
  ]);
  assert.equal(calls[0][1], calls[1][1]);
  assert.equal(calls[2][1], calls[3][1]);
  assert.notEqual(calls[0][1], calls[2][1]);
  controller.stopPlayback(looper);
  assert.deepEqual(calls.slice(4), [
    ["cancel", calls[0][1]],
    ["cancel", calls[2][1]],
  ]);
});

test("60 to 200 BPM maps one shared 1000 ms source event to 300 ms", () => {
  const calls = [];
  const adapter = {
    getAudioCurrentTime: () => 10,
    getTimingForLooper: () => ({ connected: false }),
    isPlayableHonkId: () => true,
    getPlaybackTargetIds: (_track, honkId) => [honkId],
    startActionVoice: (_voiceId, _honkId, options) => calls.push(options.scheduledTime),
    updateActionVoiceByHonkId() {},
  };
  const controller = new LooperController(adapter);
  const looper = { id: "tempo-map", root: { visible: true }, hitTargets: {} };
  looper.looperData = controller.createStateData(looper, { trackCount: 1 });
  looper.looperData.tracks[0].connectedHonkId = "honk-a";
  looper.looperData.timeline.addActionEvent("track-0", {
    trackIndex: 0,
    type: LooperActionEventType.SqueezeStart,
    timeMs: 1000,
    value: 1,
  });
  looper.looperData.timeline.finalizeDuration();
  looper.looperData.timeline.durationMs = 2000;

  controller.scheduleSourceRange(looper, 0, 1000, {
    includeStart: true,
    sourceNow: 0,
    rate: 200 / 60,
    audioNow: 10,
  });

  assert.equal(calls.length, 1);
  assert.ok(Math.abs(calls[0] - 10.3) < 1e-12);
});

function createRecordingHarness() {
  const input = { squeeze: 0, musicalOnset: false, bend: 0 };
  const controller = new LooperController({
    captureActionByHonkId: () => ({ ...input }),
    getTimingForLooper: () => ({ connected: false }),
    updateVisuals() {},
  });
  const looper = { id: "looper-a", root: { visible: true }, hitTargets: {} };
  looper.looperData = controller.createStateData(looper, { trackCount: 1 });
  looper.looperData.tracks[0].connectedHonkId = "honk-a";
  return { controller, looper, input };
}
