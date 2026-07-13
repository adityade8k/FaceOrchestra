import test from "node:test";
import assert from "node:assert/strict";

import { migrateSceneData } from "../../src/persistence/migrations/index.js";
import { SceneRestorer } from "../../src/persistence/SceneRestorer.js";
import { SceneSerializer } from "../../src/persistence/SceneSerializer.js";

test("v1 scenes migrate to stable-ID schema v2 without inventing relationships", () => {
  const migrated = migrateSceneData({
    version: 1,
    instruments: [
      { componentId: "honk", position: [1, 2, 3], quaternion: [0, 0, 0, 1], baseScale: 2.5, locked: true },
      { componentId: "looper", position: [0, 1, -1], quaternion: [0, 0, 0, 1], baseScale: 1.5, locked: true },
    ],
  });

  assert.equal(migrated.schemaVersion, 2);
  assert.deepEqual(migrated.instruments.map(({ id, kind }) => ({ id, kind })), [
    { id: "honk-1", kind: "honk" },
    { id: "looper-2", kind: "looper" },
  ]);
  assert.deepEqual(migrated.relationships.honkLocks, []);
  assert.equal(migrated.instruments[0].appearance.legacyLocked, true);
  assert.equal(migrated.instruments[1].appearance.locked, true);
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
  const restorer = new SceneRestorer({ registry, createInstrument, lockService });

  await restorer.restore({
    instruments: [
      { id: "honk-1", kind: "honk" },
      { id: "honk-2", kind: "honk" },
      { id: "looper-1", kind: "looper" },
    ],
    relationships: {
      honkLocks: [{ id: "lock-1", anchorId: "honk-1", memberIds: ["honk-1", "honk-2"] }],
      looperConnections: [{ looperId: "looper-1", trackId: "track-0", honkId: "honk-2" }],
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
