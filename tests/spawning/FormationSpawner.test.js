import assert from "node:assert/strict";
import test from "node:test";

import { FormationSpawner } from "../../src/spawning/FormationSpawner.js";
import { SpawnCatalog } from "../../src/spawning/SpawnCatalog.js";
import { SpawnPlacementController } from "../../src/spawning/SpawnPlacementController.js";
import { getFormationRecipe } from "../../src/instruments/formations/formationRecipes.js";

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

test("C-major two-octave preset has exactly fifteen correctly tuned members from C4 through C6", () => {
  const recipe = getFormationRecipe("preset-cmajor-two-octaves");
  assert.equal(recipe.members.length, 15);
  assert.deepEqual(
    recipe.members.map(({ tuning }) => [tuning.note, tuning.semitonesFromF, tuning.octaveOffset]),
    [
      ["C", -5, 0], ["D", -3, 0], ["E", -1, 0], ["F", 0, 0],
      ["G", 2, 0], ["A", 4, 0], ["B", 6, 0],
      ["C", -5, 1], ["D", -3, 1], ["E", -1, 1], ["F", 0, 1],
      ["G", 2, 1], ["A", 4, 1], ["B", 6, 1],
      ["C", -5, 2],
    ],
  );
});

test("C-major preset spawns fifteen independent Honks through the formation path", () => {
  let sequence = 0;
  const spawner = new FormationSpawner({
    recipes: { get: getFormationRecipe },
    spawnHonk: ({ tuning, name }) => ({
      id: `preset-honk-${++sequence}`,
      kind: "honk",
      tuning,
      name,
      root: { position: vector(), quaternion: vector(0, 0, 0, 1) },
    }),
  });
  const honks = spawner.spawn("preset-cmajor-two-octaves");
  assert.equal(honks.length, 15);
  assert.equal(new Set(honks.map(({ id }) => id)).size, 15);
  assert.ok(honks.every(({ kind }) => kind === "honk"));
  assert.ok(honks.every((honk) => !honk.members && !honk.lockGroupId));
});

test("C-major preset reaches the ordinary preview as independent formation members", () => {
  let sequence = 0;
  const spawner = new FormationSpawner({
    recipes: { get: getFormationRecipe },
    spawnHonk: ({ tuning }) => ({
      id: `preview-honk-${++sequence}`,
      kind: "honk",
      tuning,
      root: { position: vector(), quaternion: vector(0, 0, 0, 1) },
    }),
  });
  const catalogEntry = new SpawnCatalog().get("preset-cmajor-two-octaves");
  const placement = new SpawnPlacementController({
    scene: {},
    createEntry: (entry) => spawner.spawn(entry.recipeId),
    previewFactory: (options) => ({ ...options, cancel: () => {} }),
  });
  const controller = {};
  const preview = placement.begin(controller, catalogEntry);
  assert.strictEqual(preview.catalogEntry, catalogEntry);
  assert.strictEqual(preview.controller, controller);
  assert.equal(preview.instruments.length, 15);
  assert.ok(preview.instruments.every(({ kind }) => kind === "honk"));
});

function vector(...initial) {
  let values = initial.length > 0 ? initial : [0, 0, 0];
  return {
    fromArray(next) { values = [...next]; return this; },
    toArray() { return [...values]; },
  };
}
