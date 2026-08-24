import assert from "node:assert/strict";
import test from "node:test";

import { SPAWN_CATALOG_ENTRIES } from "../../src/config/spawning.js";
import { SpawnCatalog } from "../../src/spawning/SpawnCatalog.js";
import { SpawnPlacementController } from "../../src/spawning/SpawnPlacementController.js";

const EXPECTED = Object.freeze({
  Instruments: ["honk", "looper", "metronome"],
  Scales: ["honk-cmajor", "honk-fminor", "honk-fsharpminor"],
  Chords: ["chord-cmajor", "chord-gmajor", "chord-fmajor", "chord-aminor"],
  Presets: ["preset-cmajor-two-octaves"],
});

test("radial categories have the required order and exact leaf IDs", () => {
  const categories = new SpawnCatalog().getRadialCategories();
  assert.deepEqual(categories.map(({ label }) => label), Object.keys(EXPECTED));
  for (const category of categories) {
    assert.deepEqual(category.entries.map(({ id }) => id), EXPECTED[category.label]);
  }
});

test("radial categories reuse canonical leaf objects and never expose Stick", () => {
  const catalog = new SpawnCatalog();
  const radialEntries = catalog.getRadialCategories().flatMap(({ entries }) => entries);
  assert.ok(radialEntries.every((entry) => catalog.get(entry.id) === entry));
  assert.equal(radialEntries.some(({ id }) => id === "stick"), false);
  assert.equal(catalog.get("stick").visibleInRadial, false);
});

test("navigation-only category IDs can never resolve as spawn commands", () => {
  const catalog = new SpawnCatalog();
  for (const category of catalog.getRadialCategories()) {
    assert.equal(catalog.get(category.id), null);
    assert.equal(category.action, undefined);
    assert.equal(category.recipeId, undefined);
  }
});

test("radial hierarchy validation rejects missing, hidden, and duplicate child IDs", () => {
  const category = (childIds) => [{ id: "category-test", label: "Test", color: 0, childIds }];
  assert.throws(
    () => new SpawnCatalog(SPAWN_CATALOG_ENTRIES, category(["missing"])),
    /Missing radial child entry: missing/,
  );
  assert.throws(
    () => new SpawnCatalog(SPAWN_CATALOG_ENTRIES, category(["stick"])),
    /Hidden catalog entry cannot be a radial child: stick/,
  );
  assert.throws(
    () => new SpawnCatalog(SPAWN_CATALOG_ENTRIES, category(["honk", "honk"])),
    /Duplicate radial child ID: honk/,
  );
});

test("all instrument, scale, chord, and preset leaves retain the existing action pipeline", () => {
  const catalog = new SpawnCatalog();
  assert.deepEqual(
    ["honk", "looper", "metronome"].map((id) => catalog.get(id).action),
    ["instrument", "instrument", "instrument"],
  );
  for (const id of [...EXPECTED.Scales, ...EXPECTED.Chords, ...EXPECTED.Presets]) {
    const entry = catalog.get(id);
    assert.equal(entry.action, "formation");
    assert.equal(entry.recipeId, id);
  }
});

test("every hierarchical leaf enters the same placement controller", () => {
  const catalog = new SpawnCatalog();
  const leaves = catalog.getRadialCategories().flatMap(({ entries }) => entries);
  const seen = [];
  const placement = new SpawnPlacementController({
    scene: {},
    createEntry(entry) {
      seen.push(entry);
      return [{ id: `pending-${entry.id}` }];
    },
    previewFactory: ({ controller, instruments, catalogEntry }) => ({
      controller,
      instruments,
      catalogEntry,
      cancel: () => {},
    }),
  });
  const controller = {};
  for (const leaf of leaves) {
    const preview = placement.begin(controller, leaf);
    assert.strictEqual(preview.catalogEntry, leaf);
    assert.strictEqual(preview.controller, controller);
  }
  assert.deepEqual(seen, leaves);
});
