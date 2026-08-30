import test from "node:test";
import assert from "node:assert/strict";

import { INTERACTION_TARGET_NAMES } from "../../../src/config/honk.js";
import { createBodyGripTarget } from "../../../src/instruments/core/BodyGripTargetFactory.js";

test("body grip uses imported visible meshes without creating or mutating collider resources", () => {
  const materialA = { id: "material-a" };
  const materialB = { id: "material-b" };
  const geometryA = { id: "geometry-a" };
  const geometryB = { id: "geometry-b" };
  const bodyA = mesh("authored_body_a", geometryA, materialA);
  const bodyB = mesh("authored_body_b", geometryB, materialB);
  const hidden = mesh("authored_hidden", {}, {}, { visible: false });
  const procedural = mesh("HIT_control", {}, {}, { userData: { isHitTarget: true } });
  const objects = [bodyA, bodyB, hidden, procedural];
  const root = {
    traverse(visitor) { for (const object of objects) visitor(object); },
    add() { throw new Error("body grip must not add procedural geometry"); },
  };
  const hitTargets = {};

  const primary = createBodyGripTarget(root, hitTargets, { interactionRole: "test.body" });

  assert.equal(primary, bodyA);
  assert.equal(hitTargets[INTERACTION_TARGET_NAMES.body], bodyA);
  for (const body of [bodyA, bodyB]) {
    assert.equal(body.userData.isHitTarget, true);
    assert.equal(body.userData.isBodyGripTarget, true);
    assert.equal(body.userData.usesVisibleMeshForGrip, true);
    assert.equal(body.userData.interactionRole, "test.body");
  }
  assert.equal(bodyA.name, "authored_body_a");
  assert.equal(bodyA.geometry, geometryA);
  assert.equal(bodyA.material, materialA);
  assert.equal(bodyB.name, "authored_body_b");
  assert.equal(bodyB.geometry, geometryB);
  assert.equal(bodyB.material, materialB);
  assert.equal(hidden.userData.isBodyGripTarget, undefined);
  assert.equal(procedural.userData.isBodyGripTarget, undefined);
});

test("body grip returns null when an instrument has no eligible visible mesh", () => {
  const hitTargets = {};
  const root = {
    traverse(visitor) {
      visitor(mesh("hidden", {}, {}, { visible: false }));
      visitor(mesh("EDITOR_helper", {}, {}));
    },
  };
  assert.equal(createBodyGripTarget(root, hitTargets), null);
  assert.deepEqual(hitTargets, {});
});

function mesh(name, geometry, material, overrides = {}) {
  return {
    isMesh: true,
    name,
    visible: true,
    geometry,
    material,
    userData: {},
    ...overrides,
  };
}
