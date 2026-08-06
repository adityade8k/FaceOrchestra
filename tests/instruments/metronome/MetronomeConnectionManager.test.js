import test from "node:test";
import assert from "node:assert/strict";

import {
  HONK_METRONOME_TARGET_PORT_ID,
  MetronomeConnectionManager,
} from "../../../src/instruments/metronome/MetronomeConnectionManager.js";

test("Metronome connections accept Looper nodes and Honk connectors by stable ID", () => {
  const registry = createRegistry([
    metronome("metro-a"),
    looper("looper-a"),
    honk("honk-a"),
  ]);
  const manager = new MetronomeConnectionManager({ registry });

  const looperConnection = manager.connect({
    metronomeId: "metro-a",
    portId: "port-0",
    targetKind: "looper",
    targetId: "looper-a",
    targetPortId: "track-3",
  });
  const honkConnection = manager.connect({
    metronomeId: "metro-a",
    portId: "port-1",
    targetKind: "honk",
    targetId: "honk-a",
    targetPortId: HONK_METRONOME_TARGET_PORT_ID,
  });

  assert.deepEqual(looperConnection, {
    metronomeId: "metro-a",
    portId: "port-0",
    targetKind: "looper",
    targetId: "looper-a",
    targetPortId: "track-3",
  });
  assert.equal(honkConnection.targetId, "honk-a");
  assert.equal(manager.serialize().length, 2);
});

test("Metronome connections reject missing, disposed, hidden, pending, unsupported, and invalid-port targets", () => {
  const hidden = looper("hidden");
  hidden.root.visible = false;
  const pending = honk("pending");
  pending.pendingPlacement = true;
  const disposed = honk("disposed");
  disposed.disposed = true;
  const registry = createRegistry([
    metronome("metro-a"),
    hidden,
    pending,
    disposed,
    { id: "stick-a", kind: "stick", root: { visible: true } },
  ]);
  const manager = new MetronomeConnectionManager({ registry });
  const base = { metronomeId: "metro-a", portId: "port-0", targetPortId: "track-0" };

  for (const candidate of [
    { ...base, targetKind: "looper", targetId: "missing" },
    { ...base, targetKind: "looper", targetId: "hidden" },
    { ...base, targetKind: "honk", targetId: "pending", targetPortId: HONK_METRONOME_TARGET_PORT_ID },
    { ...base, targetKind: "honk", targetId: "disposed", targetPortId: HONK_METRONOME_TARGET_PORT_ID },
    { ...base, targetKind: "stick", targetId: "stick-a" },
    { ...base, portId: "port-9", targetKind: "looper", targetId: "hidden" },
  ]) {
    assert.equal(manager.connect(candidate), null);
  }
  assert.deepEqual(manager.serialize(), []);
});

test("port replacement, incoming replacement, and identical reconnect are deterministic", () => {
  const removed = [];
  const registry = createRegistry([
    metronome("metro-a"),
    metronome("metro-b"),
    looper("looper-a"),
    honk("honk-a"),
  ]);
  const manager = new MetronomeConnectionManager({
    registry,
    onConnectionRemoved: (connection, reason) => removed.push([connection, reason]),
  });
  const first = manager.connect({
    metronomeId: "metro-a", portId: "port-0", targetKind: "looper",
    targetId: "looper-a", targetPortId: "track-0",
  });

  assert.strictEqual(manager.connect({ ...first }), first);
  assert.equal(removed.length, 0);

  manager.connect({
    metronomeId: "metro-a", portId: "port-0", targetKind: "honk",
    targetId: "honk-a", targetPortId: HONK_METRONOME_TARGET_PORT_ID,
  });
  assert.equal(removed[0][1], "port-replaced");
  assert.equal(manager.getConnectionForTarget("looper", "looper-a"), null);

  manager.connect({
    metronomeId: "metro-b", portId: "port-2", targetKind: "honk",
    targetId: "honk-a", targetPortId: HONK_METRONOME_TARGET_PORT_ID,
  });
  assert.equal(removed[1][1], "incoming-replaced");
  assert.equal(manager.getConnectionForPort("metro-a", "port-0"), null);
  assert.equal(manager.getConnectionForTarget("honk", "honk-a").metronomeId, "metro-b");
});

test("Looper timing resolves only through its connected Metronome with no global fallback", () => {
  const metroA = metronome("metro-a", { bpm: 90, beatOriginMs: 1000 });
  const metroB = metronome("metro-b", { bpm: 180, beatOriginMs: 2000 });
  const registry = createRegistry([metroA, metroB, looper("looper-a"), looper("looper-b")]);
  const manager = new MetronomeConnectionManager({ registry });

  assert.deepEqual(manager.getTimingForLooper("looper-a", 2500), {
    active: false,
    clockAvailable: false,
    connected: false,
    metronomeId: null,
    portId: null,
    bpm: null,
    beatIntervalMs: null,
    beatOriginMs: null,
    beatPosition: null,
    nearestBeatMs: null,
    lastBeatMs: null,
    lastEmittedBeatOrdinal: null,
  });

  manager.connect({
    metronomeId: "metro-a", portId: "port-0", targetKind: "looper",
    targetId: "looper-a", targetPortId: "track-0",
  });
  manager.connect({
    metronomeId: "metro-b", portId: "port-0", targetKind: "looper",
    targetId: "looper-b", targetPortId: "track-0",
  });

  assert.equal(manager.getTimingForLooper("looper-a", 2500).metronomeId, "metro-a");
  assert.equal(manager.getTimingForLooper("looper-a", 2500).bpm, 90);
  assert.equal(manager.getTimingForLooper("looper-b", 2500).metronomeId, "metro-b");
  assert.equal(manager.getTimingForLooper("looper-b", 2500).bpm, 180);
  metroA.playing = false;
  assert.equal(manager.getTimingForLooper("looper-a", 2500).active, false);
  assert.equal(manager.getTimingForLooper("looper-b", 2500).active, true);
});

test("wire presentation is recreated from restored relationships and disposed exactly once", () => {
  const registry = createRegistry([metronome("metro-a"), looper("looper-a")]);
  const wires = new Map();
  let created = 0;
  let disposed = 0;
  const manager = new MetronomeConnectionManager({
    registry,
    onConnectionAdded(connection) {
      const key = `${connection.metronomeId}:${connection.portId}`;
      wires.set(key, { dispose() { disposed += 1; } });
      created += 1;
    },
    onConnectionRemoved(connection) {
      const key = `${connection.metronomeId}:${connection.portId}`;
      wires.get(key)?.dispose();
      wires.delete(key);
    },
  });
  const serialized = [{
    metronomeId: "metro-a",
    portId: "port-0",
    targetKind: "looper",
    targetId: "looper-a",
    targetPortId: "track-0",
  }];

  manager.restore(serialized);
  assert.equal(created, 1);
  assert.equal(wires.size, 1);
  manager.disconnectPort("metro-a", "port-0");
  manager.disconnectPort("metro-a", "port-0");
  assert.equal(disposed, 1);

  manager.restore(serialized);
  assert.equal(created, 2);
  assert.equal(wires.size, 1);
  manager.clear();
  assert.equal(disposed, 2);
});

test("direct endpoint disposal removes stable relationships before resources disappear", () => {
  const metro = metronome("metro-dispose");
  const target = looper("looper-dispose");
  const disposeHandlers = new Set();
  target.addDisposeHandler = (handler) => {
    disposeHandlers.add(handler);
    return () => disposeHandlers.delete(handler);
  };
  const removed = [];
  const manager = new MetronomeConnectionManager({
    registry: createRegistry([metro, target]),
    onConnectionRemoved: (connection, reason) => removed.push({ connection, reason }),
  });
  manager.connect({
    metronomeId: metro.id,
    portId: "port-0",
    targetKind: "looper",
    targetId: target.id,
    targetPortId: "track-0",
  });

  for (const handler of [...disposeHandlers]) handler();
  assert.equal(manager.serialize().length, 0);
  assert.equal(removed[0].reason, "endpoint-disposed");
});

function metronome(id, { bpm = 120, beatOriginMs = 1000 } = {}) {
  return {
    id,
    kind: "metronome",
    disposed: false,
    pendingPlacement: false,
    playing: true,
    root: { visible: true },
    hasConnectionPort: (portId) => ["port-0", "port-1", "port-2", "port-3"].includes(portId),
    getBeatTiming(now) {
      const beatIntervalMs = 60000 / bpm;
      return this.playing
        ? {
          active: true,
          bpm,
          beatIntervalMs,
          beatOriginMs,
          beatPosition: (now - beatOriginMs) / beatIntervalMs,
          nearestBeatMs: now,
          lastBeatMs: beatOriginMs,
          lastEmittedBeatOrdinal: 0,
        }
        : { active: false, bpm, beatIntervalMs, beatOriginMs: null };
    },
  };
}

function looper(id) {
  return {
    id,
    kind: "looper",
    disposed: false,
    pendingPlacement: false,
    root: { visible: true },
    tracks: Array.from({ length: 4 }, (_, index) => ({
      trackId: `track-${index}`,
      nodeTarget: { visible: true },
    })),
  };
}

function honk(id) {
  const connector = { visible: true };
  return {
    id,
    kind: "honk",
    disposed: false,
    pendingPlacement: false,
    root: { visible: true },
    getTarget: (role) => role === HONK_METRONOME_TARGET_PORT_ID ? connector : null,
  };
}

function createRegistry(instruments) {
  const entries = new Map(instruments.map((instrument) => [instrument.id, instrument]));
  const listeners = new Set();
  return {
    get: (id) => entries.get(id) || null,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
