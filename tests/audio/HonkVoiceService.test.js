import assert from "node:assert/strict";
import test from "node:test";

import { HonkVoiceService } from "../../src/audio/honk/HonkVoiceService.js";

test("release and rapid retrigger keep one persistent renderer", async () => {
  const { service, createdVoices } = createService();
  await service.startVoice("honk-a");
  for (let generation = 0; generation < 8; generation += 1) {
    service.releaseVoice("honk-a", { fadeSeconds: 0.01 });
    await service.startVoice("honk-a");
  }
  assert.equal(createdVoices.length, 1);
  assert.equal(service.voices.size, 1);
  assert.equal(createdVoices[0].silenceCalls.length, 8);
  assert.equal("releasingVoices" in service, false);
  assert.equal(service.getRendererStats().totalRenderers, 1);
});

test("overlapping live, looper, and metronome updates do not multiply a Honk graph", async () => {
  const { service, createdVoices } = createService();
  await Promise.all([
    service.startVoice("honk-a"),
    service.startVoice("honk-a"),
    service.startVoice("honk-a"),
  ]);
  service.updateVoice("honk-a", performance(1));
  service.updateVoice("honk-a", performance(0.5));
  service.updateVoice("honk-a", performance(0.8));
  assert.equal(createdVoices.length, 1);
  assert.equal(createdVoices[0].updates.length, 3);
});

test("renderer count is bounded by physical Honk count", async () => {
  const { service, createdVoices } = createService();
  await Promise.all(Array.from({ length: 6 }, (_, index) => service.startVoice(`honk-${index}`)));
  assert.equal(createdVoices.length, 6);
  assert.equal(service.getRendererStats().totalRenderers, 6);
  service.releaseAll();
  assert.equal(service.voices.size, 6);
  assert.equal(createdVoices.every((voice) => voice.silenceCalls.length === 1), true);
});

test("dispose cancels a pending renderer start", async () => {
  let finishAudioStart;
  let createCount = 0;
  const service = new HonkVoiceService({
    ensureAudio: () => new Promise((resolve) => { finishAudioStart = resolve; }),
    getDestination: () => null,
    createVoice: () => { createCount += 1; return controllableVoice(); },
  });
  const starting = service.startVoice("honk-pending");
  service.disposeVoice("honk-pending");
  finishAudioStart({});
  await starting;
  assert.equal(createCount, 0);
  assert.equal(service.getRendererStats().totalRenderers, 0);
});

test("dispose is the only operation that destroys a renderer", async () => {
  const { service, createdVoices } = createService();
  await service.startVoice("honk-a");
  service.releaseVoice("honk-a");
  assert.equal(createdVoices[0].disposeCount, 0);
  service.disposeVoice("honk-a");
  assert.equal(createdVoices[0].disposeCount, 1);
  assert.equal(service.voices.size, 0);
});

function createService() {
  const createdVoices = [];
  const service = new HonkVoiceService({
    ensureAudio: async () => ({ destination: {} }),
    getDestination: (context) => context.destination,
    createVoice: () => {
      const voice = controllableVoice();
      createdVoices.push(voice);
      return voice;
    },
  });
  return { service, createdVoices };
}

function controllableVoice() {
  return {
    startCount: 0,
    silenceCalls: [],
    updates: [],
    disposeCount: 0,
    start() { this.startCount += 1; },
    silence(seconds) { this.silenceCalls.push(seconds); },
    update(values) { this.updates.push({ ...values }); },
    setVowel() {},
    setPitchBend() {},
    dispose() { this.disposeCount += 1; },
  };
}

function performance(hornAmount) {
  return { hornAmount, masterGain: 1, leftEar: 0, rightEar: 0, noteGain: 1, vowel: "A" };
}
