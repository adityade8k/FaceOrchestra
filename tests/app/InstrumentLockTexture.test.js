import test from "node:test";
import assert from "node:assert/strict";

import {
  applyInstrumentLockedTexture,
  resolveInstrumentLockTextureSet,
} from "../../src/scene/instrumentLockTexturePolicy.js";

function createRuntime() {
  return {
    instrumentMaterialTextures: {
      baseMap: { id: "honk-normal" },
      lockedBaseMap: { id: "honk-locked" },
    },
    looperMaterialTextures: {
      baseMap: { id: "looper-normal" },
      lockedBaseMap: { id: "looper-locked" },
    },
  };
}

function createMaterial(map) {
  return {
    map,
    userData: {},
    clone() {
      return createMaterial(this.map);
    },
  };
}

function createInstrument(kind, map) {
  const mesh = {
    isMesh: true,
    name: `${kind}-mesh`,
    material: createMaterial(map),
    userData: {},
  };
  return {
    instrument: {
      kind,
      root: {
        traverse(callback) {
          callback(mesh);
        },
      },
    },
    mesh,
  };
}

test("lock texture policy resolves Honks and Loopers explicitly but never Metronomes", () => {
  const runtime = createRuntime();
  const resolve = (instrument) => resolveInstrumentLockTextureSet(instrument, {
    honk: runtime.instrumentMaterialTextures,
    looper: runtime.looperMaterialTextures,
  });

  assert.equal(
    resolve({ kind: "honk" }),
    runtime.instrumentMaterialTextures,
  );
  assert.equal(
    resolve({ kind: "looper" }),
    runtime.looperMaterialTextures,
  );
  assert.equal(resolve({ kind: "metronome" }), null);
  assert.equal(resolve({ kind: "future-instrument" }), null);
});

test("locking and unlocking a Metronome preserves its authored material and map identity", () => {
  const runtime = createRuntime();
  const authoredMap = { id: "metronome-authored" };
  const { instrument, mesh } = createInstrument("metronome", authoredMap);
  const authoredMaterial = mesh.material;

  const swapMaterial = (material, targetMap) => {
    const clone = material.clone();
    clone.map = targetMap;
    return clone;
  };

  applyInstrumentLockedTexture(instrument, true, null, { swapMaterial });
  assert.equal(mesh.material, authoredMaterial);
  assert.equal(mesh.material.map, authoredMap);

  applyInstrumentLockedTexture(instrument, false, null, { swapMaterial });
  assert.equal(mesh.material, authoredMaterial);
  assert.equal(mesh.material.map, authoredMap);
  assert.equal(instrument.lockedTextureApplied, undefined);
});

test("Honk and Looper lock swaps retain their existing normal and locked maps", () => {
  const runtime = createRuntime();

  for (const [kind, textureSet] of [
    ["honk", runtime.instrumentMaterialTextures],
    ["looper", runtime.looperMaterialTextures],
  ]) {
    const { instrument, mesh } = createInstrument(kind, textureSet.baseMap);

    const swapMaterial = (material, targetMap) => {
      const clone = material.clone();
      clone.map = targetMap;
      return clone;
    };

    applyInstrumentLockedTexture(instrument, true, textureSet, { swapMaterial });
    assert.equal(mesh.material.map, textureSet.lockedBaseMap);
    assert.equal(instrument.lockedTextureApplied, true);

    applyInstrumentLockedTexture(instrument, false, textureSet, { swapMaterial });
    assert.equal(mesh.material.map, textureSet.baseMap);
    assert.equal(instrument.lockedTextureApplied, false);
  }
});
