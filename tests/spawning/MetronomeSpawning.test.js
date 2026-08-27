import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ASSET_PATHS } from "../../src/config/assets.js";
import { SPAWN_CATALOG_ENTRIES } from "../../src/config/spawning.js";
import { SpawnCatalog, resolveCatalogInstrumentSpawn } from "../../src/spawning/SpawnCatalog.js";

test("metronome remains visible in the spawn catalog and uses its GLB model", () => {
  const entry = SPAWN_CATALOG_ENTRIES.find(({ id }) => id === "metronome");
  assert.equal(ASSET_PATHS.models.metronome, "./model/metronome/metronome_02.glb");
  assert.equal(entry.modelPath, ASSET_PATHS.models.metronome);
  assert.notEqual(entry.visibleInRadial, false);
});

test("Metronome 93 preset reuses the canonical template and enters preview at 93 BPM", () => {
  const entry = new SpawnCatalog().get("preset-metronome-93");
  assert.deepEqual(
    resolveCatalogInstrumentSpawn(entry, entry.id),
    { componentId: "metronome", options: { bpm: 93 } },
  );

  const spawnSource = readFileSync(
    new URL("../../src/app/runtime/SpawnRuntime.js", import.meta.url),
    "utf8",
  );
  assert.match(spawnSource, /createPendingSpawnComponents[\s\S]*resolveCatalogInstrumentSpawn\(entry, componentId\)/);
});

test("metronome creation paths do not enforce a single-instance guard", () => {
  const assetSource = readFileSync(
    new URL("../../src/app/runtime/InstrumentAssetRuntime.js", import.meta.url),
    "utf8",
  );
  const spawnSource = readFileSync(
    new URL("../../src/app/runtime/SpawnRuntime.js", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(assetSource, /getByKind\(["']metronome["']\)\.length\s*>\s*0/);
  const guards = spawnSource.match(/getByKind\(["']metronome["']\)\.length\s*>\s*0/g) || [];
  assert.equal(guards.length, 1, "only the default-metronome existence check should remain");
  assert.match(spawnSource, /spawnDefaultInstrumentPreview\(\)[\s\S]*getByKind\("metronome"\)\.length > 0/);
});

test("explicit component requests never silently fall back to the Honk template", () => {
  const source = readFileSync(
    new URL("../../src/app/runtime/InstrumentAssetRuntime.js", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(
    source,
    /componentTemplates\.get\(componentId\)\s*\|\|\s*this\.componentTemplates\.get\(["']honk["']\)/,
  );
  assert.match(source, /Cannot spawn component/);
});

test("height-map materials apply a custom bump scale without crashing", async () => {
  const source = readFileSync(
    new URL("../../src/scene/materialUtils.js", import.meta.url),
    "utf8",
  );
  const testableSource = source.replace(
    'import * as THREE from "three";',
    `const THREE = {
      DoubleSide: Symbol("DoubleSide"),
      MeshStandardMaterial: class {
        constructor(parameters) {
          Object.assign(this, parameters);
        }
      },
    };`,
  );
  assert.notEqual(testableSource, source, "the Three.js import must be replaced by the test stub");

  const moduleUrl = `data:text/javascript;base64,${Buffer.from(testableSource).toString("base64")}`;
  const { makeStandardInstrumentMaterial } = await import(moduleUrl);
  const heightMap = { name: "metronome-height-map" };
  const material = makeStandardInstrumentMaterial(
    null,
    { heightMap },
    { bumpScale: 0.123, useSourceMaterialMaps: false },
  );

  assert.equal(material.bumpMap, heightMap);
  assert.equal(material.bumpScale, 0.123);
});

test("metronome playback is routed through eye buttons instead of the body target", () => {
  const source = readFileSync(
    new URL("../../src/app/runtime/XRInteractionRuntime.js", import.meta.url),
    "utf8",
  );
  assert.match(source, /metronomeButtonAction[\s\S]*pressButton\(metronomeButtonAction/);
  assert.doesNotMatch(source, /metronomeState\.toggle\(\)/);
  assert.doesNotMatch(source, /lockedInstrumentState\.toggle\(\)/);
});
