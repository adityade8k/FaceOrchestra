import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Group } from "three";
import { FontLoader } from "three/addons/loaders/FontLoader.js";
import { HonkPresentationRuntime } from "../../src/app/runtime/HonkPresentationRuntime.js";
import { InstrumentRegistry } from "../../src/instruments/core/InstrumentRegistry.js";
import { HonkInstrument } from "../../src/instruments/honk/HonkInstrument.js";
import { LabelGeometryPool } from "../../src/scene/LabelGeometryPool.js";
const font = new FontLoader().parse(
  JSON.parse(
    readFileSync(new URL("../../model/fonts/helvetiker_regular.typeface.json", import.meta.url)),
  ),
);
test("identical labels share geometry until the last owner releases it", () => {
  const pool = new LabelGeometryPool(),
    settings = { size: 0.06, depth: 0.003, curveSegments: 4 };
  const first = pool.acquire(font, "F4", settings),
    second = pool.acquire(font, "F4", settings);
  assert.equal(first, second);
  let disposed = 0;
  first.addEventListener("dispose", () => disposed++);
  pool.release(first);
  assert.equal(disposed, 0);
  pool.release(second);
  assert.equal(disposed, 1);
  assert.equal(pool.entries.size, 0);
  assert.equal(pool.fonts.size, 0);
  pool.dispose();
  assert.equal(disposed, 1);
});
test("font size and text changes cannot mutate another label", () => {
  const pool = new LabelGeometryPool(),
    settings = { size: 0.06, depth: 0.003, curveSegments: 4 };
  const a = pool.acquire(font, "F4", settings),
    b = pool.acquire(font, "F4", { ...settings, size: 0.12 }),
    c = pool.acquire(font, "G4", settings);
  assert.notEqual(a, b);
  assert.notEqual(a, c);
  assert.ok(b.boundingBox.max.x > a.boundingBox.max.x);
  pool.dispose();
  assert.equal(pool.entries.size, 0);
});

test("entity deletion and survivor retuning release shared labels and private materials exactly once", () => {
  const registry = new InstrumentRegistry();
  const presentation = new HonkPresentationRuntime({ noteFont: font });
  const instruments = ["first", "survivor"].map((id) => {
    const honk = new HonkInstrument({
      id,
      root: new Group(),
      warnMissingExpectedMorphs: false,
    });
    registry.add(honk, { initialize: false });
    presentation.createNoteLabel(honk);
    return honk;
  });
  const [first, survivor] = instruments;
  const originalGeometry = first.noteLabelMesh.geometry;
  const originalMaterials = instruments.map((h) => h.noteLabelMesh.material);
  assert.equal(survivor.noteLabelMesh.geometry, originalGeometry);
  assert.notEqual(...originalMaterials);
  let geometryDisposals = 0;
  const materialDisposals = [0, 0];
  originalGeometry.addEventListener("dispose", () => geometryDisposals++);
  originalMaterials.forEach((material, index) =>
    material.addEventListener("dispose", () => materialDisposals[index]++),
  );

  registry.remove(first);
  assert.equal(geometryDisposals, 0, "A surviving label keeps its shared geometry");
  assert.deepEqual(materialDisposals, [1, 0]);
  assert.equal(survivor.noteLabelMesh.parent, survivor.noteLabelGroup);

  survivor.scalePresetNote = "G";
  presentation.updateNoteLabel(survivor);
  const nextGeometry = survivor.noteLabelMesh.geometry;
  let nextGeometryDisposals = 0,
    nextMaterialDisposals = 0;
  nextGeometry.addEventListener("dispose", () => nextGeometryDisposals++);
  survivor.noteLabelMesh.material.addEventListener("dispose", () => nextMaterialDisposals++);
  assert.notEqual(nextGeometry, originalGeometry);
  assert.equal(geometryDisposals, 1, "Retuning releases the last reference to the old text");
  assert.deepEqual(materialDisposals, [1, 1]);

  registry.remove(survivor);
  first.dispose();
  survivor.dispose();
  presentation.labelGeometries.dispose();
  assert.equal(nextGeometryDisposals, 1);
  assert.equal(nextMaterialDisposals, 1);
  assert.equal(geometryDisposals, 1);
  assert.deepEqual(materialDisposals, [1, 1]);
  assert.equal(presentation.labelGeometries.entries.size, 0);
  assert.equal(presentation.labelGeometries.fonts.size, 0);
});
