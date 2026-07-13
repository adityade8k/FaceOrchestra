import assert from "node:assert/strict";
import test from "node:test";

import { INSTRUMENT_KINDS } from "../../../src/instruments/core/capabilities.js";
import { InstrumentRegistry } from "../../../src/instruments/core/InstrumentRegistry.js";
import { ChordFormationService } from "../../../src/instruments/formations/ChordFormationService.js";
import { HonkContactGraph } from "../../../src/instruments/formations/HonkContactGraph.js";
import { HonkLockService } from "../../../src/instruments/formations/HonkLockService.js";

test("locks the current chained formation and transforms every member from stable relative transforms", () => {
  const fixture = createFixture([instrument("a", 0), instrument("b", 2), instrument("c", 4)]);
  fixture.graph.setContact("a", "b", true);
  fixture.graph.setContact("b", "c", true);

  const group = fixture.locks.lockFormation("a");
  assert.equal(group.id, "lock-1");
  assert.deepEqual(group.getMemberIds(), ["a", "b", "c"]);
  assert.equal(group.memberLocalTransforms.get("b").position[0], 2);

  fixture.registry.get("a").root.position.x = 10;
  fixture.registry.get("a").setScale(2);
  fixture.locks.updateTransforms();
  assert.equal(fixture.registry.get("b").root.position.x, 14);
  assert.equal(fixture.registry.get("c").root.position.x, 18);
  assert.equal(fixture.registry.get("b").root.scale.x, 2);
});

test("unlock preserves world transforms", () => {
  const fixture = createFixture([instrument("a", 0), instrument("b", 2)]);
  fixture.graph.setContact("a", "b", true);
  const group = fixture.locks.lockFormation("a");
  fixture.registry.get("a").root.position.x = 7;
  fixture.locks.updateTransforms();
  const before = transformSnapshot(fixture.registry.get("b"));
  fixture.locks.unlockGroup(group);
  assert.deepEqual(transformSnapshot(fixture.registry.get("b")), before);
  assert.equal(fixture.locks.getGroupForMember("a"), null);
});

test("touching honks are not automatically added to an existing lock group", () => {
  const fixture = createFixture([instrument("a", 0), instrument("b", 2), instrument("c", 4)]);
  fixture.graph.setContact("a", "b", true);
  const group = fixture.locks.lockFormation("a");
  fixture.graph.setContact("b", "c", true);
  fixture.locks.updateTransforms();
  assert.deepEqual(group.getMemberIds(), ["a", "b"]);
  assert.equal(fixture.locks.getGroupForMember("c"), null);
  assert.equal(fixture.locks.lockFormation("c"), null);
});

test("deleting members removes them and dissolves groups below two honks", () => {
  const fixture = createFixture([instrument("a", 0), instrument("b", 2), instrument("c", 4)]);
  fixture.graph.setContact("a", "b", true);
  fixture.graph.setContact("b", "c", true);
  const group = fixture.locks.lockFormation("a");

  fixture.registry.remove("a", { dispose: false });
  assert.equal(group.anchorId, "b");
  assert.deepEqual(group.getMemberIds(), ["b", "c"]);
  fixture.registry.remove("c", { dispose: false });
  assert.equal(fixture.locks.getGroup(group.id), null);
  assert.equal(fixture.locks.getGroupForMember("b"), null);
});

test("serialized lock groups restore stable IDs and member relationships", () => {
  const fixture = createFixture([instrument("a", 0), instrument("b", 2)]);
  fixture.graph.setContact("a", "b", true);
  fixture.locks.lockFormation("a");
  const serialized = fixture.locks.serialize();
  fixture.locks.dispose();

  const restored = new HonkLockService({
    instrumentRegistry: fixture.registry,
    formationService: fixture.formations,
    idFactory: () => "unused",
  });
  assert.equal(restored.restore(serialized)[0].id, "lock-1");
  assert.equal(restored.getGroupForMember("b").anchorId, "a");
});

test("reset unlocks every transient group without disposing the reusable service", () => {
  const fixture = createFixture([instrument("a", 0), instrument("b", 2)]);
  fixture.graph.setContact("a", "b", true);
  const group = fixture.locks.lockFormation("a");

  assert.deepEqual(fixture.locks.reset({ reason: "session-reset" }), [group]);
  assert.equal(fixture.locks.getGroup(group.id), null);
  assert.equal(fixture.locks.getGroupForMember("a"), null);

  const relocked = fixture.locks.lockFormation("b");
  assert.ok(relocked);
  assert.notEqual(relocked.id, group.id);
});

function createFixture(instruments) {
  const registry = new InstrumentRegistry();
  instruments.forEach((entry) => registry.add(entry, { initialize: false }));
  const graph = new HonkContactGraph();
  const formations = new ChordFormationService({ contactGraph: graph });
  let nextId = 1;
  const locks = new HonkLockService({
    instrumentRegistry: registry,
    formationService: formations,
    idFactory: () => `lock-${nextId++}`,
  });
  return { registry, graph, formations, locks };
}

function instrument(id, x) {
  const root = {
    position: tuple3(x, 0, 0),
    quaternion: tuple4(0, 0, 0, 1),
    scale: tuple3(1, 1, 1),
    userData: {},
    visible: true,
    parent: null,
  };
  return {
    id,
    kind: INSTRUMENT_KINDS.honk,
    root,
    disposed: false,
    visible: true,
    getScale: () => root.scale.x,
    setScale: (scale) => root.scale.set(scale, scale, scale),
  };
}

function tuple3(x, y, z) {
  return { x, y, z, set(a, b, c) { this.x = a; this.y = b; this.z = c; } };
}

function tuple4(x, y, z, w) {
  return { x, y, z, w, set(a, b, c, d) { this.x = a; this.y = b; this.z = c; this.w = d; } };
}

function transformSnapshot(entry) {
  return {
    position: [entry.root.position.x, entry.root.position.y, entry.root.position.z],
    scale: [entry.root.scale.x, entry.root.scale.y, entry.root.scale.z],
  };
}
