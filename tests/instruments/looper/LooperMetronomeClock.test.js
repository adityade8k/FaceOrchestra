import test from "node:test";
import assert from "node:assert/strict";

import { LooperController } from "../../../src/instruments/looper/LooperController.js";
import { LooperPlaybackEngine } from "../../../src/instruments/looper/LooperPlaybackEngine.js";
import { LooperTimingMode, LooperTimeline } from "../../../src/instruments/looper/timeline/LooperTimeline.js";

test("connected Record waits for the first sound and starts at its preceding beat", () => {
  const clock = timing({ beatPosition: 0.5, ordinal: 0, lastBeatMs: 1000 });
  const input = { squeeze: 0, musicalOnset: false };
  const recording = createLooper("recording", clock, {
    captureAction: () => ({ ...input }),
  });
  assert.equal(recording.controller.startRecording(recording.looper, 1250), true);
  assert.equal(recording.data.recordArmed, true);
  assert.equal(recording.data.recording, false);

  Object.assign(clock, timing({ beatPosition: 1, ordinal: 1, lastBeatMs: 1500 }));
  recording.controller.updateClockedTransports([recording.looper], 1500);
  recording.controller.updateRecordings([recording.looper], 1500);
  assert.equal(recording.data.recordArmed, true);
  assert.equal(recording.data.recording, false);

  input.musicalOnset = true;
  Object.assign(clock, timing({ beatPosition: 1.42, ordinal: 1, lastBeatMs: 1500 }));
  recording.controller.updateRecordings([recording.looper], 1710);
  assert.equal(recording.data.recordArmed, false);
  assert.equal(recording.data.recording, true);
  assert.equal(recording.data.timeline.startedAtMs, 1500);
  input.squeeze = 1;
  Object.assign(clock, timing({ beatPosition: 1.44, ordinal: 1, lastBeatMs: 1500 }));
  recording.controller.updateRecordings([recording.looper], 1720);
  assert.equal(recording.data.timeline.getTrack("track-0").events[0].timeMs, 220);
});

test("connected Play remains armed until the next clock beat", () => {
  const playbackClock = timing({ beatPosition: 2.2, ordinal: 2, lastBeatMs: 2000 });
  const playback = createLooper("playback", playbackClock, { recording: true });
  assert.equal(playback.controller.startPlayback(playback.looper, 2100), true);
  assert.equal(playback.data.playArmed, true);
  playback.controller.updateClockedTransports([playback.looper], 2200);
  assert.equal(playback.data.playing, false);
  Object.assign(playbackClock, timing({ beatPosition: 3, ordinal: 3, lastBeatMs: 2500 }));
  playback.controller.updateClockedTransports([playback.looper], 2500);
  assert.equal(playback.data.playing, true);
  assert.equal(playback.data.playbackEngine.elapsedMs, 0);
});

test("a stopped Metronome keeps starts armed and Stop cancels them cleanly", () => {
  const clock = timing({ active: false, beatPosition: null, ordinal: null, lastBeatMs: null });
  const playback = createLooper("waiting-play", clock, { recording: true });
  playback.controller.startPlayback(playback.looper, 1000);
  playback.controller.updateClockedTransports([playback.looper], 2000);
  assert.equal(playback.data.playArmed, true);
  assert.equal(playback.data.playing, false);
  playback.controller.stopPlayback(playback.looper);
  assert.equal(playback.data.armed, false);
  assert.equal(playback.data.transport.stopped, true);

  const recording = createLooper("waiting-record", clock);
  recording.controller.startRecording(recording.looper, 1000);
  assert.equal(recording.data.recordArmed, true);
  recording.controller.stopRecording(recording.looper, 1200);
  assert.equal(recording.data.armed, false);
  assert.equal(recording.data.timeline.hasRecording(), false);
});

test("the first beat after a stopped Metronome starts launches every armed Looper at zero", () => {
  const clock = timing({ active: false, beatPosition: null, ordinal: null, lastBeatMs: null });
  const first = createLooper("first", clock, { recording: true });
  const second = createLooper("second", clock, { recording: true });
  first.controller.startPlayback(first.looper, 1000);
  second.controller.startPlayback(second.looper, 1400);

  Object.assign(clock, timing({ beatPosition: 0, ordinal: 0, lastBeatMs: 3000 }));
  first.controller.updateClockedTransports([first.looper], 3000);
  second.controller.updateClockedTransports([second.looper], 3000);

  assert.equal(first.data.playbackEngine.elapsedMs, 0);
  assert.equal(second.data.playbackEngine.elapsedMs, 0);
  assert.equal(first.data.clockPlaybackStartBeatPosition, 0);
  assert.equal(second.data.clockPlaybackStartBeatPosition, 0);
});

test("clocked Stop derives duration from musical content without whole-beat padding", () => {
  const clock = timing({ beatPosition: 0.2, ordinal: 0, lastBeatMs: 1000 });
  const context = createLooper("record-grid", clock);
  context.controller.startRecording(context.looper, 1100);
  Object.assign(clock, timing({ beatPosition: 1, ordinal: 1, lastBeatMs: 1500 }));
  context.controller.updateClockedTransports([context.looper], 1500);
  context.controller.recordSelfDrumHit(context.looper, "boink", 1600);
  context.controller.stopRecording(context.looper, 1750);

  const event = context.data.timeline.getTrack("looper-self-percussion").events[0];
  assert.equal(event.timeMs, 0);
  assert.equal(context.data.timeline.durationMs, 24);
  assert.notEqual(context.data.timeline.durationMs % context.data.timeline.beatIntervalMs, 0);
});

test("clocked playback derives its position from beat phase and preserves phase through BPM changes", () => {
  const clock = timing({ beatPosition: 0.25, ordinal: 0, lastBeatMs: 1000 });
  const context = createLooper("phase", clock, { recording: true });
  context.controller.startPlayback(context.looper, 1125);
  Object.assign(clock, timing({ beatPosition: 1, ordinal: 1, lastBeatMs: 1500 }));
  context.controller.updateClockedTransports([context.looper], 1500);
  assert.equal(context.data.playbackEngine.elapsedMs, 0);

  Object.assign(clock, timing({ beatPosition: 1.5, ordinal: 1, lastBeatMs: 1500, bpm: 60 }));
  context.controller.updatePlaybackForLooper(context.looper, 2000);
  assert.equal(context.data.playbackEngine.elapsedMs, 250);

  Object.assign(clock, timing({ beatPosition: 2, ordinal: 2, lastBeatMs: 2500, bpm: 60 }));
  context.controller.updatePlaybackForLooper(context.looper, 2500);
  assert.equal(context.data.playbackEngine.elapsedMs, 0);
});

test("clocked playback has no accumulated drift after many loop boundaries", () => {
  const timeline = recordedTimeline();
  const engine = new LooperPlaybackEngine();
  engine.start(0);
  engine.updateFromClock(10_000_125, timeline);
  assert.equal(engine.elapsedMs, 125);
  engine.updateFromClock(20_000_375, timeline);
  assert.equal(engine.elapsedMs, 375);
});

test("Metronome pause leaves linked Looper playback running on its silent clock grid", () => {
  const clock = timing({ beatPosition: 0.2, ordinal: 0, lastBeatMs: 1000 });
  const context = createLooper("pause", clock, { recording: true });
  context.controller.startPlayback(context.looper, 1100);
  Object.assign(clock, timing({ beatPosition: 1, ordinal: 1, lastBeatMs: 1500 }));
  context.controller.updateClockedTransports([context.looper], 1500);
  assert.equal(context.data.playing, true);

  Object.assign(clock, timing({
    active: false,
    beatOriginMs: 1000,
    beatPosition: 1.2,
    ordinal: null,
    lastBeatMs: 1500,
  }));
  context.controller.updateClockedTransports([context.looper], 1600);
  context.controller.updatePlaybackForLooper(context.looper, 1600);
  assert.equal(context.data.playing, true);
  assert.equal(context.data.playArmed, false);
  assert.equal(context.data.playbackEngine.playing, true);
  assert.equal(context.data.playbackEngine.elapsedMs, 100);

  Object.assign(clock, timing({ beatPosition: 2, ordinal: 2, lastBeatMs: 2000 }));
  context.controller.updateClockedTransports([context.looper], 2000);
  context.controller.updatePlaybackForLooper(context.looper, 2000);
  assert.equal(context.data.playing, true);
  assert.equal(context.data.playbackEngine.elapsedMs, 0);
});

test("connected Play and Pause are independent and both take effect on beats", () => {
  const clock = timing({ beatPosition: 0.2, ordinal: 0, lastBeatMs: 1000 });
  const context = createLooper("quantized-transport", clock, { recording: true });
  context.controller.startPlayback(context.looper, 1100);
  Object.assign(clock, timing({ beatPosition: 1, ordinal: 1, lastBeatMs: 1500 }));
  context.controller.updateClockedTransports([context.looper], 1500);
  assert.equal(context.data.playing, true);

  Object.assign(clock, timing({
    active: false,
    beatOriginMs: 1000,
    beatPosition: 1.2,
    ordinal: null,
    lastBeatMs: 1500,
  }));
  context.controller.pausePlayback(context.looper, 1600);
  assert.equal(context.data.pauseArmed, true);
  assert.equal(context.data.playing, true);
  context.controller.updateClockedTransports([context.looper], 1600);
  assert.equal(context.data.playing, true);

  Object.assign(clock, timing({
    active: false,
    beatOriginMs: 1000,
    beatPosition: 2,
    ordinal: null,
    lastBeatMs: 2000,
  }));
  context.controller.updateClockedTransports([context.looper], 2000);
  assert.equal(context.data.pauseArmed, false);
  assert.equal(context.data.paused, true);
  assert.equal(context.data.playing, false);

  Object.assign(clock, timing({
    active: false,
    beatOriginMs: 1000,
    beatPosition: 2.2,
    ordinal: null,
    lastBeatMs: 2000,
  }));
  context.controller.startPlayback(context.looper, 2100);
  assert.equal(context.data.playArmed, true);
  Object.assign(clock, timing({
    active: false,
    beatOriginMs: 1000,
    beatPosition: 3,
    ordinal: null,
    lastBeatMs: 2500,
  }));
  context.controller.updateClockedTransports([context.looper], 2500);
  assert.equal(context.data.playing, true);
  assert.equal(context.data.playbackEngine.elapsedMs, 0);
});

test("an unconnected Looper keeps ordinary immediate recording and playback", () => {
  const context = createLooper("standalone", { active: false, connected: false });
  context.controller.startRecording(context.looper, 1000);
  assert.equal(context.data.recording, true);
  assert.equal(context.data.armed, false);
  context.controller.recordSelfDrumHit(context.looper, "boink", 1050);
  context.controller.stopRecording(context.looper, 1200);
  context.controller.startPlayback(context.looper, 1300);
  assert.equal(context.data.playing, true);
  assert.equal(context.data.armed, false);
});

function createLooper(id, clock, { recording = false, captureAction = null } = {}) {
  const adapter = {
    getTimingForLooper: () => ({ ...clock }),
    captureActionByHonkId: captureAction,
    updateVisuals() {},
    ensureAudio() {},
  };
  const controller = new LooperController(adapter);
  const looper = { id, root: { visible: true }, hitTargets: {} };
  looper.looperData = controller.createStateData(looper, { trackCount: 1 });
  if (captureAction) looper.looperData.tracks[0].connectedHonkId = "honk-a";
  if (recording) {
    looper.looperData.timeline = recordedTimeline();
    looper.looperData.hasRecording = true;
    looper.looperData.durationMs = looper.looperData.timeline.durationMs;
    controller.syncTrackActivityFromTimeline(looper);
  }
  return { controller, looper, data: looper.looperData };
}

function recordedTimeline() {
  const timeline = new LooperTimeline();
  timeline.timingMode = LooperTimingMode.Metronome;
  timeline.beatIntervalMs = 500;
  timeline.addFieldEvent("track-0", "squeeze", 0, 1, { trackIndex: 0 });
  timeline.addFieldEvent("track-0", "squeeze", 500, 0, { trackIndex: 0 });
  timeline.finalizeDuration(1);
  return timeline;
}

function timing({
  active = true,
  beatPosition,
  ordinal,
  lastBeatMs,
  bpm = 120,
  beatOriginMs = active ? 1000 : null,
} = {}) {
  return {
    active,
    clockAvailable: Number.isFinite(beatOriginMs),
    connected: true,
    metronomeId: "metro-a",
    portId: "port-0",
    bpm,
    beatIntervalMs: 60000 / bpm,
    beatOriginMs,
    beatPosition,
    lastEmittedBeatOrdinal: ordinal,
    lastBeatMs,
  };
}
