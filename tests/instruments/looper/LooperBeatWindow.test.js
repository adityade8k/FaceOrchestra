import { runtimeOwners } from "../../helpers/runtimeOwners.js";
import test from "node:test";
import assert from "node:assert/strict";
import { LooperController } from "../../../src/instruments/looper/LooperController.js";
import { LooperTimeline } from "../../../src/instruments/looper/timeline/LooperTimeline.js";
import { getRecordLengthDetent } from "../../../src/instruments/looper/looperControlMapping.js";
import {
  getLooperControlColliderPosition,
  getLooperControlMorphWeights,
} from "../../../src/instruments/looper/view/looperControlPresentation.js";
import { createHarness } from "../../helpers/looperCaptureHarness.js";

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);
const select = (h, beats) =>
  h.controller.setControlValue(
    h.looper,
    "recordLength",
    { 0: -1, 2: -0.5, 4: 0, 8: 0.5, 16: 1 }[beats],
  );
function fixture() {
  const h = createHarness({ connected: true, trackCount: 1 });
  h.clock.beatIntervalMs = 1000;
  let now = 0;
  h.advance = (time, values = {}) => {
    now = time;
    Object.assign(h.inputs[0], values);
    h.controller.recording.updateRecordings([h.looper], time);
  };
  h.tempo = (bpm) => {
    const phase = (now - h.clock.beatOriginMs) / h.clock.beatIntervalMs;
    h.clock.beatIntervalMs = 60000 / bpm;
    h.clock.beatOriginMs = now - phase * h.clock.beatIntervalMs;
  };
  h.looper.looperController = h.controller;
  return h;
}

test("manual plus four beat detents, top default, hysteresis and matched visual/collider interpolation", () => {
  const h = fixture();
  assert.equal(h.looper.looperData.recordBeats, 16);
  assert.equal(h.looper.looperData.recordLengthControlValue, 1);
  const path = {
    downAnchor: { x: 1, y: -1, z: 0 },
    neutralAnchor: { x: 0, y: 0, z: 0 },
    upAnchor: { x: 1, y: 1, z: 0 },
  };
  for (const [i, beats] of [0, 2, 4, 8, 16].entries()) {
    const value = select(h, beats);
    close(value, i / 2 - 1);
    const weights = getLooperControlMorphWeights(value),
      point = getLooperControlColliderPosition({ looperControlPath: path }, value);
    close(point.y, weights.up - weights.down);
    close(point.x, weights.up + weights.down);
  }
  for (const [beats, midpoint, next] of [
    [0, -0.75, 2],
    [2, -0.25, 4],
    [4, 0.25, 8],
    [8, 0.75, 16],
  ]) {
    for (const noise of [-0.04, 0, 0.04])
      assert.equal(getRecordLengthDetent(midpoint + noise, beats).beats, beats);
    assert.equal(getRecordLengthDetent(midpoint + 0.07, beats).beats, next);
    assert.equal(getRecordLengthDetent(midpoint - 0.04, next).beats, next);
    assert.equal(getRecordLengthDetent(midpoint - 0.07, next).beats, beats);
  }
});

for (const beats of [2, 4, 8, 16])
  test(`${beats} beats: silent arming, off-beat first onset, exact endpoint and untrimmed rests`, () => {
    const h = fixture();
    select(h, beats);
    h.controller.recording.startRecording(h.looper, 0);
    h.advance(10100);
    assert.equal(h.looper.looperData.recordArmed, true);
    assert.equal(h.timeline.hasRecording(), false);
    h.advance(10250, { squeeze: 1, musicalOnset: true });
    assert.equal(h.timeline.startedAtMs, 10000);
    assert.equal(h.timeline.getMusicalOnsetTimes()[0], 250);
    assert.deepEqual(
      [h.looper.looperData.recordingWindow.startBeat, h.looper.looperData.recordingWindow.endBeat],
      [10, 10 + beats],
    );
    h.advance(10500, { squeeze: 0, musicalOnset: false });
    const end = (10 + beats) * 1000;
    h.advance(end - 1);
    assert.equal(h.looper.looperData.recording, true);
    h.advance(end);
    assert.equal(h.looper.looperData.recording, false);
    assert.equal(h.timeline.lengthMode, "fixed-window");
    assert.equal(h.timeline.recordedDurationMs, beats * 1000);
    assert.equal(h.timeline.getMusicalOnsetTimes()[0], 250);
    assert.equal(h.timeline.getTrack("track-0").gateEvents.at(-1).timeMs, 500);
    const saved = h.timeline.toJSON();
    for (const gap of [0, 4, 1, 0]) {
      h.timeline.setGapBeats(gap);
      assert.equal(h.timeline.durationMs, (beats + gap) * 1000);
      assert.deepEqual(LooperTimeline.fromJSON(h.timeline.toJSON()).toJSON(), h.timeline.toJSON());
    }
    assert.deepEqual(h.timeline.toJSON(), saved);
  });

test("selector is latched at arm, saved independently of take, and legacy controls default to 16", () => {
  const h = fixture();
  select(h, 4);
  h.controller.recording.startRecording(h.looper, 0);
  select(h, 16);
  h.advance(10250, { squeeze: 1, musicalOnset: true });
  assert.equal(h.looper.looperData.recordingWindow.beats, 4);
  h.advance(14000);
  const saved = h.controller.stateCodec.serializeState(h.looper);
  assert.equal(saved.controls.recordBeats, 16);
  assert.equal(saved.timeline.fixedWindowBeats, 4);
  h.controller.stateCodec.restoreState(h.looper, saved, {
    preserveConnections: true,
  });
  assert.equal(h.looper.looperData.recordBeats, 16);
  assert.equal(h.timeline.fixedWindowBeats, 4);
  delete saved.controls.recordBeats;
  select(h, 2);
  h.controller.stateCodec.restoreState(h.looper, saved, {
    preserveConnections: true,
  });
  assert.equal(h.looper.looperData.recordBeats, 16);
  assert.deepEqual(h.timeline.toJSON(), saved.timeline);
  const before = h.timeline.toJSON();
  h.controller.recording.startRecording(h.looper, 15000);
  h.controller.recording.stopRecording(h.looper, 99999);
  assert.deepEqual(h.timeline.toJSON(), before);
});

test("late frame interpolates held bend at boundary once; live gesture survives and post-boundary hits are excluded", () => {
  const h = fixture();
  let stops = 0;
  h.controller.adapter.onAutomaticRecordingStop = () => stops++;
  select(h, 2);
  h.controller.recording.startRecording(h.looper, 0);
  h.advance(250, { squeeze: 1, bend: 0, musicalOnset: true });
  h.advance(1800, { bend: 0.4 });
  h.inputs[0].bend = 0.8;
  assert.equal(h.controller.recording.recordSelfDrumHit(h.looper, "hihat", 2200), false);
  assert.equal(h.timeline.durationMs, 2000);
  assert.equal(h.timeline.getTrack("track-0").gateEvents.at(-1).timeMs, 2000);
  close(h.timeline.getTrack("track-0").sampleNumericField("bend", 2000), 0.6);
  assert.equal(h.inputs[0].squeeze, 1);
  assert.equal(h.inputs[0].bend, 0.8);
  assert.equal(stops, 1);
  const saved = h.timeline.toJSON();
  assert.equal(h.controller.recording.stopRecording(h.looper, 2200), false);
  h.advance(2300);
  assert.equal(stops, 1);
  assert.deepEqual(h.timeline.toJSON(), saved);
  h.calls.length = 0;
  h.controller.audioScheduler.scheduleSourceRange(h.looper, 0, 2000, {
    includeStart: true,
    sourceNow: 0,
    rate: 1,
    audioNow: 10,
  });
  const release = h.calls.findIndex((e) => e.kind === "release");
  assert.ok(release >= 0);
  close(h.calls[release - 1].snapshot.bend, 0.6);
  close(h.calls[release].scheduledTime, 12);
});

test("manual Stop race at exact beat finalizes fixed window; early Stop trims silence and preserves final held expression", () => {
  for (const order of ["manual", "frame"]) {
    const h = fixture();
    select(h, 2);
    h.controller.recording.startRecording(h.looper, 0);
    h.advance(250, { squeeze: 1, musicalOnset: true });
    if (order === "manual") h.controller.recording.stopRecording(h.looper, 2000);
    else h.advance(2000);
    const revision = h.looper.looperData.takeRevision;
    h.controller.recording.stopRecording(h.looper, 2000);
    h.advance(2000);
    assert.equal(h.looper.looperData.takeRevision, revision);
    assert.equal(h.timeline.lengthMode, "fixed-window");
  }
  const h = fixture();
  select(h, 4);
  h.controller.recording.startRecording(h.looper, 0);
  h.advance(250, { squeeze: 1, musicalOnset: true });
  h.advance(700, { bend: -0.75 });
  h.controller.recording.stopRecording(h.looper, 900);
  assert.equal(h.timeline.lengthMode, "content-trimmed");
  assert.equal(h.timeline.durationMs, 650);
  assert.equal(h.timeline.getTrack("track-0").sampleNumericField("bend", 650), -0.75);
  assert.deepEqual(LooperTimeline.fromJSON(h.timeline.toJSON()).toJSON(), h.timeline.toJSON());
  h.advance(1000, { squeeze: 0, musicalOnset: false });
  h.controller.recording.startRecording(h.looper, 2000);
  h.advance(2250, { squeeze: 1, musicalOnset: true });
  h.advance(2500, { squeeze: 0, musicalOnset: false });
  h.controller.recording.stopRecording(h.looper, 3500);
  assert.equal(h.timeline.durationMs, 250);
});

test("tempo change retains continuous beat phase and expressive source timing instead of a wall-clock deadline", () => {
  const h = fixture();
  select(h, 4);
  h.controller.recording.startRecording(h.looper, 0);
  h.advance(250, { squeeze: 1, musicalOnset: true });
  h.advance(1500, { bend: -0.2 });
  h.tempo(120);
  h.advance(2000, { bend: -0.5 });
  assert.equal(h.controller.recording.getRecordingProgress(h.looper, 2000).elapsedBeats, 2.5);
  h.advance(2749);
  assert.equal(h.looper.looperData.recording, true);
  h.advance(2750);
  assert.equal(h.timeline.durationMs, 4000);
  assert.equal(h.timeline.getTrack("track-0").gateEvents.at(-1).timeMs, 4000);
  assert.ok(
    h.timeline.getTrack("track-0").events.some((e) => e.timeMs === 2500 && e.values?.bend === -0.5),
  );
});

for (const source of ["track", "self"])
  test(`${source} percussion starts capture, preserves the full sound and leaves the logical window fixed`, () => {
    const h = fixture();
    select(h, 2);
    h.controller.recording.startRecording(h.looper, 0);
    const hit = (time) =>
      source === "self"
        ? h.controller.recording.recordSelfDrumHit(h.looper, "hihat", time)
        : h.controller.recording.recordTrackDrumHit(
            h.looper,
            h.looper.looperData.tracks[0],
            "hihat",
            time,
          );
    hit(250);
    hit(1950);
    assert.equal(hit(2000), false);
    assert.equal(h.timeline.durationMs, 2000);
    const drums = h.timeline.getActiveTracks()[0].drumEvents;
    assert.equal(drums.length, 2);
    assert.ok(drums[1].timeMs + drums[1].durationMs > 2000);
    h.controller.audioScheduler.scheduleSourceRange(h.looper, 0, 4000, {
      includeStart: true,
      sourceNow: 0,
      rate: 1,
      audioNow: 10,
    });
    assert.equal(h.calls.filter((c) => c.kind === "drum").length, 4);
  });

test("individual Play selects one looper; Start All shares a clock across different ports and ignores ineligible takes", () => {
  const group = [2, 4, 8, 16].map((beats, i) => {
    const h = fixture();
    h.looper.id = `looper-${i}`;
    select(h, beats);
    h.controller.recording.startRecording(h.looper, 0);
    h.controller.recording.recordSelfDrumHit(h.looper, "hihat", 250);
    h.advance(beats * 1000);
    return h;
  });
  const empty = fixture(),
    armed = fixture(),
    disconnected = fixture();
  armed.controller.recording.startRecording(armed.looper, 0);
  disconnected.clock.connected = false;
  const all = [...group, empty, armed, disconnected];
  for (const h of all) h.controller.adapter.getLoopers = () => all.map((h) => h.looper);
  assert.equal(group[0].controller.startPlayback(group[0].looper, 20100), true);
  assert.equal(group[1].looper.looperData.pendingLaunch, null);
  const anchor = group[0].looper.looperData.pendingLaunch.audioAnchor;
  assert.equal(
    LooperController.startAll(
      all.map((h) => h.looper),
      20200,
    ).ok,
    true,
  );
  for (const h of group) {
    assert.equal(h.looper.looperData.pendingLaunch.targetBeat, 21);
    assert.equal(h.looper.looperData.pendingLaunch.audioAnchor, anchor);
    h.controller.updateClockedTransports([h.looper], 21000);
    assert.equal(h.looper.looperData.launchHistory.length, 1);
  }
  for (const h of [empty, armed, disconnected])
    assert.equal(h.looper.looperData.pendingLaunch, null);
  assert.equal(armed.looper.looperData.recordArmed, true);
  for (let cycle = 1; cycle <= 128; cycle++)
    for (const h of group) {
      const now = 21000 + cycle * 16000;
      h.controller.updatePlaybackForLooper(h.looper, now);
      close(h.looper.looperData.playbackEngine.elapsedMs, 0);
      assert.equal(h.looper.looperData.launchHistory.length, 1);
    }
  const before = group.map((h) => h.timeline.toJSON());
  group[1].controller.setControlValue(group[1].looper, "gap", -0.5);
  group[0].controller.startPlayback(group[0].looper, 22000);
  const victim = group[1];
  victim.clock.connected = false;
  victim.controller.updateClockedTransports([victim.looper], 22500);
  assert.equal(victim.looper.looperData.pendingLaunch, null);
  assert.equal(victim.looper.looperData.playing, false);
  const deleted = group[2];
  deleted.looper.disposed = true;
  deleted.controller.audioScheduler.schedulePlaybackAudioForLooper(deleted.looper, 22500);
  assert.equal(deleted.looper.looperData.pendingLaunch, null);
  assert.deepEqual(group[0].timeline.toJSON(), before[0]);
  for (const h of all) h.controller.stopPlayback(h.looper);
});

test("physical Stop racing automatic completion retains the take and animates Stop; later idle Stop still clears", async () => {
  const { runtimeModule } = await import("../../helpers/runtimeModule.mjs");
  const { LooperTransportRuntimeMethods } = await runtimeModule(
    new URL("../../../src/app/runtime/LooperTransportRuntime.js", import.meta.url),
  );
  const h = fixture();
  h.looper.kind = "looper";
  const morphs = [];
  const r = runtimeOwners({
    ...LooperTransportRuntimeMethods,
    looperConnections: { updateLooperVisuals() {} },
    presentation: { setMorph: (...args) => morphs.push(args) },
  });
  h.controller.adapter.onAutomaticRecordingStop = (looper, now) =>
    r.triggerLooperButtonMorph(looper, "stop", now);
  select(h, 2);
  h.controller.recording.startRecording(h.looper, 0);
  h.advance(250, { squeeze: 1, musicalOnset: true });
  h.advance(2000);
  const before = h.timeline.toJSON();
  r.pressLooperButton(h.looper, "stop", null, 2000);
  assert.deepEqual(h.timeline.toJSON(), before);
  assert.ok(morphs.some(([name, value]) => name === "button_stop_recording" && value === 1));
  assert.equal(h.inputs[0].squeeze, 1);
  r.pressLooperButton(h.looper, "stop", null, 2200);
  assert.equal(h.timeline.hasRecording(), false);
});

test("disconnect finalization keeps the captured clock domain instead of jumping to internal phase", () => {
  const h = fixture();
  h.clock.beatOriginMs = 10000;
  select(h, 16);
  h.controller.recording.startRecording(h.looper, 10000);
  h.advance(10250, { squeeze: 1, musicalOnset: true });
  h.advance(10500, { bend: 0.7 });
  h.clock.connected = false;
  h.controller.recording.stopRecording(h.looper, 10750);
  assert.equal(h.timeline.lengthMode, "content-trimmed");
  assert.equal(h.timeline.durationMs, 500);
});

test("Manual records past 16 beats until Stop; chosen duration and rests survive reload", () => {
  const h = fixture();
  select(h, 0);
  h.controller.recording.startRecording(h.looper, 0);
  h.advance(250, { squeeze: 1, musicalOnset: true });
  h.advance(500, { squeeze: 0, musicalOnset: false });
  h.advance(17500);
  assert.equal(h.looper.looperData.transport.recording, true);
  const progress = h.controller.recording.getRecordingProgress(h.looper, 17500);
  assert.equal(progress.manual, true);
  assert.equal(progress.beat, 18);
  h.controller.recording.stopRecording(h.looper, 17750);
  assert.equal(h.looper.looperData.transport.recording, false);
  assert.equal(h.timeline.recordedDurationMs, 17750);
  assert.equal(h.looper.looperData.recordingCompletion.automatic, false);
  const saved = h.controller.stateCodec.serializeState(h.looper);
  h.controller.stateCodec.restoreState(h.looper, saved, {
    preserveConnections: true,
  });
  assert.equal(h.looper.looperData.recordBeats, 0);
  assert.deepEqual(h.timeline.toJSON(), saved.timeline);
});

for (const state of ["playing", "paused", "armed", "idle"])
  test(`physical Stop saves recording, then clears an already loaded ${state} loop`, async () => {
    const { runtimeModule } = await import("../../helpers/runtimeModule.mjs");
    const { LooperTransportRuntimeMethods } = await runtimeModule(
      new URL("../../../src/app/runtime/LooperTransportRuntime.js", import.meta.url),
    );
    const h = fixture();
    h.looper.kind = "looper";
    const r = runtimeOwners({
      ...LooperTransportRuntimeMethods,
      looperConnections: { updateLooperVisuals() {} },
      presentation: { setMorph() {} },
    });
    select(h, 0);
    r.pressLooperButton(h.looper, "record", null, 0);
    h.advance(250, { squeeze: 1, musicalOnset: true });
    h.advance(750, { squeeze: 0, musicalOnset: false });
    r.pressLooperButton(h.looper, "stop", null, 900);
    assert.equal(h.timeline.hasRecording(), true, "Stop saves the recorded phrase");
    const saved = h.timeline.toJSON();
    if (state !== "idle") {
      r.pressLooperButton(h.looper, "play", null, 1100);
      if (state === "armed") assert.equal(h.looper.looperData.playArmed, true);
      else {
        h.controller.updateClockedTransports([h.looper], 2000);
        assert.equal(h.looper.looperData.playing, true);
        if (state === "paused") {
          r.pressLooperButton(h.looper, "pause", null, 2100);
          h.controller.updateClockedTransports([h.looper], 3000);
          assert.equal(h.looper.looperData.paused, true);
          assert.deepEqual(h.timeline.toJSON(), saved, "Pause preserves the phrase");
        }
      }
    }
    r.pressLooperButton(h.looper, "stop", null, 3100);
    assert.equal(h.timeline.hasRecording(), false);
    assert.equal(h.looper.looperData.playing, false);
    assert.equal(h.looper.looperData.paused, false);
    assert.equal(h.looper.looperData.playArmed, false);
    assert.equal(h.looper.looperData.pendingLaunch, null);
  });
