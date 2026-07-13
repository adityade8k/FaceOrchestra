import assert from "node:assert/strict";
import test from "node:test";

import { INSTRUMENT_KINDS } from "../../../src/instruments/core/capabilities.js";
import { ChordFormationService } from "../../../src/instruments/formations/ChordFormationService.js";
import { HonkContactGraph } from "../../../src/instruments/formations/HonkContactGraph.js";
import { HonkContactSystem } from "../../../src/instruments/formations/HonkContactSystem.js";

test("contact graph adds and removes symmetric edges", () => {
  const graph = new HonkContactGraph();
  graph.addHonk("a");
  graph.addHonk("b");
  assert.equal(graph.setContact("a", "b", true), true);
  assert.equal(graph.hasContact("a", "b"), true);
  assert.equal(graph.hasContact("b", "a"), true);
  assert.equal(graph.setContact("a", "b", false), true);
  assert.equal(graph.hasContact("a", "b"), false);
});

test("formation service detects two-honk and chained A-B-C formations", () => {
  const graph = new HonkContactGraph();
  const formations = new ChordFormationService({ contactGraph: graph });
  graph.setContact("a", "b", true);
  assert.deepEqual(formations.getFormationForHonk("a").memberIds, ["a", "b"]);

  graph.setContact("b", "c", true);
  assert.deepEqual(formations.getFormationForHonk("a").memberIds, ["a", "b", "c"]);
  assert.equal(graph.hasContact("a", "c"), false);
});

test("contact exit separates components and deleting a honk removes its edges", () => {
  const graph = new HonkContactGraph();
  graph.setContact("a", "b", true);
  graph.setContact("b", "c", true);
  graph.setContact("c", "d", true);
  graph.setContact("b", "c", false);
  assert.deepEqual([...graph.getConnectedComponent("a")].sort(), ["a", "b"]);
  assert.deepEqual([...graph.getConnectedComponent("c")].sort(), ["c", "d"]);

  graph.removeHonk("c");
  assert.equal(graph.hasHonk("c"), false);
  assert.equal(graph.getContacts("d").size, 0);
});

test("contact system applies independent entry and exit hysteresis", () => {
  const overlap = new Map();
  const first = honk("a");
  const second = honk("b");
  const graph = new HonkContactGraph();
  const events = [];
  graph.subscribe((event) => {
    if (event.type.startsWith("contact.")) events.push(event.type);
  });
  const system = new HonkContactSystem({
    graph,
    measurePair: (a, b) => ({ touching: true, overlapRatio: overlap.get(`${a.id}:${b.id}`) ?? 0 }),
    settings: {
      entryOverlapRatio: 0.2,
      exitOverlapRatio: 0.1,
      consecutiveEntryFrames: 2,
      consecutiveExitFrames: 3,
    },
  });

  overlap.set("a:b", 0.21);
  system.update([first, second]);
  assert.equal(graph.hasContact("a", "b"), false);
  system.update([first, second]);
  assert.equal(graph.hasContact("a", "b"), true);

  overlap.set("a:b", 0.05);
  system.update([first, second]);
  system.update([first, second]);
  assert.equal(graph.hasContact("a", "b"), true);
  system.update([first, second]);
  assert.equal(graph.hasContact("a", "b"), false);
  assert.deepEqual(events, ["contact.enter", "contact.exit"]);
});

function honk(id) {
  return { id, kind: INSTRUMENT_KINDS.honk, visible: true, disposed: false };
}
