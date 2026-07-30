import assert from "node:assert/strict";
import test from "node:test";

import { HonkVoiceService } from "../../src/audio/honk/HonkVoiceService.js";
import { HONK_RELEASE_SETTINGS } from "../../src/config/audio.js";

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

test("release accepts fade options without leaving a voice active", () => {
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
  assert.equal(service.releasingVoices.get("played-voice").size, 1);
});

test("release uses the configured live fade for an empty options object", () => {
  const releases = [];
  const service = new HonkVoiceService({
    ensureAudio: async () => ({}),
    getDestination: () => null,
  });
  service.voices.set("played-voice", {
    release: (fadeSeconds) => releases.push(fadeSeconds),
  });

  service.releaseVoice("played-voice", {});

  assert.deepEqual(releases, [HONK_RELEASE_SETTINGS.liveFadeSeconds]);
  assert.equal(service.voices.has("played-voice"), false);
});

test("retrigger leaves the prior release generation connected while a new voice becomes active", async () => {
  const { service, createdVoices } = createServiceWithControllableVoices();

  await service.startVoice("played-voice");
  const priorVoice = createdVoices[0];
  service.releaseVoice("played-voice");
  await service.startVoice("played-voice");
  const currentVoice = createdVoices[1];

  assert.equal(priorVoice.disconnectCount, 0);
  assert.equal(service.releasingVoices.get("played-voice").has(priorVoice), true);
  assert.equal(service.voices.get("played-voice"), currentVoice);
  assert.equal(priorVoice.releaseCalls.length, 1);
});

test("an old completion cannot remove newer active or releasing generations", async () => {
  const { service, createdVoices } = createServiceWithControllableVoices();

  await service.startVoice("played-voice");
  service.releaseVoice("played-voice");
  const oldestVoice = createdVoices[0];

  await service.startVoice("played-voice");
  service.releaseVoice("played-voice");
  const newerRelease = createdVoices[1];

  await service.startVoice("played-voice");
  const currentVoice = createdVoices[2];
  oldestVoice.finishRelease();

  assert.equal(service.voices.get("played-voice"), currentVoice);
  assert.deepEqual(
    [...service.releasingVoices.get("played-voice")],
    [newerRelease],
  );

  newerRelease.finishRelease();
  assert.equal(service.voices.get("played-voice"), currentVoice);
  assert.equal(service.releasingVoices.has("played-voice"), false);
});

test("multiple rapid retriggers clean up every independent release generation", async () => {
  const { service, createdVoices } = createServiceWithControllableVoices();

  for (let generation = 0; generation < 5; generation += 1) {
    await service.startVoice("played-voice");
    service.releaseVoice("played-voice", { fadeSeconds: 0.035 });
  }

  assert.equal(service.voices.has("played-voice"), false);
  assert.equal(service.releasingVoices.get("played-voice").size, 5);

  for (const voice of [...createdVoices].reverse()) {
    voice.finishRelease();
  }

  assert.equal(service.voices.size, 0);
  assert.equal(service.releasingVoices.size, 0);
  assert.equal(service.startingVoices.size, 0);
});

test("releaseAll releases active voices without hard-disconnecting existing tails", async () => {
  const { service, createdVoices } = createServiceWithControllableVoices();

  await service.startVoice("played-voice");
  service.releaseVoice("played-voice");
  const priorTail = createdVoices[0];

  await service.startVoice("other-voice");
  const activeVoice = createdVoices[1];
  service.releaseAll();

  assert.equal(priorTail.releaseCalls.length, 1);
  assert.equal(priorTail.disconnectCount, 0);
  assert.equal(activeVoice.releaseCalls.length, 1);
  assert.equal(activeVoice.disconnectCount, 0);
  assert.equal(service.voices.size, 0);
  assert.equal(service.releasingVoices.get("played-voice").has(priorTail), true);
  assert.equal(service.releasingVoices.get("other-voice").has(activeVoice), true);

  priorTail.finishRelease();
  activeVoice.finishRelease();
  assert.equal(service.releasingVoices.size, 0);
});

test("releaseAll safely cancels pending asynchronous voice starts", async () => {
  let finishAudioStart;
  let createCount = 0;
  const service = new HonkVoiceService({
    ensureAudio: () => new Promise((resolve) => { finishAudioStart = resolve; }),
    getDestination: () => null,
    createVoice: () => {
      createCount += 1;
      return createControllableVoice();
    },
  });

  const starting = service.startVoice("pending-voice");
  service.releaseAll();
  finishAudioStart({});
  await starting;

  assert.equal(createCount, 0);
  assert.equal(service.startTokens.size, 0);
  assert.equal(service.startingVoices.size, 0);
  assert.equal(service.voices.size, 0);
  assert.equal(service.releasingVoices.size, 0);
});

function createServiceWithControllableVoices() {
  const createdVoices = [];
  const service = new HonkVoiceService({
    ensureAudio: async () => ({ destination: {} }),
    getDestination: (context) => context.destination,
    createVoice: () => {
      const voice = createControllableVoice();
      createdVoices.push(voice);
      return voice;
    },
  });
  return { service, createdVoices };
}

function createControllableVoice() {
  return {
    startCount: 0,
    disconnectCount: 0,
    releaseCalls: [],
    releaseCompletion: null,
    start() {
      this.startCount += 1;
    },
    release(fadeSeconds, onEnded) {
      this.releaseCalls.push(fadeSeconds);
      this.releaseCompletion = onEnded;
    },
    finishRelease() {
      this.releaseCompletion?.();
    },
    disconnect() {
      this.disconnectCount += 1;
    },
  };
}
