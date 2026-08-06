import test from "node:test";
import assert from "node:assert/strict";

import { MetronomePulseRuntimeMethods } from "../../../src/app/runtime/MetronomePulseRuntime.js";
import { HONK_MASTER_GAIN } from "../../../src/config/audio.js";

test("a connected Honk receives exactly one logical pulse per due beat", () => {
  const context = createPulseContext();
  context.timing.lastEmittedBeatOrdinal = 0;
  context.updateMetronomeHonkPulse(context.connection, 1000);
  context.updateMetronomeHonkPulse(context.connection, 1000);
  context.updateMetronomeHonkPulse(context.connection, 1010);
  assert.equal(context.honk.started.length, 1);
  const layer = context.honk.layers.get(context.getMetronomePulseLayerId(context.connection));
  assert.deepEqual(layer, { performance: { squeeze: 1 }, options: { gain: HONK_MASTER_GAIN } });

  context.timing.lastEmittedBeatOrdinal = 1;
  context.updateMetronomeHonkPulse(context.connection, 1500);
  assert.equal(context.honk.started.length, 2);
  assert.equal(context.honk.released.length, 1);
});

test("a metronome pulse never expands into the touching Honk chain", () => {
  const context = createPulseContext();
  const neighbor = createHonk("honk-b");
  context.getTouchingInstrumentChain = () => [context.honk, neighbor];
  context.timing.lastEmittedBeatOrdinal = 0;
  context.updateMetronomeHonkPulse(context.connection, 1000);
  assert.equal(context.honk.layers.size, 1);
  assert.equal(neighbor.layers.size, 0);
  assert.equal(neighbor.started.length, 0);
});

test("a stalled frame emits only the current beat instead of a catch-up burst", () => {
  const context = createPulseContext();
  context.timing.lastEmittedBeatOrdinal = 0;
  context.updateMetronomeHonkPulse(context.connection, 1000);
  context.timing.lastEmittedBeatOrdinal = 47;
  context.updateMetronomeHonkPulse(context.connection, 24500);
  assert.equal(context.honk.started.length, 2);
  assert.equal(context.metronomePulseStates.get("metro-a:port-2").lastBeatOrdinal, 47);
});

test("pause, BPM-relative gate expiry, and disconnect release only the direct layer", () => {
  const context = createPulseContext();
  context.timing.lastEmittedBeatOrdinal = 0;
  context.updateMetronomeHonkPulse(context.connection, 1000);
  const state = context.metronomePulseStates.get("metro-a:port-2");
  assert.equal(state.releaseAtMs, 1120);
  context.updateMetronomeHonkPulse(context.connection, 1120);
  assert.equal(context.honk.released.length, 1);

  context.timing.lastEmittedBeatOrdinal = 1;
  context.updateMetronomeHonkPulse(context.connection, 1500);
  context.timing.active = false;
  context.updateMetronomeHonkPulse(context.connection, 1510);
  assert.equal(context.honk.released.length, 2);
  assert.equal(context.honk.layers.size, 0);
});

function createPulseContext() {
  const timing = { active: true, beatIntervalMs: 500, lastEmittedBeatOrdinal: null };
  const honk = createHonk("honk-a");
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
      honk: null,
      lastBeatOrdinal: null,
      releaseAtMs: 0,
    }]]),
    metronomeConnectionManager: { getConnectionsForMetronome: () => [connection] },
  }, MetronomePulseRuntimeMethods);
}

function createHonk(id) {
  return {
    id,
    layers: new Map(),
    started: [],
    released: [],
    isPlayable: () => true,
    setAutomationLayer(layerId, performance, options) {
      this.layers.set(layerId, { performance: { ...performance }, options: { ...options } });
    },
    clearAutomationLayer(layerId) { this.layers.delete(layerId); },
    startAudioVoice(voiceId) { this.started.push(voiceId); },
    releaseAudioVoice(voiceId, options) { this.released.push({ voiceId, options }); },
  };
}
