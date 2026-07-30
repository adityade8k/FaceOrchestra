import assert from "node:assert/strict";
import test from "node:test";

import { HonkVoiceService } from "../../src/audio/honk/HonkVoiceService.js";

test("release cancels a voice whose audio context is still starting", async () => {
  let finishAudioStart;
  const service = new HonkVoiceService({
    ensureAudio: () => new Promise((resolve) => { finishAudioStart = resolve; }),
    getDestination: () => null,
  });

  const starting = service.startVoice("pending-voice");
  assert.equal(service.startingVoices.has("pending-voice"), true);

  service.releaseVoice("pending-voice");
  finishAudioStart({});
  await starting;

  assert.equal(service.startingVoices.has("pending-voice"), false);
  assert.equal(service.voices.has("pending-voice"), false);
});

test("release accepts fade options without leaving a voice running", () => {
  const releases = [];
  const service = new HonkVoiceService({
    ensureAudio: async () => ({}),
    getDestination: () => null,
  });
  service.voices.set("played-voice", {
    release: (fadeSeconds) => releases.push(fadeSeconds),
  });

  service.releaseVoice("played-voice", { fadeSeconds: 0.03 });

  assert.deepEqual(releases, [0.03]);
  assert.equal(service.voices.has("played-voice"), false);
});

test("release uses the safe default for an empty options object", () => {
  const releases = [];
  const service = new HonkVoiceService({
    ensureAudio: async () => ({}),
    getDestination: () => null,
  });
  service.voices.set("played-voice", {
    release: (fadeSeconds) => releases.push(fadeSeconds),
  });

  service.releaseVoice("played-voice", {});

  assert.deepEqual(releases, [0.12]);
  assert.equal(service.voices.has("played-voice"), false);
});

test("retrigger silences the prior release tail for the same voice ID", async () => {
  let disconnectCount = 0;
  const service = new HonkVoiceService({
    ensureAudio: async () => ({
      currentTime: 0,
      destination: {},
      createOscillator: () => oscillatorNode(),
      createBiquadFilter: () => audioNode(),
      createGain: () => audioNode(),
    }),
    getDestination: (context) => context.destination,
  });
  service.voices.set("played-voice", {
    release() {},
    disconnect() { disconnectCount += 1; },
  });

  service.releaseVoice("played-voice");
  await service.startVoice("played-voice");

  assert.equal(disconnectCount, 1);
  assert.equal(service.releasingVoices.has("played-voice"), false);
  assert.equal(service.voices.has("played-voice"), true);
});

function audioNode() {
  return {
    connect() {},
    disconnect() {},
    gain: audioParam(),
    frequency: audioParam(),
    detune: audioParam(),
    Q: audioParam(),
  };
}

function oscillatorNode() {
  return { ...audioNode(), start() {}, stop() {} };
}

function audioParam() {
  return {
    value: 0,
    setValueAtTime() {},
    setTargetAtTime() {},
    exponentialRampToValueAtTime() {},
    cancelScheduledValues() {},
  };
}
