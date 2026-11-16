import test from "node:test";
import assert from "node:assert/strict";
import { HonkContactSystem } from "../../../src/instruments/formations/HonkContactSystem.js";
const edges = (system) =>
  [...system.graph.adjacency].map(([id, neighbors]) => [id, [...neighbors].sort()]).sort();
test("sweep matches quadratic contact admission and exits across motion, scale, teleport and removal", () => {
  const fast = new HonkContactSystem(),
    reference = new HonkContactSystem({ broadPhase: false });
  const honks = Array.from({ length: 100 }, (_, i) => ({
    id: `h${i}`,
    kind: "honk",
    squeezeColliderSphere: { center: [i * 0.5, 0, 0], radius: 0.3 },
  }));
  let seed = 42;
  const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
  for (let frame = 0; frame < 180; frame++) {
    for (const h of honks) {
      const sphere = h.squeezeColliderSphere;
      sphere.center[0] += (random() - 0.5) * 0.2;
      sphere.center[1] = Math.sin(frame / 15 + Number(h.id.slice(1))) * 0.12;
      if (frame % 20 === 0) sphere.radius = 0.1 + random() * 0.7;
      if (frame === 90) sphere.center[0] *= 20;
      h.visible = frame < 120 || random() > 0.03;
    }
    fast.update(honks);
    reference.update(honks);
    assert.deepEqual(edges(fast), edges(reference), `frame ${frame}`);
  }
  honks.forEach((h, i) => {
    h.visible = true;
    h.squeezeColliderSphere.center = [i * 100, 0, 0];
  });
  for (let i = 0; i < 10; i++) fast.update(honks);
  assert.equal(fast.pairStates.size, 0);
  assert.equal(fast.measurements, 0);
});

test("scratch snapshots stay independent across reused resolvers, shrinking membership and reset", () => {
  const shared = { center: { x: 0, y: 0, z: 0 }, radius: 1 };
  const system = new HonkContactSystem({
    getColliderSphere(honk) {
      shared.center.x = honk.x;
      return shared;
    },
    settings: { consecutiveEntryFrames: 1, consecutiveExitFrames: 1 },
  });
  const honks = Array.from({ length: 20 }, (_, i) => ({
    id: `pooled-${i}`,
    kind: "honk",
    x: i * 1.1,
  }));
  system.update(honks);
  const snapshots = [...system.spheres];
  assert.equal(system.graph.getContacts(honks[0].id).size, 1);
  system.update(honks);
  assert.ok(system.spheres.every((sphere, i) => sphere === snapshots[i]));
  assert.ok(system.spheres.every((sphere, i) => sphere.center[0] === honks[i].x));
  honks[0].x = 100;
  system.update(honks.slice(0, 2));
  assert.equal(system.graph.adjacency.size, 2);
  assert.equal(system.pairStates.size, 0);
  system.update(honks);
  assert.equal(system.graph.adjacency.size, 20);
  assert.equal(system.graph.getContacts(honks[0].id).size, 0);
  system.reset();
  assert.equal(system.sweep.pool.length, 0);
  assert.equal(system.spherePool.length, 0);
  assert.equal(system.candidates.length, 0);
  system.update(honks.slice(1, 3));
  assert.equal(system.graph.adjacency.size, 2);
  assert.equal(system.graph.hasContact(honks[1].id, honks[2].id), true);
});
