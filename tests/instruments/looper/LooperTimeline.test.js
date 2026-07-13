import test from "node:test";
import assert from "node:assert/strict";

import { createActionState } from "../../../src/instruments/looper/timeline/actionState.js";
import { LooperActionEventType } from "../../../src/instruments/looper/timeline/LooperActionEvent.js";
import { LooperTimeline } from "../../../src/instruments/looper/timeline/LooperTimeline.js";

test("LooperTimeline normalizes the first action and computes duration plus gap", () => {
  const timeline = new LooperTimeline();
  timeline.startRecording(1000);
  timeline.addFieldEvent("track-0", "squeeze", 120, 1, { trackIndex: 0 });
  timeline.addFieldEvent("track-0", "squeeze", 320, 0, { trackIndex: 0 });

  assert.equal(timeline.stopRecording(1500, 24, 80), true);
  assert.deepEqual(
    timeline.getTrack("track-0").events.map((event) => event.timeMs),
    [0, 200],
  );
  assert.equal(timeline.contentEndMs, 200);
  assert.equal(timeline.durationMs, 280);
});

test("LooperTimeline linearly samples numeric fields and steps vowel fields", () => {
  const timeline = new LooperTimeline();
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
  timeline.setLoopGap(0, 24);
  const snapshot = createActionState();

  timeline.sampleTrack(timeline.getTrack("track-0"), 50, snapshot);

  assert.equal(snapshot.bend, 0);
  assert.equal(snapshot.vowel, "A");
});

test("LooperTimeline emits neutral squeeze and bend during its loop gap", () => {
  const timeline = new LooperTimeline();
  timeline.addFieldEvent("track-0", "squeeze", 0, 1, { trackIndex: 0 });
  timeline.addFieldEvent("track-0", "bend", 100, 0.5, { trackIndex: 0 });
  timeline.setLoopGap(200, 24);
  const snapshot = createActionState();

  timeline.sampleTrack(timeline.getTrack("track-0"), 150, snapshot);

  assert.equal(snapshot.squeeze, 0);
  assert.equal(snapshot.bend, 0);
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
  timeline.setLoopGap(30, 24);

  const restored = LooperTimeline.fromJSON(JSON.parse(JSON.stringify(timeline.toJSON())));

  assert.equal(restored.hasRecording(), true);
  assert.equal(restored.durationMs, 120);
  assert.equal(restored.getTrack("track-0").hasRecordedField("squeeze"), true);
  assert.equal(restored.getDrumHitEventsAt(90)[0].event.value, "boink");

  restored.getTrack("track-0").events[0].value = 0.25;
  assert.equal(timeline.getTrack("track-0").events[0].value, 1);
});
