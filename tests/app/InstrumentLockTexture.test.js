import test from "node:test";
import assert from "node:assert/strict";

import {
  applyInstrumentLockedTexture,
  resolveInstrumentLockTextureSet,
} from "../../src/scene/instrumentLockTexturePolicy.js";
import { createBodyGripTarget } from "../../src/instruments/core/BodyGripTargetFactory.js";

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

test("visible body-grip meshes swap Honk and Looper textures without touching colliders or clones", () => {
  const runtime = createRuntime();

  for (const [kind, textureSet] of [
    ["honk", runtime.instrumentMaterialTextures],
    ["looper", runtime.looperMaterialTextures],
  ]) {
    const sharedTemplateMaterial = createDetailedMaterial(textureSet.baseMap);
    const arrayMaterial = createDetailedMaterial(textureSet.baseMap);
    const visibleMesh = createMesh(`${kind}-visible`, [sharedTemplateMaterial, arrayMaterial]);
    visibleMesh.isSkinnedMesh = true;
    visibleMesh.morphTargetInfluences = [0.25, 0.75];
    const colliderMaterial = createDetailedMaterial({ id: `${kind}-collider` });
    const collider = createMesh(`${kind}-collider`, colliderMaterial, {
      userData: { isHitTarget: true, isProceduralMorphTarget: true },
    });
    const instrument = createTraversedInstrument(kind, [visibleMesh, collider]);

    const untouchedCloneMesh = createMesh(`${kind}-clone`, sharedTemplateMaterial);
    const untouchedClone = createTraversedInstrument(kind, [untouchedCloneMesh]);
    createBodyGripTarget(untouchedClone.root, {});
    createBodyGripTarget(instrument.root, {});

    assert.equal(visibleMesh.userData.isHitTarget, true);
    assert.equal(visibleMesh.userData.usesVisibleMeshForGrip, true);
    assert.equal(collider.userData.usesVisibleMeshForGrip, undefined);

    assert.equal(applyInstrumentLockedTexture(instrument, true, textureSet, {
      swapMaterial: cloneAndSwapMaterial,
    }), true);
    assert.deepEqual(visibleMesh.material.map((material) => material.map), [
      textureSet.lockedBaseMap,
      textureSet.lockedBaseMap,
    ]);
    assert.equal(instrument.lockedTextureApplied, true);
    assert.equal(collider.material, colliderMaterial);
    assert.equal(untouchedCloneMesh.material, sharedTemplateMaterial);
    assert.equal(untouchedCloneMesh.material.map, textureSet.baseMap);
    assert.equal(sharedTemplateMaterial.disposeCalls, 0);
    assert.equal(visibleMesh.isSkinnedMesh, true);
    assert.deepEqual(visibleMesh.morphTargetInfluences, [0.25, 0.75]);
    for (const material of visibleMesh.material) {
      assert.equal(material.normalMap.id, "normal-map");
      assert.equal(material.roughness, 0.37);
      assert.equal(material.metalness, 0.12);
    }

    assert.equal(applyInstrumentLockedTexture(instrument, false, textureSet, {
      swapMaterial: cloneAndSwapMaterial,
    }), true);
    assert.deepEqual(visibleMesh.material.map((material) => material.map), [
      textureSet.baseMap,
      textureSet.baseMap,
    ]);
    assert.equal(instrument.lockedTextureApplied, false);
    assert.equal(collider.material, colliderMaterial);
    assert.equal(untouchedClone.lockedTextureApplied, undefined);
  }
});

test("a traversal with only procedural hit targets reports failure without changing bookkeeping", () => {
  const runtime = createRuntime();
  const collider = createMesh("procedural-collider", createDetailedMaterial({ id: "collider" }), {
    userData: { isHitTarget: true },
  });
  const instrument = createTraversedInstrument("honk", [collider]);

  assert.equal(applyInstrumentLockedTexture(
    instrument,
    true,
    runtime.instrumentMaterialTextures,
    { swapMaterial: cloneAndSwapMaterial },
  ), false);
  assert.equal(instrument.lockedTextureApplied, undefined);
});

function createDetailedMaterial(map) {
  return {
    map,
    normalMap: { id: "normal-map" },
    roughness: 0.37,
    metalness: 0.12,
    userData: {},
    disposeCalls: 0,
    clone() {
      return {
        ...this,
        userData: { ...this.userData },
        disposeCalls: 0,
      };
    },
    dispose() {
      this.disposeCalls += 1;
    },
  };
}

function createMesh(name, material, overrides = {}) {
  return {
    isMesh: true,
    visible: true,
    name,
    material,
    userData: {},
    ...overrides,
  };
}

function createTraversedInstrument(kind, objects) {
  return {
    kind,
    root: {
      traverse(callback) {
        for (const object of objects) callback(object);
      },
    },
  };
}

function cloneAndSwapMaterial(material, targetMap) {
  const target = material.userData.lockTextureUniqueMaterial ? material : material.clone();
  target.userData.lockTextureUniqueMaterial = true;
  target.map = targetMap;
  return target;
}
