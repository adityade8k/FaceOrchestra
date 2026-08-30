import test from "node:test";
import assert from "node:assert/strict";

import {
  colliderScaleToRadius,
  modelPositionToNormalized,
  normalizeCalibrationAxis,
  normalizedPositionToModel,
  radiusToColliderScale,
  roundCalibrationNumber,
} from "../../src/instruments/core/calibrationMath.js";
import {
  handleCenterFromPivotPosition,
  handlePivotPositionFromCenter,
  mapHandleValueToAngles,
  projectHandleColliderOffset,
} from "../../src/editor/calibration/handleCalibrationMath.js";

test("bounds-normalized positions convert to model space", () => {
  assert.deepEqual(
    normalizedPositionToModel(
      { x: -0.62, y: -0.25, z: 0.01 },
      { x: 2, y: 3, z: 4 },
      { x: 10, y: 20, z: 30 },
    ),
    { x: -4.2, y: -2, z: 4.3 },
  );
});

test("model and normalized positions round-trip", () => {
  const normalized = { x: 0.39, y: -0.28, z: 0.005 };
  const center = { x: -1.2, y: 5, z: 0.25 };
  const size = { x: 4.5, y: 9.25, z: 2 };
  const model = normalizedPositionToModel(normalized, center, size);
  const roundTrip = modelPositionToNormalized(model, center, size);
  for (const axis of ["x", "y", "z"]) assert.ok(Math.abs(roundTrip[axis] - normalized[axis]) < 1e-12);
});

test("collider radius and normalized scale round-trip", () => {
  const radius = colliderScaleToRadius(0.035, 12.5);
  assert.equal(radius, 0.43750000000000006);
  assert.equal(radiusToColliderScale(radius, 12.5), 0.035);
});

test("zero-size bounds and dimensions fail explicitly", () => {
  assert.throws(
    () => modelPositionToNormalized(
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 1 },
    ),
    /bounds size\.y is zero/,
  );
  assert.throws(() => colliderScaleToRadius(0.1, 0), /greater than zero/);
  assert.throws(() => radiusToColliderScale(1, 0), /greater than zero/);
});

test("axes normalize and reject zero-length vectors", () => {
  assert.deepEqual(normalizeCalibrationAxis({ x: 0, y: 3, z: 4 }), { x: 0, y: 0.6, z: 0.8 });
  assert.throws(() => normalizeCalibrationAxis({ x: 0, y: 0, z: 0 }), /zero-length/);
});

test("handle offsets use the runtime plane projection", () => {
  const result = projectHandleColliderOffset(
    { x: 4, y: 9, z: -3 },
    { x: 0, y: 2, z: 0 },
    "volume",
  );
  assert.deepEqual(result.projectedOffset, { x: 4, y: 0, z: -3 });
  assert.equal(result.orbitRadius, 5);
  assert.deepEqual(result.neutralDirection, { x: 0.8, y: 0, z: -0.6 });
  assert.throws(
    () => projectHandleColliderOffset({ x: 0, y: 2, z: 0 }, { x: 0, y: 1, z: 0 }),
    /non-zero orbit radius/,
  );
});

test("Metronome assembly center and gizmo position round-trip through the GLB rest frame", () => {
  const center = { x: 1, y: 2, z: 3 };
  const restPosition = { x: 10, y: 20, z: 30 };
  const restQuaternion = { x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 };
  const restScale = { x: 2, y: 3, z: 4 };
  const pivot = handlePivotPositionFromCenter(center, restPosition, restQuaternion, restScale);
  closeVector(pivot, { x: 4, y: 22, z: 42 });
  closeVector(
    handleCenterFromPivotPosition(pivot, restPosition, restQuaternion, restScale),
    center,
  );
  assert.throws(
    () => handleCenterFromPivotPosition(pivot, restPosition, restQuaternion, { x: 1, y: 0, z: 1 }),
    /scale\.y cannot be zero/,
  );
});

test("handle min, max, and reference angles map exactly", () => {
  const minimum = mapHandleValueToAngles({
    value: 30, valueMin: 30, valueMax: 240,
    minAngleDegrees: -50, maxAngleDegrees: 90, referenceAngleDegrees: 10,
  });
  const maximum = mapHandleValueToAngles({
    value: 240, valueMin: 30, valueMax: 240,
    minAngleDegrees: -50, maxAngleDegrees: 90, referenceAngleDegrees: 10,
  });
  assert.ok(Math.abs(minimum.movementAngleRadians - (-50 * Math.PI / 180)) < 1e-12);
  assert.ok(Math.abs(minimum.appliedAngleRadians - (-40 * Math.PI / 180)) < 1e-12);
  assert.ok(Math.abs(maximum.movementAngleRadians - (90 * Math.PI / 180)) < 1e-12);
  assert.ok(Math.abs(maximum.appliedAngleRadians - (100 * Math.PI / 180)) < 1e-12);
});

test("export rounding is stable and removes negative zero", () => {
  assert.equal(roundCalibrationNumber(1.23456789, 6), 1.234568);
  assert.equal(roundCalibrationNumber(-0.00000001, 6), 0);
  assert.throws(() => roundCalibrationNumber(Number.NaN), /finite/);
});

function closeVector(actual, expected) {
  for (const axis of ["x", "y", "z"]) {
    assert.ok(Math.abs(actual[axis] - expected[axis]) < 1e-12, `${axis}: ${actual[axis]} vs ${expected[axis]}`);
  }
}
