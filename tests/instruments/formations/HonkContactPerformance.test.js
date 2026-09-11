import test from 'node:test';
import assert from 'node:assert/strict';
import { HonkContactGraph } from '../../../src/instruments/formations/HonkContactGraph.js';
import { HonkContactSystem } from '../../../src/instruments/formations/HonkContactSystem.js';

test('component cache invalidates for edges, deletion and reset without exposing shared sets', () => {
  const g = new HonkContactGraph();
  g.setContact('a', 'b', true);
  g.getConnectedComponent('a').clear();
  assert.equal(g.getConnectedComponent('b').size, 2);
  const rev = g.revision;
  g.setContact('a', 'b', true);
  assert.equal(g.revision, rev);
  g.removeHonk('b');
  assert.deepEqual([...g.getConnectedComponent('a')], ['a']);
  assert.equal(g.getConnectedComponent('b').size, 0);
  g.addHonk('b');
  assert.deepEqual([...g.getConnectedComponent('b')], ['b']);
  g.clear();
  assert.equal(g.componentCache.size, 0);
});

test('48 candidates resolve 48 independent sphere snapshots and retain all 1128 pair tests', () => {
  let reads = 0;
  let pairs = 0;
  const shared = { center: { x: 0, y: 0, z: 0 }, radius: 1 };
  const system = new HonkContactSystem({
    getColliderSphere(honk) { reads += 1; shared.center.x = honk.x; return shared; },
    measurePair(a, b, first, second) {
      pairs += 1;
      assert.equal(first.center[0], a.x);
      assert.equal(second.center[0], b.x);
      return false;
    },
  });
  system.update(Array.from({ length: 48 }, (_, x) => ({ id: `h${x}`, kind: 'honk', x })));
  assert.equal(reads, 48);
  assert.equal(pairs, 1128);
});
