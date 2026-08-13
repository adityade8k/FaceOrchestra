import assert from "node:assert/strict";
import test from "node:test";

import { HONK_RELEASE_ORIGINS } from "../../../src/audio/honk/HonkReleaseProfile.js";
import { HonkInstrument } from "../../../src/instruments/honk/HonkInstrument.js";

test("honk owns stable live and automation audio voice routing", () => {
  const calls = [];
  const voiceService = {
    startVoice: (voiceId) => calls.push(["start", voiceId]),
    updateVoice: (voiceId, performance, tuning, options) =>
      calls.push(["update", voiceId, performance, tuning, options]),
    setVoiceVowel: (voiceId, vowel) => calls.push(["vowel", voiceId, vowel]),
    releaseVoice: (voiceId, options) => calls.push(["release", voiceId, options]),
  };
  const honk = new HonkInstrument({
    id: "honk-audio",
    root: object3D(),
    voiceService,
    morphController: morphController(),
    tuning: { pitchSnap: "cMajor" },
  });
  const voiceId = "right:instrument-honk-audio";

  honk.startAudioVoice(voiceId);
  honk.updateAudioVoice(voiceId, {
    squeeze: 0.8,
    bend: -0.25,
    earLeft: 0.2,
    earRight: -0.1,
    nose: 0.4,
    vowel: "O",
  }, { gain: 0.5 });
  honk.setAudioVowel("I");
  const releaseOptions = { origin: HONK_RELEASE_ORIGINS.controller };
  honk.releaseAudioVoice(voiceId, releaseOptions);

  assert.deepEqual(calls[0], ["start", voiceId]);
  assert.equal(calls[1][0], "update");
  assert.equal(calls[1][1], voiceId);
  assert.equal(calls[1][2].squeeze, 0.8);
  assert.equal(calls[1][3].pitchSnap, "cMajor");
  assert.deepEqual(calls[1][4], { gain: 0.5 });
  assert.deepEqual(calls[2], ["vowel", voiceId, "I"]);
  assert.deepEqual(calls[3], ["release", voiceId, releaseOptions]);
  assert.equal(honk.activeVoiceIds.size, 0);
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
