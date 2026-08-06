import test from "node:test";
import assert from "node:assert/strict";

import { MetronomePulseRuntimeMethods } from "../../../src/app/runtime/MetronomePulseRuntime.js";

test("a connected Honk receives one stable-ID pulse per current due beat", async () => {
  const context = createPulseContext();
  const { connection, timing, honk } = context;
  timing.lastEmittedBeatOrdinal = 0;
  context.updateMetronomeHonkPulse(connection, 1000);
  await Promise.resolve();

  assert.deepEqual(honk.started, [
    "metronome-metro-a:port-port-2:honk-honk-a",
  ]);
  assert.equal(honk.updated.at(-1).performance.squeeze, 1);
  assert.equal(honk.updated.at(-1).performance.nose, 0.6);
  assert.deepEqual(honk.layers.get(context.getMetronomePulseLayerId(connection)), {
    squeeze: 1,
  });

  context.updateMetronomeHonkPulse(connection, 1010);
  assert.equal(honk.started.length, 1);

  timing.lastEmittedBeatOrdinal = 1;
  context.updateMetronomeHonkPulse(connection, 1500);
  assert.equal(honk.started.length, 2);
  assert.equal(honk.released.length, 1);
});

test("a beat pulse squeezes the wired Honk and dynamically joins its touching chord", () => {
  const context = createPulseContext();
  const neighbor = createHonk("honk-b", {
    squeeze: 0,
    earLeft: 0.1,
    earRight: -0.2,
    nose: 0.4,
    bend: -0.1,
    vowel: "E",
  });
  let chain = [context.honk];
  context.getTouchingInstrumentChain = () => chain;
  context.timing.lastEmittedBeatOrdinal = 0;
  context.updateMetronomeHonkPulse(context.connection, 1000);

  chain = [context.honk, neighbor];
  context.updateMetronomeHonkPulse(context.connection, 1010);
  const layerId = context.getMetronomePulseLayerId(context.connection);
  assert.deepEqual(context.honk.layers.get(layerId), { squeeze: 1 });
  assert.deepEqual(neighbor.layers.get(layerId), { squeeze: 1, bend: 0.3 });
  assert.deepEqual(neighbor.started, [
    "metronome-metro-a:port-port-2:honk-honk-a:chord-honk-b",
  ]);
  assert.equal(neighbor.updated.at(-1).performance.squeeze, 1);
  assert.ok(Math.abs(neighbor.updated.at(-1).performance.bend - 0.2) < 1e-12);

  context.releaseMetronomePulse(context.connection);
  assert.equal(context.honk.layers.has(layerId), false);
  assert.equal(neighbor.layers.has(layerId), false);
  assert.equal(neighbor.released.length, 1);
});

test("a missed frame emits only the current beat instead of a catch-up burst", () => {
  const context = createPulseContext();
  context.timing.lastEmittedBeatOrdinal = 0;
  context.updateMetronomeHonkPulse(context.connection, 1000);
  context.timing.lastEmittedBeatOrdinal = 47;
  context.updateMetronomeHonkPulse(context.connection, 24500);

  assert.equal(context.honk.started.length, 2);
  assert.equal(context.metronomePulseStates.get("metro-a:port-2").lastBeatOrdinal, 47);
});

test("pause, gate expiry, and disconnect release the pulse immediately", () => {
  const context = createPulseContext();
  context.timing.lastEmittedBeatOrdinal = 0;
  context.updateMetronomeHonkPulse(context.connection, 1000);
  context.updateMetronomeHonkPulse(context.connection, 1200);
  assert.equal(context.honk.released.length, 1);

  context.timing.lastEmittedBeatOrdinal = 1;
  context.updateMetronomeHonkPulse(context.connection, 1500);
  context.timing.active = false;
  context.updateMetronomeHonkPulse(context.connection, 1510);
  assert.equal(context.honk.released.length, 2);

  context.timing.active = true;
  context.timing.lastEmittedBeatOrdinal = 2;
  context.updateMetronomeHonkPulse(context.connection, 2000);
  context.releaseMetronomePulse(context.connection);
  assert.equal(context.honk.released.length, 3);
});

test("an asynchronous voice start cannot survive a released pulse generation", async () => {
  let resolveStart;
  const context = createPulseContext({
    startPromise: new Promise((resolve) => { resolveStart = resolve; }),
  });
  context.timing.lastEmittedBeatOrdinal = 0;
  context.updateMetronomeHonkPulse(context.connection, 1000);
  context.releaseMetronomePulse(context.connection);
  resolveStart();
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(context.metronomePulseStates.get("metro-a:port-2").active, false);
  assert.ok(context.honk.released.length >= 1);
});

test("completion of an old async start cannot release a newer pulse generation", async () => {
  const pendingStarts = [];
  const context = createPulseContext();
  context.honk.startAudioVoice = function startAudioVoice(voiceId) {
    this.started.push(voiceId);
    return new Promise((resolve) => pendingStarts.push(resolve));
  };
  context.timing.lastEmittedBeatOrdinal = 0;
  context.updateMetronomeHonkPulse(context.connection, 1000);
  context.timing.lastEmittedBeatOrdinal = 1;
  context.updateMetronomeHonkPulse(context.connection, 1500);
  assert.equal(context.honk.released.length, 1);

  pendingStarts[0]();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(context.honk.released.length, 1);
  assert.equal(context.metronomePulseStates.get("metro-a:port-2").active, true);

  pendingStarts[1]();
});

function createPulseContext({ startPromise = Promise.resolve() } = {}) {
  const timing = {
    active: true,
    beatIntervalMs: 500,
    lastEmittedBeatOrdinal: null,
  };
  const honk = createHonk("honk-a", {
    squeeze: 0.2,
    earLeft: -0.4,
    earRight: 0.25,
    nose: 0.6,
    bend: 0.3,
    vowel: "O",
  }, startPromise);
  const metronome = { getBeatTiming: () => ({ ...timing }) };
  const instruments = new Map([["metro-a", metronome], ["honk-a", honk]]);
  const connection = {
    metronomeId: "metro-a",
    portId: "port-2",
    targetKind: "honk",
    targetId: "honk-a",
    targetPortId: "honk.looper-connector",
  };
  return Object.assign({
    connection,
    timing,
    honk,
    instrumentRegistry: { get: (id) => instruments.get(id) || null },
    metronomePulseStates: new Map([["metro-a:port-2", {
      active: false,
      generation: 0,
      members: new Map(),
      lastBeatOrdinal: null,
      releaseAtMs: 0,
    }]]),
    metronomeConnectionManager: { getConnectionsForMetronome: () => [connection] },
  }, MetronomePulseRuntimeMethods);
}

function createHonk(id, basePerformance, startPromise = Promise.resolve()) {
  return {
    id,
    basePerformance: { ...basePerformance },
    layers: new Map(),
    started: [],
    updated: [],
    released: [],
    isPlayable: () => true,
    getResolvedPerformanceState() {
      const resolved = { ...this.basePerformance };
      for (const layer of this.layers.values()) {
        if (layer.squeeze !== undefined) {
          resolved.squeeze = Math.max(resolved.squeeze || 0, layer.squeeze);
        }
        if (layer.bend !== undefined) resolved.bend = (resolved.bend || 0) + layer.bend;
      }
      return resolved;
    },
    setAutomationLayer(layerId, performance) {
      this.layers.set(layerId, { ...performance });
    },
    clearAutomationLayer(layerId) {
      this.layers.delete(layerId);
    },
    startAudioVoice(voiceId) {
      this.started.push(voiceId);
      return startPromise;
    },
    updateAudioVoice(voiceId, performance, options) {
      this.updated.push({ voiceId, performance, options });
    },
    releaseAudioVoice(voiceId, options) {
      this.released.push({ voiceId, options });
    },
  };
}
