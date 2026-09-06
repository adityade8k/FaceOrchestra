import test from "node:test";
import assert from "node:assert/strict";

import {
  captureCanonicalHonkPerformance,
  resolvePresentationValue,
} from "../../../src/app/runtime/HonkPerformanceSampling.js";
import { LooperGestureRecorder } from "../../../src/instruments/looper/LooperGestureRecorder.js";
import { LooperPlaybackEngine } from "../../../src/instruments/looper/LooperPlaybackEngine.js";
import { LooperTrack } from "../../../src/instruments/looper/LooperTrack.js";
import { getEventFieldValue } from "../../../src/instruments/looper/timeline/LooperActionEvent.js";
import { LooperTimeline } from "../../../src/instruments/looper/timeline/LooperTimeline.js";

const RECORDING_BPM = 60;
const RECORDING_BEAT_MS = 1000;

test("60 BPM recording and playback preserve full squeeze and bend extrema at every tempo", () => {
  const timeline = recordFullRangeGesture(90);
  const track = timeline.getTrack("track-0");
  const squeezeValues = fieldValues(track, "squeeze");
  const bendValues = fieldValues(track, "bend", { includeSynthetic: false });

  assertClose(Math.min(...squeezeValues), 0);
  assertClose(Math.max(...squeezeValues), 1);
  assertClose(Math.min(...bendValues), -1);
  assertClose(Math.max(...bendValues), 1);

  for (const playbackBpm of [60, 120, 180, 200]) {
    const rate = playbackBpm / RECORDING_BPM;
    const engine = new LooperPlaybackEngine();
    const snapshots = [];
    engine.start(0);

    for (const recordedTimeMs of [500, 1000, 1500]) {
      const wallTimeMs = recordedTimeMs / rate;
      engine.update(wallTimeMs, timeline, rate, {
        onTrackSnapshot: (_track, snapshot) => snapshots.push({
          wallTimeMs,
          recordedTimeMs: engine.elapsedMs,
          squeeze: snapshot.squeeze,
          bend: snapshot.bend,
        }),
      });
    }

    const peak = snapshots.at(-2);
    assertClose(peak.recordedTimeMs, 1000);
    assertClose(peak.wallTimeMs, 1000 / rate);
    assertClose(peak.squeeze, 1);
    assertClose(peak.bend, 1);
    assertClose(snapshots.at(-1).bend, 1);
  }
});

test("recorded extrema are invariant at 72, 90, and 120 Hz capture rates", () => {
  for (const renderHz of [72, 90, 120]) {
    const track = recordFullRangeGesture(renderHz).getTrack("track-0");
    const squeezeValues = fieldValues(track, "squeeze");
    const bendValues = fieldValues(track, "bend", { includeSynthetic: false });
    assertClose(Math.max(...squeezeValues), 1);
    assertClose(Math.min(...bendValues), -1);
    assertClose(Math.max(...bendValues), 1);
  }
});

test("canonical looper capture excludes presentation smoothing and playback automation", () => {
  const live = {
    squeeze: 0.35,
    bend: -0.6,
    earLeft: 0.2,
    earRight: -0.3,
    nose: 0.7,
    vowel: "I",
  };
  const captured = captureCanonicalHonkPerformance({
    kind: "honk",
    root: { visible: true },
    hornSqueezeValue: 0.95,
    bendValue: 0.8,
    getLivePerformanceState: () => ({ ...live }),
    getEarAmount: () => 1,
    getMorphValue: () => 1,
    currentVowelLetter: "O",
  });

  assert.deepEqual(captured, { musicalOnset: true, ...live });
});

test("playback automation is applied directly instead of being filtered a second time", () => {
  assert.equal(resolvePresentationValue(0, 1, 0.18, 1000 / 120, true), 1);
  assert.equal(resolvePresentationValue(0, -1, 0.18, 1000 / 200, true), -1);
});

test("live-only smoothing is time-based and render-rate invariant", () => {
  const results = [72, 90, 120].map((renderHz) => {
    let value = 0;
    for (let frame = 0; frame < renderHz; frame += 1) {
      value = resolvePresentationValue(value, 1, 0.18, 1000 / renderHz, false);
    }
    return value;
  });
  assertClose(results[0], results[1]);
  assertClose(results[1], results[2]);
});

function recordFullRangeGesture(renderHz) {
  const recorder = new LooperGestureRecorder();
  const timeline = new LooperTimeline();
  const track = new LooperTrack({ index: 0, connectedHonkId: "honk-a" });
  let action = { squeeze: 0, bend: -1 };
  const capture = () => action;
  recorder.start(timeline, [track], 0, capture, {
    active: true,
    bpm: RECORDING_BPM,
    beatIntervalMs: RECORDING_BEAT_MS,
    beatOriginMs: 0,
  });

  for (let frame = 0; frame <= renderHz * 2; frame += 1) {
    const timeMs = frame * 1000 / renderHz;
    const phase = timeMs / 2000;
    action = {
      squeeze: phase <= 0.5 ? phase * 2 : (1 - phase) * 2,
      bend: -1 + Math.min(phase * 4, 2),
    };
    recorder.updateTrack(timeline, track, timeMs, capture);
  }
  recorder.stop(timeline, [track], 2000, 1, capture);
  return timeline;
}

function fieldValues(track, field, { includeSynthetic = true } = {}) {
  return track.events
    .filter((event) => includeSynthetic || !event.synthetic)
    .map((event) => getEventFieldValue(event, field))
    .filter((value) => value !== undefined);
}

function assertClose(actual, expected, epsilon = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);
}
