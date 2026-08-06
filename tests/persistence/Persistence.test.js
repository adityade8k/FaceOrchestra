import test from "node:test";
import assert from "node:assert/strict";

import { migrateSceneData } from "../../src/persistence/migrations/index.js";
import { SceneRestorer } from "../../src/persistence/SceneRestorer.js";
import { SceneSerializer } from "../../src/persistence/SceneSerializer.js";
import { MetronomeConnectionManager } from "../../src/instruments/metronome/MetronomeConnectionManager.js";
import { LooperTimeline } from "../../src/instruments/looper/timeline/LooperTimeline.js";

test("v1 scenes migrate through the stable-ID schema to v4 without inventing relationships", () => {
  const migrated = migrateSceneData({
    version: 1,
    instruments: [
      { componentId: "honk", position: [1, 2, 3], quaternion: [0, 0, 0, 1], baseScale: 2.5, locked: true },
      { componentId: "looper", position: [0, 1, -1], quaternion: [0, 0, 0, 1], baseScale: 1.5, locked: true },
    ],
  });

  assert.equal(migrated.schemaVersion, 4);
  assert.deepEqual(migrated.instruments.map(({ id, kind }) => ({ id, kind })), [
    { id: "honk-1", kind: "honk" },
    { id: "looper-2", kind: "looper" },
  ]);
  assert.deepEqual(migrated.relationships.honkLocks, []);
  assert.deepEqual(migrated.relationships.metronomeConnections, []);
  assert.equal(migrated.instruments[0].appearance.legacyLocked, true);
  assert.equal(migrated.instruments[1].appearance.locked, true);
});

test("v2-to-v4 migration preserves Gap, drops user speed, and adds Metronome relationships", () => {
  const source = {
    schemaVersion: 2,
    instruments: [{
      id: "looper-legacy",
      kind: "looper",
      controls: { volume: 0.25, gap: 0.5, speed: -0.75 },
    }],
    relationships: { honkLocks: [], looperConnections: [] },
  };
  const migrated = migrateSceneData(source);

  assert.equal(migrated.schemaVersion, 4);
  assert.deepEqual(migrated.instruments[0].controls, { volume: 0.25, gap: 0.5 });
  assert.deepEqual(migrated.relationships.metronomeConnections, []);
  assert.equal(source.instruments[0].controls.speed, -0.75);
});

test("v3-to-v4 migration derives phrase-end timing and discards legacy tail padding on restore", () => {
  const source = {
    schemaVersion: 3,
    instruments: [{
      id: "looper-current-schema",
      kind: "looper",
      controls: { volume: 0, gap: -1 },
      timeline: {
        schemaVersion: 2,
        durationMs: 1000,
        recordedDurationMs: 1000,
        beatIntervalMs: 500,
        gapBeats: 0,
        tracks: [{
          trackId: "track-0",
          trackIndex: 0,
          events: [
            { id: 1, type: "squeezeStart", timeMs: 0, value: 1 },
            { id: 2, type: "squeezeEnd", timeMs: 310, value: 0 },
            { id: 3, type: "vowel", timeMs: 900, value: "O" },
          ],
        }],
      },
    }],
    relationships: { honkLocks: [], looperConnections: [], metronomeConnections: [] },
  };
  const migrated = migrateSceneData(source);
  const restoredTimeline = LooperTimeline.fromJSON(migrated.instruments[0].timeline);
  assert.equal(migrated.schemaVersion, 4);
  assert.equal(migrated.instruments[0].timeline.schemaVersion, 3);
  assert.equal(restoredTimeline.contentEndMs, 310);
  assert.equal(restoredTimeline.durationMs, 310);
  assert.equal(restoredTimeline.getTrack("track-0").events.some(({ timeMs }) => timeMs === 900), false);
  assert.equal(source.instruments[0].timeline.durationMs, 1000);
});

test("serializer returns plain JSON and persists relationships by ID", () => {
  const honk = fakeInstrument("honk-1", "honk");
  const looper = fakeInstrument("looper-1", "looper");
  looper.tracks = [{ trackId: "track-0", connectedHonkId: honk.id }];
  const registry = fakeRegistry([honk, looper]);
  const serializer = new SceneSerializer({
    registry,
    lockService: { serialize: () => [{ id: "lock-1", anchorId: honk.id, memberIds: [honk.id, "honk-2"], memberLocalTransforms: {} }] },
  });

  const saved = serializer.serialize();
  assert.doesNotThrow(() => JSON.stringify(saved));
  assert.deepEqual(saved.relationships.looperConnections, [
    { looperId: looper.id, trackId: "track-0", honkId: honk.id },
  ]);
  assert.equal(Object.getPrototypeOf(saved), Object.prototype);
});

test("serializer includes only Metronome relationships whose endpoints are saved", () => {
  const metronome = fakeInstrument("metro-saved", "metronome");
  const honk = fakeInstrument("honk-saved", "honk");
  const pending = fakeInstrument("honk-pending", "honk");
  pending.pendingPlacement = true;
  const allConnections = [
    { metronomeId: metronome.id, portId: "port-0", targetKind: "honk", targetId: honk.id, targetPortId: "honk.looper-connector" },
    { metronomeId: metronome.id, portId: "port-1", targetKind: "honk", targetId: pending.id, targetPortId: "honk.looper-connector" },
  ];
  const serializer = new SceneSerializer({
    registry: fakeRegistry([metronome, honk, pending]),
    lockService: { serialize: () => [] },
    metronomeConnectionManager: {
      serialize(savedIds) {
        return allConnections.filter(({ metronomeId, targetId }) =>
          savedIds.has(metronomeId) && savedIds.has(targetId));
      },
    },
  });

  assert.deepEqual(serializer.serialize().relationships.metronomeConnections, [allConnections[0]]);
});

test("serializer keeps durable Looper data but excludes transport state", () => {
  const looper = fakeInstrument("looper-1", "looper");
  looper.root.visible = false;
  looper.root.scale = tuple([2.07, 2.07, 2.07]);
  looper.baseScale = 2;
  looper.serialize = () => ({
    id: looper.id,
    kind: looper.kind,
    appearance: { locked: true },
    controls: { volume: 0.4, gap: -0.25 },
    timeline: { schemaVersion: 1, durationMs: 480, tracks: [{ trackId: "track-0", events: [] }] },
    transport: { state: "paused" },
    recording: false,
    playing: false,
    paused: true,
    playbackPositionMs: 240,
  });
  const pendingHonk = fakeInstrument("honk-pending", "honk");
  pendingHonk.pendingPlacement = true;

  const saved = new SceneSerializer({
    registry: fakeRegistry([looper, pendingHonk]),
    lockService: { serialize: () => [] },
  }).serialize();

  assert.equal(saved.instruments.length, 1);
  assert.deepEqual(saved.instruments[0].transform.scale, [2, 2, 2]);
  assert.deepEqual(saved.instruments[0].controls, looper.serialize().controls);
  assert.deepEqual(saved.instruments[0].timeline, looper.serialize().timeline);
  for (const field of ["transport", "recording", "playing", "paused", "playbackPositionMs"]) {
    assert.equal(Object.hasOwn(saved.instruments[0], field), false);
  }
});

test("restorer creates all instruments before lock and looper relationships", async () => {
  const events = [];
  const instruments = new Map();
  const registry = {
    get: (id) => instruments.get(id) || null,
    has: (id) => instruments.has(id),
    add: (instrument) => instruments.set(instrument.id, instrument),
  };
  const createInstrument = async (saved) => {
    events.push(`create:${saved.id}`);
    const instrument = fakeInstrument(saved.id, saved.kind);
    if (saved.kind === "looper") {
      instrument.tracks = [{ trackId: "track-0" }];
      instrument.connectTrack = (index, honkId) => events.push(`connect:${index}:${honkId}`);
      instrument.restoreEntity = () => events.push(`entity:${saved.id}`);
      instrument.restoreTimeline = () => events.push(`timeline:${saved.id}`);
    }
    instruments.set(instrument.id, instrument);
    return instrument;
  };
  const lockService = {
    restore: (groups) => {
      assert.ok(instruments.has("honk-1"));
      assert.ok(instruments.has("honk-2"));
      events.push(`locks:${groups.length}`);
    },
  };
  const restorer = new SceneRestorer({
    registry,
    createInstrument,
    lockService,
    metronomeConnectionManager: {
      restore: (connections) => events.push(`metronome:${connections.length}`),
    },
  });

  await restorer.restore({
    instruments: [
      { id: "honk-1", kind: "honk" },
      { id: "honk-2", kind: "honk" },
      { id: "looper-1", kind: "looper" },
    ],
    relationships: {
      honkLocks: [{ id: "lock-1", anchorId: "honk-1", memberIds: ["honk-1", "honk-2"] }],
      looperConnections: [{ looperId: "looper-1", trackId: "track-0", honkId: "honk-2" }],
      metronomeConnections: [{ metronomeId: "missing", portId: "port-0", targetKind: "looper", targetId: "looper-1", targetPortId: "track-0" }],
    },
  });

  assert.deepEqual(events, [
    "create:honk-1",
    "create:honk-2",
    "create:looper-1",
    "entity:looper-1",
    "locks:1",
    "connect:0:honk-2",
    "timeline:looper-1",
    "metronome:1",
  ]);
});

test("restorer skips relationships whose targets are missing", async () => {
  const registry = fakeRegistry([]);
  const restoredLocks = [];
  const restorer = new SceneRestorer({
    registry,
    createInstrument: async () => null,
    lockService: { restore: (groups) => restoredLocks.push(...groups) },
  });
  const result = await restorer.restore({
    instruments: [],
    relationships: {
      honkLocks: [{ id: "lock-1", memberIds: ["missing-a", "missing-b"] }],
      looperConnections: [{ looperId: "missing", trackId: "track-0", honkId: "also-missing" }],
    },
  });
  assert.deepEqual(restoredLocks, []);
  assert.deepEqual(result.skipped, []);
});

test("restorer synchronizes a saved uniform scale with runtime baseScale", async () => {
  const instrument = fakeInstrument("honk-1", "honk");
  instrument.baseScale = 0.5;
  instrument.setScale = (scale) => instrument.root.scale.fromArray([scale, scale, scale]);
  const instruments = new Map();
  const registry = {
    get: (id) => instruments.get(id) || null,
    has: (id) => instruments.has(id),
    add: (entry) => instruments.set(entry.id, entry),
  };
  const restorer = new SceneRestorer({
    registry,
    createInstrument: async () => instrument,
    lockService: { restore() {} },
  });

  await restorer.restore({
    instruments: [{
      id: instrument.id,
      kind: instrument.kind,
      transform: {
        position: [1, 2, 3],
        quaternion: [0, 0, 0, 1],
        scale: [2.25, 2.25, 2.25],
      },
    }],
    relationships: { honkLocks: [], looperConnections: [] },
  });

  assert.equal(instrument.baseScale, 2.25);
  assert.deepEqual(instrument.root.scale.toArray(), [2.25, 2.25, 2.25]);
});

test("restorer recreates every saved metronome and leaves each paused", async () => {
  const registry = new Map();
  registry.has = registry.has.bind(registry);
  registry.add = (instrument) => registry.set(instrument.id, instrument);
  const created = [];
  const restorer = new SceneRestorer({
    registry,
    lockService: { restore() {} },
    createInstrument: async (saved) => {
      const instrument = {
        id: saved.id,
        kind: "metronome",
        root: fakeInstrument(saved.id, "metronome").root,
        playing: true,
        restore(data) {
          this.bpm = data.bpm;
          this.volume = data.volume;
          this.playing = false;
        },
      };
      created.push(instrument);
      return instrument;
    },
  });
  const result = await restorer.restore({
    instruments: [
      { id: "metro-a", kind: "metronome", bpm: 90, volume: 0.2 },
      { id: "metro-b", kind: "metronome", bpm: 180, volume: 0.8 },
    ],
  });
  assert.equal(result.instruments.length, 2);
  assert.deepEqual(created.map(({ bpm, volume, playing }) => ({ bpm, volume, playing })), [
    { bpm: 90, volume: 0.2, playing: false },
    { bpm: 180, volume: 0.8, playing: false },
  ]);
});

test("restorer recreates valid Metronome relationships and skips missing endpoints", async () => {
  const instruments = new Map();
  const registry = {
    get: (id) => instruments.get(id) || null,
    has: (id) => instruments.has(id),
    add: (instrument) => instruments.set(instrument.id, instrument),
  };
  const manager = new MetronomeConnectionManager({ registry });
  const restorer = new SceneRestorer({
    registry,
    lockService: { restore() {} },
    metronomeConnectionManager: manager,
    createInstrument: async (saved) => {
      const instrument = fakeInstrument(saved.id, saved.kind);
      if (saved.kind === "metronome") {
        instrument.hasConnectionPort = (portId) => portId === "port-0";
      }
      if (saved.kind === "looper") {
        instrument.tracks = [{ trackId: "track-0", nodeTarget: { visible: true } }];
        instrument.restoreEntity = () => {};
        instrument.restoreTimeline = () => {};
      }
      instruments.set(saved.id, instrument);
      return instrument;
    },
  });

  await restorer.restore({
    instruments: [
      { id: "metro-a", kind: "metronome" },
      { id: "looper-a", kind: "looper" },
    ],
    relationships: {
      honkLocks: [],
      looperConnections: [],
      metronomeConnections: [
        { metronomeId: "missing", portId: "port-0", targetKind: "looper", targetId: "looper-a", targetPortId: "track-0" },
        { metronomeId: "metro-a", portId: "port-0", targetKind: "looper", targetId: "looper-a", targetPortId: "track-0" },
      ],
    },
  });

  assert.deepEqual(manager.serialize(), [
    { metronomeId: "metro-a", portId: "port-0", targetKind: "looper", targetId: "looper-a", targetPortId: "track-0" },
  ]);
  manager.dispose();
});

function fakeInstrument(id, kind) {
  return {
    id,
    kind,
    root: {
      visible: true,
      position: tuple([0, 0, 0]),
      quaternion: { ...tuple([0, 0, 0, 1]), normalize() {} },
      scale: tuple([1, 1, 1]),
      updateMatrixWorld() {},
    },
    serialize() {
      return { id, kind, transform: { position: [0, 0, 0], quaternion: [0, 0, 0, 1], scale: [1, 1, 1] } };
    },
    restore() {},
  };
}

function tuple(initial) {
  let values = [...initial];
  return {
    fromArray(next) { values = [...next]; return this; },
    toArray() { return [...values]; },
  };
}

function fakeRegistry(instruments) {
  const byId = new Map(instruments.map((instrument) => [instrument.id, instrument]));
  return {
    values: () => byId.values(),
    get: (id) => byId.get(id) || null,
    getByKind: (kind) => [...byId.values()].filter((instrument) => instrument.kind === kind),
  };
}
