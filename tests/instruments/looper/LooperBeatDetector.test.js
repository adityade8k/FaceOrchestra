import test from "node:test";
import assert from "node:assert/strict";
import { LooperBeatDetector } from "../../../src/instruments/looper/LooperBeatDetector.js";
import { LooperTimeline } from "../../../src/instruments/looper/timeline/LooperTimeline.js";
import { LooperActionEventType } from "../../../src/instruments/looper/timeline/LooperActionEvent.js";

test("beat detector infers tempo, clusters chords, and stabilizes the loop boundary", () => {
  const timeline = new LooperTimeline();
  addNote(timeline, "track-0", 0, 112, 492);
  addNote(timeline, "track-1", 1, 137, 515);
  addNote(timeline, "track-0", 0, 609, 1008);
  addNote(timeline, "track-0", 0, 1115, 1494);
  timeline.stopRecording(1600, 1, { preserveRecordingOrigin: true });

  const detector = new LooperBeatDetector();
  const analysis = detector.analyze(timeline);
  assert.ok(analysis);
  assert.ok(Math.abs(analysis.beatIntervalMs - 495.25) < 2);
  assert.equal(analysis.clusterCount, 3);

  detector.apply(timeline, analysis);
  const firstChordTimes = [
    timeline.getTrack("track-0").events[0].timeMs,
    timeline.getTrack("track-1").events[0].timeMs,
  ];
  assert.deepEqual(firstChordTimes, [analysis.originMs, analysis.originMs]);
  assert.ok(timeline.durationMs >= timeline.contentEndMs);
  assert.ok(Math.abs(timeline.durationMs / analysis.beatIntervalMs - 4) < 1e-9);
});

test("beat correction leaves pitch actions continuous while snapping note gates", () => {
  const timeline = new LooperTimeline();
  addNote(timeline, "track-0", 0, 100, 470);
  timeline.addFieldEvent("track-0", "earLeft", 333, 0.42, { trackIndex: 0 });
  addNote(timeline, "track-0", 0, 605, 980);
  timeline.stopRecording(1100, 1, { preserveRecordingOrigin: true });

  const detector = new LooperBeatDetector();
  const analysis = detector.analyze(timeline);
  detector.apply(timeline, analysis);
  const events = timeline.getTrack("track-0").events;
  const pitch = events.find((event) => event.type === LooperActionEventType.EarLeft);
  const secondAttack = events.filter((event) => event.type === LooperActionEventType.SqueezeStart)[1];
  assert.equal(pitch.timeMs, 333);
  assert.equal(secondAttack.timeMs, analysis.originMs + analysis.beatIntervalMs);
});

test("beat correction drops the record-to-Stop rest and ends on the next phrase beat", () => {
  const timeline = new LooperTimeline();
  timeline.startRecording(1000);
  addNote(timeline, "track-0", 0, 300, 500);
  addNote(timeline, "track-0", 0, 700, 900);
  addNote(timeline, "track-0", 0, 1300, 1500);
  timeline.stopRecording(3000, 1, { preserveRecordingOrigin: true });

  const detector = new LooperBeatDetector();
  const analysis = detector.analyze(timeline);
  detector.apply(timeline, analysis);

  const attacks = timeline.getTrack("track-0").events
    .filter((event) => event.type === LooperActionEventType.SqueezeStart)
    .map((event) => event.timeMs);
  assert.equal(attacks[0], 0);
  assert.equal(attacks[2] - attacks[1], 625);
  assert.equal(timeline.durationMs, 1500);
  assert.equal(timeline.durationMs - attacks.at(-1), analysis.beatIntervalMs);
});

function addNote(timeline, trackId, trackIndex, startMs, endMs) {
  timeline.addActionEvent(trackId, {
    trackIndex,
    type: LooperActionEventType.SqueezeStart,
    timeMs: startMs,
    value: 1,
    interpolation: "linear",
  });
  timeline.addActionEvent(trackId, {
    trackIndex,
    type: LooperActionEventType.SqueezeEnd,
    timeMs: endMs,
    value: 0,
    interpolation: "linear",
  });
}
