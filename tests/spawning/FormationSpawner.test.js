import assert from "node:assert/strict";
import test from "node:test";

import { FormationSpawner } from "../../src/spawning/FormationSpawner.js";
import { SpawnCatalog } from "../../src/spawning/SpawnCatalog.js";

test("formation recipes spawn independent tuned Honks rather than a composite instrument", () => {
  const recipe = {
    id: "triad",
    namePrefix: "Triad",
    members: [
      { tuning: { note: "C" }, position: [-0.2, 0, 0] },
      { tuning: { note: "E" }, position: [0, 0, 0] },
      { tuning: { note: "G" }, position: [0.2, 0, 0] },
    ],
  };
  let sequence = 0;
  const spawner = new FormationSpawner({
    recipes: { get: (id) => id === recipe.id ? recipe : null },
    spawnHonk: ({ tuning, name }) => ({
      id: `honk-${++sequence}`,
      kind: "honk",
      tuning,
      name,
      root: { position: vector(), quaternion: vector(0, 0, 0, 1) },
    }),
  });

  const honks = spawner.spawn("triad");
  assert.deepEqual(honks.map(({ id, kind }) => ({ id, kind })), [
    { id: "honk-1", kind: "honk" },
    { id: "honk-2", kind: "honk" },
    { id: "honk-3", kind: "honk" },
  ]);
  assert.deepEqual(honks.map(({ tuning }) => tuning.note), ["C", "E", "G"]);
  assert.deepEqual(honks.map(({ root }) => root.position.toArray()), recipe.members.map(({ position }) => position));
});

test("spawn catalog keeps instrument, formation, and equipment actions distinct", () => {
  const catalog = new SpawnCatalog();
  assert.equal(catalog.get("honk").action, "instrument");
  assert.equal(catalog.get("looper").action, "instrument");
  assert.equal(catalog.get("chord-cmajor").action, "formation");
  assert.equal(catalog.get("stick").action, "equip");
  assert.equal(catalog.get("stick").visibleInRadial, false);
});

function vector(...initial) {
  let values = initial.length > 0 ? initial : [0, 0, 0];
  return {
    fromArray(next) { values = [...next]; return this; },
    toArray() { return [...values]; },
  };
}
