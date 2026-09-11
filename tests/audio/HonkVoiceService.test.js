import assert from "node:assert/strict";
import test from "node:test";

import { HonkVoiceService } from "../../src/audio/honk/HonkVoiceService.js";
import { HONK_RELEASE_ORIGINS } from "../../src/audio/honk/HonkReleaseProfile.js";
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

test("automation fade options preserve the default release profile", () => {
  const releases = [];
  const service = new HonkVoiceService({
    ensureAudio: async () => ({}),
    getDestination: () => null,
  });
  service.voices.set("played-voice", {
    release: (fadeSeconds, _onEnded, options) => releases.push({ fadeSeconds, options }),
  });

  service.releaseVoice("played-voice", { fadeSeconds: 0.03 });

  assert.deepEqual(releases, [{
    fadeSeconds: 0.03,
    options: { fadeSeconds: 0.03 },
  }]);
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

test("controller origin and live fade propagate to the voice release", () => {
  const releases = [];
  const service = new HonkVoiceService({
    ensureAudio: async () => ({}),
    getDestination: () => null,
  });
  service.voices.set("controller-voice", {
    release: (fadeSeconds, _onEnded, options) => releases.push({ fadeSeconds, options }),
  });

  service.releaseVoice("controller-voice", {
    origin: HONK_RELEASE_ORIGINS.controller,
  });

  assert.deepEqual(releases, [{
    fadeSeconds: HONK_RELEASE_SETTINGS.liveFadeSeconds,
    options: {
      origin: HONK_RELEASE_ORIGINS.controller,
      fadeSeconds: HONK_RELEASE_SETTINGS.liveFadeSeconds,
    },
  }]);
});

test("controller release safely cancels a pending asynchronous voice start", async () => {
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

  const starting = service.startVoice("pending-controller-voice");
  service.releaseVoice("pending-controller-voice", {
    origin: HONK_RELEASE_ORIGINS.controller,
  });
  finishAudioStart({});
  await starting;

  assert.equal(createCount, 0);
  assert.equal(service.startTokens.size, 0);
  assert.equal(service.startingVoices.size, 0);
  assert.equal(service.voices.size, 0);
});

test("scheduled short notes retain their initial state while audio is starting", async () => {
  let finishAudioStart;
  const calls = [];
  const service = new HonkVoiceService({
    ensureAudio: () => new Promise((resolve) => { finishAudioStart = resolve; }),
    getDestination: () => null,
    createVoice: () => ({
      start: (time) => calls.push(["start", time]),
      setVowel: (vowel) => calls.push(["vowel", vowel]),
      update: (state, options) => calls.push(["update", state.hornAmount, options.scheduledTime]),
      release: (fadeSeconds, _onEnded, options) => calls.push([
        "release",
        fadeSeconds,
        options.scheduledTime,
        options.origin,
      ]),
    }),
  });

  const starting = service.startVoice("short", { scheduledTime: 5 });
  service.updateVoice("short", { vowel: "E", hornAmount: 0.7 }, { scheduledTime: 5 });
  service.releaseVoice("short", {
    scheduledTime: 5.02,
    origin: HONK_RELEASE_ORIGINS.controller,
  });
  finishAudioStart({});
  await starting;

  assert.deepEqual(calls, [
    ["start", 5],
    ["vowel", "E"],
    ["update", 0.7, 5],
    ["release", HONK_RELEASE_SETTINGS.liveFadeSeconds, 5.02, HONK_RELEASE_ORIGINS.controller],
  ]);
});

test("retrigger leaves the prior release generation connected while a new voice becomes active", async () => {
  const { service, createdVoices } = createServiceWithControllableVoices();

  await service.startVoice("played-voice");
  const priorVoice = createdVoices[0];
  service.releaseVoice("played-voice", { origin: HONK_RELEASE_ORIGINS.controller });
  await service.startVoice("played-voice");
  const currentVoice = createdVoices[1];

  assert.equal(priorVoice.disconnectCount, 0);
  assert.equal(service.releasingVoices.get("played-voice").has(priorVoice), true);
  assert.equal(service.voices.get("played-voice"), currentVoice);
  assert.equal(priorVoice.releaseCalls.length, 1);
  assert.deepEqual(priorVoice.releaseCalls[0], {
    fadeSeconds: HONK_RELEASE_SETTINGS.liveFadeSeconds,
    options: {
      origin: HONK_RELEASE_ORIGINS.controller,
      fadeSeconds: HONK_RELEASE_SETTINGS.liveFadeSeconds,
    },
  });
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

test("target cancellation invalidates pending starts and fades every releasing generation", async () => {
  let finishAudioStart;
  let pendingCreateCount = 0;
  const pendingService = new HonkVoiceService({
    ensureAudio: () => new Promise((resolve) => { finishAudioStart = resolve; }),
    getDestination: () => null,
    createVoice: () => {
      pendingCreateCount += 1;
      return createControllableVoice();
    },
  });
  const pendingStart = pendingService.startVoice("departing");
  pendingService.updateVoice("departing", { hornAmount: 1 }, { scheduledTime: 5 });
  pendingService.cancelVoice("departing", { fadeSeconds: 0.035 });
  finishAudioStart({});
  await pendingStart;
  assert.equal(pendingCreateCount, 0);
  assert.equal(pendingService.startTokens.size, 0);

  const { service, createdVoices } = createServiceWithControllableVoices();
  await service.startVoice("departing");
  service.releaseVoice("departing", { scheduledTime: 5 });
  await service.startVoice("departing");
  service.cancelVoice("departing", { fadeSeconds: 0.035 });

  assert.deepEqual(createdVoices.map((voice) => voice.cancelCalls), [
    [{ fadeSeconds: 0.035 }],
    [{ fadeSeconds: 0.035 }],
  ]);
  assert.equal(service.voices.has("departing"), false);
  assert.equal(service.releasingVoices.has("departing"), false);
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
    cancelCalls: [],
    releaseCalls: [],
    releaseCompletion: null,
    start() {
      this.startCount += 1;
    },
    release(fadeSeconds, onEnded, options) {
      this.releaseCalls.push({ fadeSeconds, options });
      this.releaseCompletion = onEnded;
    },
    finishRelease() {
      this.releaseCompletion?.();
    },
    cancel(options) {
      this.cancelCalls.push(options);
    },
    disconnect() {
      this.disconnectCount += 1;
    },
  };
}

test('future vowel repeats coalesce while projected A-E-A changes and cancellation survive', async (t) => {
  const pending = new Map();
  let nextId = 0;
  t.mock.method(globalThis, 'setTimeout', (callback, delay) => {
    const id = ++nextId;
    pending.set(id, { callback, delay });
    return id;
  });
  t.mock.method(globalThis, 'clearTimeout', (id) => pending.delete(id));
  const heard = [];
  const context = { currentTime: 0 };
  const voice = { context, vowel: 'A', start() {}, update() {}, cancel() {}, setVowel(v) { heard.push(v); } };
  const service = new HonkVoiceService({ ensureAudio: async () => context, getDestination() {}, createVoice: () => voice });
  await service.startVoice('v');
  for (let i = 0; i < 90; i += 1) service.updateVoice('v', { vowel: 'A' }, { scheduledTime: 1 + i / 90 });
  assert.equal(pending.size, 0);
  service.updateVoice('v', { vowel: 'E' }, { scheduledTime: 2 });
  service.updateVoice('v', { vowel: 'A' }, { scheduledTime: 3 });
  service.updateVoice('v', { vowel: 'A' }, { scheduledTime: 3.1 });
  assert.deepEqual([...pending.values()].map(({ delay }) => delay), [2000, 3000]);
  for (const [id, { callback, delay }] of [...pending]) {
    context.currentTime = delay / 1000;
    pending.delete(id);
    callback();
  }
  assert.deepEqual(heard, ['E', 'A']);
  service.updateVoice('v', { vowel: 'E' }, { scheduledTime: 4 });
  service.cancelVoice('v');
  assert.equal(pending.size, 0);
  assert.equal(service.vowelSchedules.size, 0);
});

test('out-of-order vowel insertion preserves a formerly redundant future return', (t) => {
  const pending = new Map();
  let id = 0;
  t.mock.method(globalThis, 'setTimeout', (callback, delay) => { pending.set(++id, { callback, delay }); return id; });
  t.mock.method(globalThis, 'clearTimeout', (key) => pending.delete(key));
  const service = new HonkVoiceService({ ensureAudio() {}, getDestination() {} });
  const voice = { context: { currentTime: 0 }, vowel: 'A' };
  service.scheduleVoiceVowel(voice, 'A', 3);
  service.scheduleVoiceVowel(voice, 'E', 2);
  assert.deepEqual([...pending.values()].map(({ delay }) => delay), [2000, 3000]);
  service.clearVoiceVowels(voice);
  assert.equal(pending.size, 0);
});
