import test from "node:test";
import assert from "node:assert/strict";

import {
  createRepositoryLooperCalibration,
  parseLooperCalibration,
  serializeLooperCalibration,
} from "../../src/editor/calibration/looperCalibrationSchema.js";
import {
  applyCenterGizmoPosition,
  colliderGizmoPositionForValue,
} from "../../src/editor/calibration/looperArcEditorMath.js";
import { resolveArcMotion, setArcOrbitRadius } from "../../src/instruments/core/arcMotionMath.js";

test("Looper editor schema import/export round-trips without positional drift", () => {
  const state = createRepositoryLooperCalibration();
  state.looper.controlColliders.volume.arc.center.x += 0.012345678;
  state.looper.controlColliders.gap.arc.colliderOffset.y += 0.004321;
  const serialized = serializeLooperCalibration(state);
  const imported = parseLooperCalibration(serialized);
  assert.equal(serializeLooperCalibration(imported), serialized);
});

test("center gizmo conversion preserves the collider offset", () => {
  const arc = createRepositoryLooperCalibration().looper.controlColliders.volume.arc;
  const moved = applyCenterGizmoPosition(arc, { x: 2, y: 3, z: 4 });
  assert.deepEqual(moved.center, { x: 2, y: 3, z: 4 });
  assert.deepEqual(moved.colliderOffset, arc.colliderOffset);
});

test("plane-radius editing scales the Looper assembly path at every preview value", () => {
  const arc = createRepositoryLooperCalibration().looper.controlColliders.gap.arc;
  const resized = setArcOrbitRadius(arc, resolveArcMotion(arc).orbitRadius * 1.5);
  for (const value of [-1, -0.4, 0, 0.7, 1]) {
    const before = colliderGizmoPositionForValue(arc, value);
    const after = colliderGizmoPositionForValue(resized, value);
    assert.ok(Math.abs(Math.hypot(after.x, after.y, after.z) / Math.hypot(before.x, before.y, before.z) - 1.5) < 1e-9);
  }
});
