import assert from "node:assert/strict";
import test from "node:test";

import { INSTRUMENT_KINDS } from "../../../src/instruments/core/capabilities.js";
import { InstrumentEntity } from "../../../src/instruments/core/InstrumentEntity.js";
import {
  INSTRUMENT_LIFECYCLE_EVENTS,
  InstrumentLifecycleService,
} from "../../../src/instruments/core/InstrumentLifecycleService.js";
import { InstrumentRegistry } from "../../../src/instruments/core/InstrumentRegistry.js";
import { ChordFormationService } from "../../../src/instruments/formations/ChordFormationService.js";
import { HonkContactGraph } from "../../../src/instruments/formations/HonkContactGraph.js";
import { HonkContactSystem } from "../../../src/instruments/formations/HonkContactSystem.js";
import { HonkLockService } from "../../../src/instruments/formations/HonkLockService.js";
import { HonkInstrument } from "../../../src/instruments/honk/HonkInstrument.js";

test("deleting a honk clears audio, contact state, locks, looper connections, and the registry", () => {
  const registry = new InstrumentRegistry();
  const voiceEvents = { started: [], released: [] };
  const honkA = createHonk("honk-a", 0, voiceEvents);
  const honkB = createHonk("honk-b", 2, voiceEvents);
  registry.add(honkA);
  registry.add(honkB);

  const graph = new HonkContactGraph();
  const contactSystem = new HonkContactSystem({
    graph,
    measurePair: () => true,
    settings: { consecutiveEntryFrames: 1, consecutiveExitFrames: 1 },
  });
  contactSystem.update([honkA, honkB]);
  const formations = new ChordFormationService({ contactGraph: graph });
  const locks = new HonkLockService({
    instrumentRegistry: registry,
    formationService: formations,
    idFactory: () => "lock-a-b",
  });
  locks.lockFormation(honkA.id);

  const looperHarness = createLooperHarness(registry, "looper-a");
  registry.add(looperHarness.looper);
  const track = looperHarness.looper.connectTrack(0, honkA.id);
  honkA.beginSqueeze("controller-left", 0.8);

  const externallyReleased = [];
  const lifecycle = new InstrumentLifecycleService({
    instrumentRegistry: registry,
    contactSystem,
    lockService: locks,
    releaseInstrumentAudio: (honk) => externallyReleased.push(honk.id),
  });
  const result = lifecycle.deleteInstrument(honkA.id, { reason: "delete-button" });

  assert.equal(result.instrumentId, honkA.id);
  assert.deepEqual(result.cleanup.disconnectedLooperIds, [looperHarness.looper.id]);
  assert.equal(result.cleanup.removedFromContactGraph, true);
  assert.equal(result.cleanup.removedFromLockGroup, true);
  assert.equal(result.cleanup.releasedAudio, true);
  assert.deepEqual(externallyReleased, [honkA.id]);
  assert.deepEqual(voiceEvents.released, [`honk-${honkA.id}`]);
  assert.equal(graph.hasHonk(honkA.id), false);
  assert.equal(contactSystem.pairStates.size, 0);
  assert.equal(locks.getGroupForMember(honkB.id), null);
  assert.equal(track.connectedHonkId, null);
  assert.equal(track.wireMesh, null);
  assert.deepEqual(looperHarness.disposedWires, [looperHarness.wire]);
  assert.equal(registry.get(honkA.id), null);
  assert.equal(honkA.disposed, true);
});

test("deleting a looper releases automation, action voices, wires, transport, and controller state", () => {
  const registry = new InstrumentRegistry();
  const honk = createHonk("honk-target", 0);
  registry.add(honk);
  const harness = createLooperHarness(registry, "looper-delete");
  registry.add(harness.looper);
  const track = harness.looper.connectTrack(0, honk.id);
  const data = harness.looper.looperData;

  harness.looper.applyAutomation(track, { squeeze: 0.9, bend: 0.2, vowel: "A" });
  assert.equal(harness.startedActionVoices.length, 1);

  const lifecycle = new InstrumentLifecycleService({ instrumentRegistry: registry });
  const result = lifecycle.deleteInstrument(harness.looper.id);

  assert.equal(result.kind, INSTRUMENT_KINDS.looper);
  assert.equal(registry.get(harness.looper.id), null);
  assert.equal(harness.looper.disposed, true);
  assert.equal(harness.looper.looperData, null);
  assert.equal(data.transport.recording, false);
  assert.equal(data.transport.playing, false);
  assert.equal(data.transport.paused, false);
  assert.equal(track.connectedHonkId, null);
  assert.equal(track.wireMesh, null);
  assert.equal(harness.looper.controllerReleaseCount, 1);
  assert.equal(harness.clearedAutomationLayers.length, 1);
  assert.deepEqual(harness.releasedActionVoices, harness.startedActionVoices);
  assert.deepEqual(harness.disposedWires, [harness.wire]);
});

test("a directly disposed instrument can still be removed from the registry exactly once", () => {
  const registry = new InstrumentRegistry();
  const instrument = new InstrumentEntity({
    id: "disposed-honk",
    kind: INSTRUMENT_KINDS.honk,
    root: object3D(),
  });
  let disposeCount = 0;
  instrument.addDisposeHandler(() => { disposeCount += 1; });
  registry.add(instrument);
  instrument.dispose();

  const lifecycle = new InstrumentLifecycleService({ instrumentRegistry: registry });
  const result = lifecycle.deleteInstrument(instrument.id);

  assert.equal(result.wasAlreadyDisposed, true);
  assert.equal(registry.has(instrument.id), false);
  assert.equal(disposeCount, 1);
  assert.equal(lifecycle.deleteInstrument(instrument.id), null);
});

test("session reset deletes entities and invokes every injected transient-state reset contract", () => {
  const registry = new InstrumentRegistry();
  const looper = createEntity("reset-looper", INSTRUMENT_KINDS.looper);
  const stick = createEntity("reset-stick", INSTRUMENT_KINDS.stick);
  const honk = createEntity("reset-honk", INSTRUMENT_KINDS.honk);
  registry.add(looper);
  registry.add(stick);
  registry.add(honk);

  const calls = [];
  const events = [];
  const lifecycle = new InstrumentLifecycleService({
    instrumentRegistry: registry,
    contactSystem: {
      removeHonk(id) { calls.push(`contact.remove:${id}`); return true; },
      reset() { calls.push("contact.reset"); },
    },
    lockService: {
      getGroupForMember: () => ({ id: "transient-lock" }),
      removeMember(id) { calls.push(`lock.remove:${id}`); return null; },
      reset({ reason }) { calls.push(`lock.reset:${reason}`); },
    },
    stickEquipmentSystem: {
      unequip(entry) { calls.push(`equipment.unequip:${entry.id}`); return entry; },
      reset() { calls.push("equipment.reset"); },
    },
    releaseInstrumentAudio(entry) { calls.push(`audio.release:${entry.id}`); },
    resetAudio({ reason }) { calls.push(`audio.reset:${reason}`); },
    sessionResetters: [
      ({ reason }) => calls.push(`function.reset:${reason}`),
      { reset: ({ deletedInstrumentIds }) => calls.push(`object.reset:${deletedInstrumentIds.join(",")}`) },
    ],
  });
  lifecycle.subscribe((event) => events.push(event.type));

  const result = lifecycle.resetSession({ reason: "xr-session-ended" });

  assert.equal(result.deletedCount, 3);
  assert.deepEqual(result.deletedInstrumentIds, [honk.id, stick.id, looper.id]);
  assert.equal(registry.size, 0);
  assert.equal(honk.disposed && stick.disposed && looper.disposed, true);
  assert.deepEqual(calls, [
    `contact.remove:${honk.id}`,
    `lock.remove:${honk.id}`,
    `audio.release:${honk.id}`,
    `equipment.unequip:${stick.id}`,
    "contact.reset",
    "lock.reset:xr-session-ended",
    "equipment.reset",
    "audio.reset:xr-session-ended",
    "function.reset:xr-session-ended",
    `object.reset:${honk.id},${stick.id},${looper.id}`,
  ]);
  assert.equal(events[0], INSTRUMENT_LIFECYCLE_EVENTS.sessionResetting);
  assert.equal(events.at(-1), INSTRUMENT_LIFECYCLE_EVENTS.sessionReset);
});

function createHonk(id, x, voiceEvents = { started: [], released: [] }) {
  return new HonkInstrument({
    id,
    root: object3D(x),
    morphController: {
      resetAll() {},
      applyPerformanceState() {},
    },
    voiceService: {
      startVoice(voiceId) { voiceEvents.started.push(voiceId); },
      releaseVoice(voiceId) { voiceEvents.released.push(voiceId); },
      disposeVoice() {},
    },
  });
}

function createLooperHarness(registry, id) {
  const wire = { id: `${id}-wire` };
  const disposedWires = [];
  const startedActionVoices = [];
  const releasedActionVoices = [];
  const clearedAutomationLayers = [];
  const looper = new ResourceOwningLooper({
    id,
    root: object3D(),
    hooks: {
      disposeWire: (mesh) => disposedWires.push(mesh),
      clearAutomation: (honkId, layerId) => clearedAutomationLayers.push({ honkId, layerId }),
      startActionVoice: (voiceId) => startedActionVoices.push(voiceId),
      releaseActionVoice: (voiceId) => releasedActionVoices.push(voiceId),
    },
    wire,
  });
  return {
    looper,
    wire,
    disposedWires,
    startedActionVoices,
    releasedActionVoices,
    clearedAutomationLayers,
  };
}

class ResourceOwningLooper extends InstrumentEntity {
  constructor({ id, root, hooks, wire }) {
    super({ id, kind: INSTRUMENT_KINDS.looper, root });
    this.hooks = hooks;
    this.wire = wire;
    this.controllerReleaseCount = 0;
    this.looperData = {
      transport: createTransportState(),
      tracks: [{
        index: 0,
        trackId: "track-0",
        connectedHonkId: null,
        wireMesh: null,
        automationLayerId: null,
        actionVoiceId: null,
      }],
    };
  }

  connectTrack(index, honkId) {
    const track = this.looperData?.tracks[index] || null;
    if (!track) return null;
    track.connectedHonkId = honkId;
    track.wireMesh = this.wire;
    return track;
  }

  applyAutomation(track, snapshot) {
    track.automationLayerId = `${this.id}:${track.trackId}`;
    track.actionVoiceId = `${track.automationLayerId}:voice`;
    track.automationSnapshot = { ...snapshot };
    this.hooks.startActionVoice(track.actionVoiceId);
  }

  disconnectHonk(honkId) {
    const disconnected = [];
    for (const track of this.looperData?.tracks || []) {
      if (track.connectedHonkId !== honkId) continue;
      this.releaseTrack(track);
      disconnected.push(track);
    }
    return disconnected;
  }

  releaseTrack(track) {
    if (track.automationLayerId) {
      this.hooks.clearAutomation(track.connectedHonkId, track.automationLayerId);
      track.automationLayerId = null;
    }
    if (track.actionVoiceId) {
      this.hooks.releaseActionVoice(track.actionVoiceId);
      track.actionVoiceId = null;
    }
    if (track.wireMesh) {
      this.hooks.disposeWire(track.wireMesh);
      track.wireMesh = null;
    }
    track.connectedHonkId = null;
  }

  dispose() {
    if (this.disposed) return;
    this.controllerReleaseCount += 1;
    for (const track of this.looperData?.tracks || []) {
      this.releaseTrack(track);
    }
    this.looperData?.transport.reset();
    this.looperData = null;
    super.dispose();
  }
}

function createTransportState() {
  return {
    recording: true,
    playing: true,
    paused: true,
    reset() {
      this.recording = false;
      this.playing = false;
      this.paused = false;
    },
  };
}

function createEntity(id, kind) {
  return new InstrumentEntity({ id, kind, root: object3D() });
}

function object3D(x = 0) {
  return {
    parent: null,
    userData: {},
    visible: true,
    position: tuple3(x, 0, 0),
    quaternion: tuple4(0, 0, 0, 1),
    rotation: tuple3(0, 0, 0),
    scale: tuple3(1, 1, 1),
    removeFromParent() { this.parent = null; },
    traverse(callback) { callback(this); },
  };
}

function tuple3(x, y, z) {
  return {
    x,
    y,
    z,
    set(a, b, c) { this.x = a; this.y = b; this.z = c; },
    setScalar(value) { this.x = value; this.y = value; this.z = value; },
    toArray() { return [this.x, this.y, this.z]; },
  };
}

function tuple4(x, y, z, w) {
  return {
    x,
    y,
    z,
    w,
    set(a, b, c, d) { this.x = a; this.y = b; this.z = c; this.w = d; },
    toArray() { return [this.x, this.y, this.z, this.w]; },
    normalize() { return this; },
  };
}
