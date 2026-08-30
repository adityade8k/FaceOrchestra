import test from "node:test";
import assert from "node:assert/strict";

import {
  applyPendingSpawnVisualsToState,
  restorePendingSpawnVisualsToState,
} from "../../src/spawning/pendingSpawnVisuals.js";

test("a visible grip mesh that is also a hit target receives spawn glass", () => {
  const { state, presentation, originalMaterial } = createPreviewState("honk");

  apply(state);

  assert.equal(presentation.visible, true);
  assert.notEqual(presentation.material, originalMaterial);
  assert.equal(presentation.material.name, "PendingSpawnGlass");
  assert.equal(presentation.material.transparent, true);
});

test("procedural targets and debug interaction geometry are hidden from the preview", () => {
  const { state, proceduralTarget } = createPreviewState("honk");
  const debugGroup = object3D({ userData: { isMetronomeDebug: true } });
  const debugMesh = mesh(material("debug"));
  add(debugGroup, debugMesh);
  add(state.root, debugGroup);

  apply(state);

  assert.equal(proceduralTarget.visible, false);
  assert.equal(debugGroup.visible, false);
  assert.equal(debugMesh.visible, false);
});

test("placement restores exact material, visibility, shadows, and render order", () => {
  const { state, presentation, originalMaterial, proceduralTarget } = createPreviewState("metronome");
  presentation.castShadow = true;
  presentation.receiveShadow = true;
  presentation.renderOrder = 7;
  apply(state);

  restore(state);

  assert.equal(presentation.material, originalMaterial);
  assert.equal(presentation.visible, true);
  assert.equal(presentation.castShadow, true);
  assert.equal(presentation.receiveShadow, true);
  assert.equal(presentation.renderOrder, 7);
  assert.equal(proceduralTarget.visible, true);
});

test("cancellation restores the original material and visibility", () => {
  const { state, presentation, originalMaterial, proceduralTarget } = createPreviewState("honk");
  proceduralTarget.visible = false;
  apply(state);

  restore(state);

  assert.equal(presentation.material, originalMaterial);
  assert.equal(presentation.visible, true);
  assert.equal(proceduralTarget.visible, false);
});

test("material arrays restore by identity and in their original order", () => {
  const { state, presentation } = createPreviewState("looper");
  const originals = [material("red"), material("green")];
  presentation.material = originals;

  apply(state);
  assert.equal(Array.isArray(presentation.material), true);
  assert.equal(presentation.material.length, 2);
  assert.notEqual(presentation.material[0], originals[0]);

  restore(state);
  assert.equal(presentation.material, originals);
  assert.equal(presentation.material[0], originals[0]);
  assert.equal(presentation.material[1], originals[1]);
});

test("reapplying preview visuals does not wrap preview materials again", () => {
  const { state, presentation, originalMaterial } = createPreviewState("honk");
  apply(state);
  const firstPreviewMaterial = presentation.material;

  apply(state);

  assert.equal(presentation.material, firstPreviewMaterial);
  assert.equal(presentation.userData.pendingSpawnOriginalMaterial, originalMaterial);
  restore(state);
  assert.equal(presentation.material, originalMaterial);
});

test("Honk, Looper, and Metronome visible grip meshes remain visible in preview", () => {
  for (const kind of ["honk", "looper", "metronome"]) {
    const { state, presentation } = createPreviewState(kind);
    apply(state);
    assert.equal(presentation.visible, true, `${kind} presentation was hidden`);
    assert.equal(presentation.material.name, "PendingSpawnGlass");
    restore(state);
  }
});

function createPreviewState(kind) {
  const root = object3D();
  const originalMaterial = material(`${kind}-original`);
  const presentation = mesh(originalMaterial, {
    name: `${kind}_visible_presentation`,
    userData: {
      isHitTarget: true,
      isBodyGripTarget: true,
      usesVisibleMeshForGrip: true,
    },
  });
  const proceduralTarget = mesh(material(`${kind}-collider`), {
    name: `${kind}_procedural_target`,
    userData: { isHitTarget: true },
  });
  add(root, presentation, proceduralTarget);
  return {
    state: { kind, root, raycastTargetsDirty: false },
    presentation,
    proceduralTarget,
    originalMaterial,
  };
}

function object3D(overrides = {}) {
  return {
    name: "",
    userData: {},
    visible: true,
    isMesh: false,
    children: [],
    parent: null,
    ...overrides,
    traverse(visitor) {
      visitor(this);
      for (const child of this.children) child.traverse(visitor);
    },
  };
}

function mesh(sourceMaterial, overrides = {}) {
  return object3D({
    isMesh: true,
    material: sourceMaterial,
    castShadow: false,
    receiveShadow: false,
    renderOrder: 0,
    ...overrides,
  });
}

function add(parent, ...children) {
  for (const child of children) {
    child.parent = parent;
    parent.children.push(child);
  }
}

function material(name) {
  return { name, userData: {} };
}

function apply(state) {
  applyPendingSpawnVisualsToState(state, {
    createPreviewMaterial: (sourceMaterial) => ({
      name: "PendingSpawnGlass",
      transparent: true,
      sourceMaterial,
      disposed: false,
    }),
    renderOrder: 60,
  });
}

function restore(state) {
  restorePendingSpawnVisualsToState(state, {
    disposePreviewMaterials: (materials) => {
      for (const preview of Array.isArray(materials) ? materials : [materials]) {
        preview.disposed = true;
      }
    },
  });
}
