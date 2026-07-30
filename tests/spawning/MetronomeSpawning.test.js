import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ASSET_PATHS } from "../../src/config/assets.js";
import { SPAWN_CATALOG_ENTRIES } from "../../src/config/spawning.js";

test("metronome remains visible in the spawn catalog and uses its GLB model", () => {
  const entry = SPAWN_CATALOG_ENTRIES.find(({ id }) => id === "metronome");
  assert.equal(ASSET_PATHS.models.metronome, "./model/metronome/scene.glb");
  assert.equal(entry.modelPath, ASSET_PATHS.models.metronome);
  assert.notEqual(entry.visibleInRadial, false);
});

test("metronome creation paths do not enforce a single-instance guard", () => {
  for (const path of [
    "src/app/runtime/InstrumentAssetRuntime.js",
    "src/app/runtime/SpawnRuntime.js",
  ]) {
    const source = readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /getByKind\(["']metronome["']\)\.length\s*>\s*0/);
  }
});
