import test from "node:test";
import assert from "node:assert/strict";
import { HonkContactSystem } from "../../../src/instruments/formations/HonkContactSystem.js";
const edges = (system) =>
  [...system.graph.adjacency]
    .map(([id, neighbors]) => [id, [...neighbors].sort()])
    .sort();
test("sweep matches quadratic contact admission and exits across motion, scale, teleport and removal", () => {
  const fast = new HonkContactSystem(),
    reference = new HonkContactSystem({ broadPhase: false });
  const honks = Array.from({ length: 100 }, (_, i) => ({
    id: `h${i}`,
    kind: "honk",
    squeezeColliderSphere: { center: [i * 0.5, 0, 0], radius: 0.3 },
  }));
  let seed = 42;
  const random = () =>
    (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
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
