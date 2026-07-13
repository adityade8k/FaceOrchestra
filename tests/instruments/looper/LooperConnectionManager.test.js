import test from "node:test";
import assert from "node:assert/strict";

import { LooperConnectionManager } from "../../../src/instruments/looper/LooperConnectionManager.js";
import { LooperTrack } from "../../../src/instruments/looper/LooperTrack.js";

function createHarness(trackCount = 2) {
  const honks = new Map([
    ["honk-a", { id: "honk-a", playable: true }],
    ["honk-b", { id: "honk-b", playable: true }],
    ["honk-disabled", { id: "honk-disabled", playable: false }],
  ]);
  const cleared = [];
  const disposed = [];
  const wireUpdates = [];
  const looperState = {
    looperData: {
      tracks: Array.from({ length: trackCount }, (_, index) => new LooperTrack({ index })),
    },
  };
  const manager = new LooperConnectionManager({
    applier: {
      clearTrack: (_looper, track) => cleared.push(track.trackId),
    },
    adapter: {
      resolveHonk: (id) => honks.get(id) || null,
      isPlayableHonkId: (honkId) => honks.get(honkId)?.playable === true,
      updateWireForTrack: (_looper, track) => wireUpdates.push(track.trackId),
      disposeWireMesh: (wire) => disposed.push(wire),
    },
  });
  return { cleared, disposed, honks, looperState, manager, wireUpdates };
}

test("LooperConnectionManager connects and replaces by stable honk ID", () => {
  const { cleared, looperState, manager, wireUpdates } = createHarness();

  assert.ok(manager.connect(looperState, 0, "honk-a"));
  assert.equal(looperState.looperData.tracks[0].connectedHonkId, "honk-a");
  assert.deepEqual(cleared, []);

  assert.ok(manager.connect(looperState, 0, "honk-b"));
  assert.equal(looperState.looperData.tracks[0].connectedHonkId, "honk-b");
  assert.deepEqual(cleared, ["track-0"]);
  assert.deepEqual(wireUpdates, ["track-0", "track-0"]);
});

test("LooperConnectionManager rejects missing and unplayable honk IDs", () => {
  const { looperState, manager } = createHarness();

  assert.equal(manager.connect(looperState, 0, "missing"), null);
  assert.equal(manager.connect(looperState, 0, "honk-disabled"), null);
  assert.equal(looperState.looperData.tracks[0].connectedHonkId, null);
});

test("LooperConnectionManager disconnects automation and wire resources", () => {
  const { cleared, disposed, looperState, manager } = createHarness();
  const wire = { id: "wire" };
  manager.connect(looperState, 0, "honk-a");
  looperState.looperData.tracks[0].wireMesh = wire;

  manager.disconnect(looperState, 0);

  assert.equal(looperState.looperData.tracks[0].connectedHonkId, null);
  assert.equal(looperState.looperData.tracks[0].wireMesh, null);
  assert.deepEqual(cleared, ["track-0"]);
  assert.deepEqual(disposed, [wire]);
});

test("LooperConnectionManager disconnects every track for a deleted honk ID", () => {
  const { looperState, manager } = createHarness(3);
  manager.connect(looperState, 0, "honk-a");
  manager.connect(looperState, 1, "honk-b");
  manager.connect(looperState, 2, "honk-a");

  const disconnected = manager.disconnectHonk(looperState, "honk-a");

  assert.deepEqual(disconnected.map((track) => track.trackId), ["track-0", "track-2"]);
  assert.equal(looperState.looperData.tracks[1].connectedHonkId, "honk-b");
});

test("LooperConnectionManager restores valid persisted connections by track ID", () => {
  const { looperState, manager } = createHarness();

  const restored = manager.restoreConnections(looperState, [
    { trackId: "track-1", honkId: "honk-b" },
    { trackId: "missing-track", honkId: "honk-a" },
    { trackId: "track-0", honkId: "missing-honk" },
  ]);

  assert.deepEqual(restored.map((track) => track.trackId), ["track-1"]);
  assert.equal(looperState.looperData.tracks[1].connectedHonkId, "honk-b");
});
