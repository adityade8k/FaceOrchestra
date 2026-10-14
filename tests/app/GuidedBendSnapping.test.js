import test from "node:test";
import assert from "node:assert/strict";
import { fixture, flushAudio } from "../support/manualHonkFixture.mjs";
import { BendSnapping } from "../../src/tutorial/BendSnapping.js";
import { BendHaptics } from "../../src/tutorial/BendHaptics.js";
import { observeBendGesture } from "../../src/tutorial/observeBendGesture.js";
import { TutorialRuntime } from "../../src/tutorial/TutorialRuntime.js";

for (const range of [4, 5]) for (const mode of ["tutorial", "guided recording"])
  test(`${mode}, range ${range}: snapping reaches audio, feedback and capture through one held voice`, async () => {
    const f = fixture({ locked: true }), h = f.honks[0], c = f.controllers[0];
    h.pitchBendRange = range;
    const event = { type: "note", role: "lead", bend: [
      { fraction: 0, semitones: 0 }, { fraction: .2, semitones: 0 },
      { fraction: .7, semitones: -3 }, { fraction: 1, semitones: -3 },
    ] };
    const events = [event], guide = { mode: "practice", phase: "practicing", step: event };
    const adapter = { r: f.host, ids: role => role === "lead" ? [h.id] : [], gestures: new Map() };
    const tutorial = Object.assign(Object.create(TutorialRuntime.prototype), {
      ready: true, bendSnapping: new BendSnapping(adapter),
      ...(mode === "tutorial" ? { session: guide } : { jogRecording: { guidance: () => guide } }),
    });
    f.host.tutorial = { snapBend: tutorial.snapBend.bind(tutorial),
      isBendSnapped: tutorial.isBendSnapped.bind(tutorial),
      capturePanelTrigger: () => false, blocksController: () => false,
      releasePanelTrigger() {} };
    const pulses = [];
    f.host.getControllerGamepad = () => ({});
    f.host.hapticsService = { pulse: (...args) => pulses.push(args) };
    const haptics = new BendHaptics(adapter);
    f.press(); f.frame(); await flushAudio();
    adapter.gestures.set(c, { id: "hold", role: "lead", origin: "learner", targetId: h.id });
    const voice = f.audio.voices.get("left:h0");
    haptics.update(events);
    c.roll = -2.2 / range;
    f.frame(); haptics.update(events);
    assert.equal(h.getLivePerformanceState().bend * range, -3);
    assert.equal(h.getProcessedLivePerformanceState().bend * range, -3,
      "The captured note bypasses the slow wrist smoothing immediately");
    assert.equal(voice.source.detune.events.at(-1).constant, .008,
      "Audio reaches 95% of the target in 24 ms, well inside a 92 BPM sixteenth note");
    assert.equal(pulses.length, 1, "Entering the snap gives immediate haptic feedback");
    for (let i = 0; i < 100; i++) {
      c.roll = (i % 2 ? -2.5 : -3.5) / range;
      f.frame(); haptics.update(events);
    }
    assert.equal(pulses.length, 1, "Jitter within the captured zone does not repeat haptics");
    c.roll = -1; f.frame(); haptics.update(events);
    assert.equal(h.getLivePerformanceState().bend * range, -3,
      "Rolling all the way past a downward endpoint cannot undershoot it");
    assert.equal(h.getProcessedLivePerformanceState().bend * range, -3);
    assert.equal(voice.source.detune.value, -300, "Audio remains exactly on the floor");
    assert.equal(pulses.length, 1, "Over-rotation does not sound or pulse later pitch marks");
    assert.ok(Math.abs(voice.source.detune.value + 300) < .01);
    const observation = observeBendGesture(adapter, "lead", "practice");
    assert.ok(Math.abs(observation.semitones + 3) < .001);
    const recorded = f.host.captureLooperActionFromHonk(h);
    assert.equal(recorded.bend * range, -3, "Capture records the limit, not the excess wrist rotation");
    assert.equal(recorded.bend, h.getProcessedLivePerformanceState().bend);
    assert.ok(Math.abs(recorded.bend * range + 3) < .001);
    assert.equal(f.audio.voices.get("left:h0"), voice);
    assert.equal(f.counters.starts, 1, "Snapping changes pitch without retriggering audio");
    c.roll = -1.7 / range; f.frame();
    assert.ok(Math.abs(h.getLivePerformanceState().bend * range + 1.7) < 1e-8);
    assert.equal(voice.source.detune.events.at(-1).constant, .045,
      "Leaving capture restores ordinary glide smoothing");
    c.roll = -2.8 / range; f.frame();
    assert.equal(h.getLivePerformanceState().bend * range, -3);
    tutorial.session = null; tutorial.jogRecording = null; f.frame();
    assert.ok(Math.abs(h.getLivePerformanceState().bend * range + 2.8) < 1e-8,
      "Leaving guidance immediately restores continuous bending");
    f.release(); assert.equal(f.audio.voices.size, 0);
  });
