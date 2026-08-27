import assert from "node:assert/strict";
import test from "node:test";

import { SPAWN_CATALOG_ENTRIES } from "../../src/config/spawning.js";
import { SpawnCatalog } from "../../src/spawning/SpawnCatalog.js";
import { SpawnPlacementController } from "../../src/spawning/SpawnPlacementController.js";

const EXPECTED = Object.freeze({
  Instruments: ["honk", "looper", "metronome"],
  Scales: ["honk-cmajor", "honk-fminor", "honk-fsharpminor"],
  Chords: ["chord-aminor", "chord-emajor", "chord-cmajor", "chord-dminor"],
  Presets: [
    "preset-quiet",
    "preset-melody",
    "preset-bass",
    "preset-decoration",
    "preset-still-believe",
    "preset-metronome-93",
  ],
});

const EXPECTED_LABELS = Object.freeze({
  Chords: ["A Minor", "E Major", "C Major", "D Minor"],
  Presets: ["Quiet", "Melody", "Bass", "Decoration", "Still Believe", "Metronome 93"],
});

test("radial categories have the required order and exact leaf IDs", () => {
  const categories = new SpawnCatalog().getRadialCategories();
  assert.deepEqual(categories.map(({ label }) => label), Object.keys(EXPECTED));
  for (const category of categories) {
    assert.deepEqual(category.entries.map(({ id }) => id), EXPECTED[category.label]);
  }
  for (const category of categories.filter(({ label }) => EXPECTED_LABELS[label])) {
    assert.deepEqual(category.entries.map(({ label }) => label), EXPECTED_LABELS[category.label]);
  }
});

test("obsolete chord and preset IDs are absent from the radial hierarchy", () => {
  const radialIds = new SpawnCatalog().getRadialCategories().flatMap(({ entries }) => entries.map(({ id }) => id));
  for (const obsoleteId of ["chord-gmajor", "chord-fmajor", "preset-cmajor-two-octaves"]) {
    assert.equal(radialIds.includes(obsoleteId), false);
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

test("all instrument, formation, and Metronome 93 leaves retain the existing action pipeline", () => {
  const catalog = new SpawnCatalog();
  assert.deepEqual(
    ["honk", "looper", "metronome"].map((id) => catalog.get(id).action),
    ["instrument", "instrument", "instrument"],
  );
  const honkPresetIds = EXPECTED.Presets.filter((id) => id !== "preset-metronome-93");
  for (const id of [...EXPECTED.Scales, ...EXPECTED.Chords, ...honkPresetIds]) {
    const entry = catalog.get(id);
    assert.equal(entry.action, "formation");
    assert.equal(entry.recipeId, id);
  }
  assert.deepEqual(
    catalog.get("preset-metronome-93"),
    Object.freeze({
      id: "preset-metronome-93",
      label: "Metronome 93",
      action: "instrument",
      kind: "metronome",
      componentId: "metronome",
      bpm: 93,
      color: 0xffd166,
    }),
  );
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
