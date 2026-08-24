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

const EXPECTED_TUNINGS = Object.freeze({
  "chord-aminor": [["A", 4, 0], ["C", -5, 0], ["E", -1, 1]],
  "chord-emajor": [["E", -1, -1], ["B", 6, 0], ["G#", 3, 0]],
  "chord-cmajor": [["C", -5, 0], ["E", -1, 0], ["G", 2, 0]],
  "chord-dminor": [["F", 0, 0], ["A", 4, 0], ["D", -3, 1]],
  "preset-quiet": [
    ["G", 2, -1], ["C", -5, 0], ["E", -1, 0], ["D", -3, 1],
    ["C", -5, 1], ["B", 6, 0], ["A", 4, 0], ["G#", 3, 0],
  ],
  "preset-melody": [
    ["G#", 3, 0], ["A", 4, 0], ["B", 6, 0], ["C", -5, 0], ["D", -3, 0],
    ["E", -1, 0], ["F", 0, 0], ["E", -1, 2], ["E", -1, 0],
  ],
  "preset-bass": [["C", -5, 0], ["E", -1, 0], ["G", 2, 0], ["A", 4, 0]],
  "preset-decoration": [["C", -5, 0], ["D", -3, 0], ["E", -1, 1]],
  "preset-still-believe": [["G#", 3, 1], ["A", 4, 1]],
});

test("chord and preset recipes preserve every specified tuning tuple in order", () => {
  for (const [recipeId, expectedTunings] of Object.entries(EXPECTED_TUNINGS)) {
    const recipe = getFormationRecipe(recipeId);
    assert.ok(recipe, `missing recipe ${recipeId}`);
    assert.deepEqual(
      recipe.members.map(({ tuning }) => [tuning.note, tuning.semitonesFromF, tuning.octaveOffset]),
      expectedTunings,
      recipeId,
    );
  }
});

test("preset recipes have the required counts and Melody starts on G#4 and retains its repeated E4", () => {
  assert.deepEqual(
    Object.keys(EXPECTED_TUNINGS)
      .filter((id) => id.startsWith("preset-"))
      .map((id) => [id, getFormationRecipe(id).members.length]),
    [
      ["preset-quiet", 8],
      ["preset-melody", 9],
      ["preset-bass", 4],
      ["preset-decoration", 3],
      ["preset-still-believe", 2],
    ],
  );
  const melodyTunings = getFormationRecipe("preset-melody").members.map(({ tuning }) => tuning);
  assert.deepEqual(
    [melodyTunings[0].note, melodyTunings[0].semitonesFromF, melodyTunings[0].octaveOffset],
    ["G#", 3, 0],
  );
  assert.deepEqual(
    melodyTunings.slice(-4).map(({ note, octaveOffset }) => [note, octaveOffset]),
    [["E", 0], ["F", 0], ["E", 2], ["E", 0]],
  );
});

test("every chord and preset spawns independent Honks through the formation path", () => {
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
  for (const [recipeId, expectedTunings] of Object.entries(EXPECTED_TUNINGS)) {
    const honks = spawner.spawn(recipeId);
    assert.equal(honks.length, expectedTunings.length, recipeId);
    assert.equal(new Set(honks.map(({ id }) => id)).size, expectedTunings.length, recipeId);
    assert.ok(honks.every(({ kind }) => kind === "honk"), recipeId);
    assert.ok(honks.every((honk) => !honk.members && !honk.lockGroupId), recipeId);
  }
});

test("every chord and preset reaches the ordinary pending preview as independent Honks", () => {
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
  const catalog = new SpawnCatalog();
  const placement = new SpawnPlacementController({
    scene: {},
    createEntry: (entry) => spawner.spawn(entry.recipeId),
    previewFactory: (options) => ({ ...options, cancel: () => {} }),
  });
  const controller = {};
  for (const [recipeId, expectedTunings] of Object.entries(EXPECTED_TUNINGS)) {
    const catalogEntry = catalog.get(recipeId);
    const preview = placement.begin(controller, catalogEntry);
    assert.strictEqual(preview.catalogEntry, catalogEntry);
    assert.strictEqual(preview.controller, controller);
    assert.equal(preview.instruments.length, expectedTunings.length, recipeId);
    assert.ok(preview.instruments.every(({ kind }) => kind === "honk"), recipeId);
  }
});

function vector(...initial) {
  let values = initial.length > 0 ? initial : [0, 0, 0];
  return {
    fromArray(next) { values = [...next]; return this; },
    toArray() { return [...values]; },
  };
}
