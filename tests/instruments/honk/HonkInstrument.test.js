import assert from "node:assert/strict";
import test from "node:test";

import { HonkInstrument } from "../../../src/instruments/honk/HonkInstrument.js";

test("one physical Honk routes every logical source through one renderer ID", () => {
  const calls = [];
  const voiceService = {
    startVoice: (voiceId) => calls.push(["start", voiceId]),
    updateVoice: (voiceId, performance, tuning, options) =>
      calls.push(["update", voiceId, performance, tuning, options]),
    setVoiceVowel: (voiceId, vowel) => calls.push(["vowel", voiceId, vowel]),
    releaseVoice: (voiceId) => calls.push(["release", voiceId]),
    disposeVoice: (voiceId) => calls.push(["dispose", voiceId]),
  };
  const honk = new HonkInstrument({
    id: "honk-audio",
    root: object3D(),
    voiceService,
    morphController: morphController(),
    tuning: { pitchSnap: "cMajor" },
  });
  const voiceId = "right:instrument-honk-audio";
  const looperVoiceId = "looper-a:track-0";

  honk.startAudioVoice(voiceId);
  honk.startAudioVoice(looperVoiceId);
  honk.updateAudioVoice(voiceId, {
    squeeze: 0.8,
    bend: -0.25,
    earLeft: 0.2,
    earRight: -0.1,
    nose: 0.4,
    vowel: "O",
  }, { gain: 0.5 });
  honk.setAudioVowel("I");
  honk.releaseAudioVoice(voiceId);
  honk.releaseAudioVoice(looperVoiceId);

  assert.deepEqual(calls[0], ["start", "honk-honk-audio"]);
  assert.deepEqual(calls[1], ["start", "honk-honk-audio"]);
  assert.equal(calls[2][0], "update");
  assert.equal(calls[2][1], "honk-honk-audio");
  assert.equal(calls[2][2].squeeze, 0.8);
  assert.equal(calls[2][3].pitchSnap, "cMajor");
  assert.equal(calls[2][4], 0.5);
  assert.deepEqual(calls[3], ["vowel", "honk-honk-audio", "I"]);
  assert.equal(calls.some(([type]) => type === "release"), false);
  assert.equal(honk.activeVoiceIds.size, 0);
});

test("layer resolution caps overlapping sources and preserves looper volume", () => {
  const updates = [];
  const honk = new HonkInstrument({
    id: "honk-mix",
    root: object3D(),
    voiceService: {
      startVoice() {},
      updateVoice: (_id, performance) => updates.push({ ...performance }),
    },
    morphController: morphController(),
  });
  honk.setLivePerformance({ squeeze: 0 });
  honk.setAutomationLayer("looper-a", { squeeze: 1, nose: 0.8 }, { gain: 0.35 });
  honk.setAutomationLayer("metronome-a", { squeeze: 0.6 }, { gain: 1 });
  const resolved = honk.getResolvedPerformanceState();
  honk.updateResolvedAudioRenderer(resolved);
  assert.equal(updates.at(-1).squeeze, 0.6);
  assert.equal(updates.at(-1).nose, 0.8);
  honk.setLivePerformance({ squeeze: 1 });
  honk.updateResolvedAudioRenderer(honk.getResolvedPerformanceState());
  assert.equal(updates.at(-1).squeeze, 1);
});

function morphController() {
  return {
    resetAll() {},
    applyPerformanceState() {},
  };
}

function object3D() {
  return {
    userData: {},
    visible: true,
    position: tuple(0, 0, 0),
    quaternion: tuple(0, 0, 0, 1),
    rotation: tuple(0, 0, 0),
    scale: tuple(1, 1, 1),
    removeFromParent() {},
  };
}

function tuple(...values) {
  const keys = values.length === 4 ? ["x", "y", "z", "w"] : ["x", "y", "z"];
  const result = {};
  keys.forEach((key, index) => { result[key] = values[index]; });
  result.set = (...next) => keys.forEach((key, index) => { result[key] = next[index]; });
  result.setScalar = (next) => keys.slice(0, 3).forEach((key) => { result[key] = next; });
  return result;
}
