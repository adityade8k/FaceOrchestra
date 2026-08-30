import test from "node:test";
import assert from "node:assert/strict";

import { LOOPER_CONTROL_COLLIDERS } from "../../../src/config/looper.js";
import { METRONOME_HANDLE_CONTROLS } from "../../../src/config/metronome.js";

import {
  ArcMotionError,
  generateArcPoints,
  getArcAngleForPoint,
  getArcPointAtAngle,
  getArcPointForValue,
  intersectRayWithPlane,
  resolveArcMotion,
  rotateOffsetAroundAxis,
  setArcOrbitRadius,
  signedAngularDeltaAroundPivot,
  unwrapAngleDelta,
  unwrapAngleNear,
} from "../../../src/instruments/core/arcMotionMath.js";

const EPSILON = 1e-9;

test("arc points map minimum, reference/midpoint, and maximum angles", () => {
  const arc = {
    center: { x: 2, y: 3, z: 4 },
    axis: { x: 0, y: 0, z: 2 },
    colliderOffset: { x: 1, y: 0, z: 0 },
    minAngleDegrees: -90,
    maxAngleDegrees: 90,
    referenceAngleDegrees: 0,
  };
  closeVector(getArcPointForValue(arc, -1), { x: 2, y: 2, z: 4 });
  closeVector(getArcPointForValue(arc, 0), { x: 3, y: 3, z: 4 });
  closeVector(getArcPointForValue(arc, 1), { x: 2, y: 4, z: 4 });
  closeVector(getArcPointAtAngle({ ...arc, referenceAngleDegrees: 30 }, -30), { x: 3, y: 3, z: 4 });
});

test("arbitrary 3D axes preserve radius and remain in the configured plane", () => {
  const axis = { x: 1, y: 2, z: 3 };
  const arc = resolveArcMotion({
    center: { x: -2, y: 4, z: 1 },
    axis,
    colliderOffset: { x: 2, y: -1, z: 5 },
    minAngleDegrees: -70,
    maxAngleDegrees: 115,
    referenceAngleDegrees: 17,
  });
  for (const point of generateArcPoints(arc, { segments: 17 })) {
    const relative = subtract(point, arc.center);
    assert.ok(Math.abs(dot(relative, arc.axis)) < EPSILON);
    assert.ok(Math.abs(length(relative) - arc.orbitRadius) < EPSILON);
  }
  const rotated = rotateOffsetAroundAxis(arc.colliderOffset, arc.axis, Math.PI * 0.73);
  assert.ok(Math.abs(length(rotated) - arc.orbitRadius) < EPSILON);
});

test("translating center shifts every generated point by the same delta", () => {
  const base = {
    center: { x: 0, y: 0, z: 0 }, axis: { x: 0, y: 1, z: 0 },
    colliderOffset: { x: 2, y: 0, z: 1 }, minAngleDegrees: -40,
    maxAngleDegrees: 80, referenceAngleDegrees: 12,
  };
  const delta = { x: 5, y: -3, z: 2 };
  const before = generateArcPoints(base, { segments: 8 });
  const after = generateArcPoints({ ...base, center: delta }, { segments: 8 });
  before.forEach((point, index) => closeVector(subtract(after[index], point), delta));
});

test("changing colliderOffset changes the derived radius and every non-pivot point", () => {
  const base = {
    center: { x: 0, y: 0, z: 0 }, axis: { x: 0, y: 0, z: 1 },
    colliderOffset: { x: 1, y: 0, z: 0 }, minAngleDegrees: -30,
    maxAngleDegrees: 30, referenceAngleDegrees: 0,
  };
  const larger = { ...base, colliderOffset: { x: 2.5, y: 0, z: 0 } };
  assert.equal(resolveArcMotion(base).orbitRadius, 1);
  assert.equal(resolveArcMotion(larger).orbitRadius, 2.5);
  for (const value of [-1, -0.25, 0, 0.6, 1]) {
    assert.ok(Math.abs(length(getArcPointForValue(larger, value)) - 2.5) < EPSILON);
  }
});

test("editing orbit radius scales colliderOffset without adding a second radius source", () => {
  const arc = {
    center: { x: 4, y: 5, z: 6 }, axis: { x: 0, y: 1, z: 0 },
    colliderOffset: { x: 3, y: 0, z: 4 }, minAngleDegrees: -20,
    maxAngleDegrees: 50, referenceAngleDegrees: 7,
  };
  const resized = setArcOrbitRadius(arc, 12.5);
  assert.deepEqual(resized.center, arc.center);
  assert.deepEqual(resized.axis, arc.axis);
  closeVector(resized.colliderOffset, { x: 7.5, y: 0, z: 10 });
  assert.equal(resolveArcMotion(resized).orbitRadius, 12.5);
  assert.equal("orbitRadius" in resized, false);
  const resizedFromResolved = setArcOrbitRadius(resolveArcMotion(arc), 9);
  assert.equal("orbitRadius" in resizedFromResolved, false);
  assert.equal("parallelOffset" in resizedFromResolved, false);
  assert.equal(resolveArcMotion(resizedFromResolved).orbitRadius, 9);
  assert.throws(() => setArcOrbitRadius(arc, 0), /greater than zero/);
});

test("all four configured control planes derive an independently editable radius", () => {
  const configurations = [
    ...METRONOME_HANDLE_CONTROLS.map((config) => ({
      label: `metronome ${config.parameter}`,
      colliderRadius: config.colliderRadius,
      arc: {
        center: { x: 0, y: 0, z: 0 },
        axis: config.axis,
        colliderOffset: config.colliderOffset,
        minAngleDegrees: config.minAngleDegrees,
        maxAngleDegrees: config.maxAngleDegrees,
        referenceAngleDegrees: config.referenceAngleDegrees,
      },
    })),
    ...Object.entries(LOOPER_CONTROL_COLLIDERS).map(([control, config]) => ({
      label: `looper ${control}`,
      colliderRadius: config.colliderRadius,
      arc: config.arc,
    })),
  ];
  assert.deepEqual(configurations.map(({ label }) => label), [
    "metronome bpm",
    "metronome volume",
    "looper volume",
    "looper gap",
  ]);
  for (const { arc, colliderRadius } of configurations) {
    const originalRadius = resolveArcMotion(arc).orbitRadius;
    const resized = setArcOrbitRadius(arc, originalRadius * 1.25);
    assert.ok(Math.abs(resolveArcMotion(resized).orbitRadius - originalRadius * 1.25) < EPSILON);
    assert.equal("orbitRadius" in resized, false);
    assert.equal(colliderRadius > 0, true);
  }
});

test("axis-parallel offset components are reported and projected explicitly", () => {
  const arc = resolveArcMotion({
    center: { x: 0, y: 0, z: 0 }, axis: { x: 0, y: 0, z: 2 },
    colliderOffset: { x: 3, y: 4, z: 7 }, minAngleDegrees: -1,
    maxAngleDegrees: 1, referenceAngleDegrees: 0,
  });
  closeVector(arc.colliderOffset, { x: 3, y: 4, z: 0 });
  closeVector(arc.parallelOffset, { x: 0, y: 0, z: 7 });
  assert.equal(arc.parallelOffsetAmount, 7);
  assert.equal(arc.orbitRadius, 5);
});

test("zero-length axes and zero-radius projected offsets fail explicitly", () => {
  const base = {
    center: { x: 0, y: 0, z: 0 }, colliderOffset: { x: 1, y: 0, z: 0 },
    minAngleDegrees: -1, maxAngleDegrees: 1, referenceAngleDegrees: 0,
  };
  assert.throws(() => resolveArcMotion({ ...base, axis: { x: 0, y: 0, z: 0 } }), ArcMotionError);
  assert.throws(() => resolveArcMotion({ ...base, axis: { x: 1, y: 0, z: 0 } }), /non-zero orbit radius/);
});

test("signed pivot angles follow the normal and unwrap without boundary jumps", () => {
  const center = { x: 3, y: -2, z: 1 };
  const x = { x: 4, y: -2, z: 1 };
  const y = { x: 3, y: -1, z: 1 };
  assert.ok(Math.abs(signedAngularDeltaAroundPivot(x, y, center, { x: 0, y: 0, z: 1 }) - Math.PI / 2) < EPSILON);
  assert.ok(Math.abs(signedAngularDeltaAroundPivot(x, y, center, { x: 0, y: 0, z: -1 }) + Math.PI / 2) < EPSILON);
  const previous = 179 * Math.PI / 180;
  const current = -179 * Math.PI / 180;
  assert.ok(Math.abs(unwrapAngleDelta(current, previous) - 2 * Math.PI / 180) < EPSILON);
  assert.ok(Math.abs(unwrapAngleNear(current, previous) - 181 * Math.PI / 180) < EPSILON);
});

test("controller rays intersect arbitrary circular planes in pivot-local coordinates", () => {
  closeVector(intersectRayWithPlane(
    { x: 4, y: 5, z: 6 },
    { x: -1, y: -1, z: -1 },
    { x: 1, y: 2, z: 3 },
    { x: 1, y: 1, z: 1 },
  ), { x: 1, y: 2, z: 3 });
  assert.equal(intersectRayWithPlane(
    { x: 0, y: 0, z: 1 },
    { x: 1, y: 0, z: 0 },
    { x: 0, y: 0, z: 0 },
    { x: 0, y: 0, z: 1 },
  ), null);
});

test("point-to-angle conversion round-trips configured reference angles", () => {
  const arc = {
    center: { x: 1, y: 2, z: 3 }, axis: { x: 1, y: 1, z: 0 },
    colliderOffset: { x: 1, y: -1, z: 2 }, minAngleDegrees: -120,
    maxAngleDegrees: 120, referenceAngleDegrees: 23,
  };
  for (const angle of [-120, -37, 0, 44, 120]) {
    assert.ok(Math.abs(getArcAngleForPoint(arc, getArcPointAtAngle(arc, angle)) - angle) < EPSILON);
  }
});

function closeVector(actual, expected) {
  for (const axis of ["x", "y", "z"]) assert.ok(Math.abs(actual[axis] - expected[axis]) < EPSILON, `${axis}: ${actual[axis]} vs ${expected[axis]}`);
}
function subtract(a, b) { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
function dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
function length(value) { return Math.hypot(value.x, value.y, value.z); }
