import test from "node:test";
import assert from "node:assert/strict";
import { MetronomeHandleRig } from "../../../src/instruments/metronome/MetronomeHandleRig.js";
import {
  mapAngleToValue,
  mapValueToAngle,
  projectOntoPlane,
  signedAngleOnPlane,
} from "../../../src/instruments/metronome/metronomeArcMath.js";

test("metronome values and angles map bidirectionally with endpoint clamping", () => {
  assert.equal(mapValueToAngle(30, 30, 240, -1, 1), -1);
  assert.equal(mapValueToAngle(240, 30, 240, -1, 1), 1);
  assert.equal(mapValueToAngle(999, 30, 240, -1, 1), 1);
  assert.equal(mapAngleToValue(-1, -1, 1, 30, 240), 30);
  assert.equal(mapAngleToValue(1, -1, 1, 30, 240), 240);
  assert.equal(mapAngleToValue(-99, -1, 1, 30, 240), 30);
});

test("signed angle follows the configured plane normal", () => {
  const x = { x: 1, y: 0, z: 0 };
  const y = { x: 0, y: 1, z: 0 };
  const z = { x: 0, y: 0, z: 1 };
  assert.ok(Math.abs(signedAngleOnPlane(x, y, z) - Math.PI / 2) < 1e-9);
  assert.ok(Math.abs(signedAngleOnPlane(x, y, { x: 0, y: 0, z: -1 }) + Math.PI / 2) < 1e-9);
});

test("projected collider offset remains on-plane at a constant radius", () => {
  const offset = { x: 0.2, y: 0.3, z: 0.04 };
  const projected = projectOntoPlane(offset, { x: 0, y: 0, z: 1 });
  assert.ok(Math.abs(projected.z) < 1e-12);
  const radius = Math.hypot(projected.x, projected.y, projected.z);
  for (const angle of [-1, 0, 1]) {
    const rotated = {
      x: projected.x * Math.cos(angle) - projected.y * Math.sin(angle),
      y: projected.x * Math.sin(angle) + projected.y * Math.cos(angle),
      z: projected.z,
    };
    assert.ok(Math.abs(Math.hypot(rotated.x, rotated.y, rotated.z) - radius) < 1e-12);
    assert.ok(Math.abs(rotated.z) < 1e-12);
  }
});

test("missing GLB child nodes disable controls instead of creating floating targets", () => {
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (message) => warnings.push(message);
  try {
    const rig = new MetronomeHandleRig({
      THREE: {},
      root: { getObjectByName: () => null },
      showDebug: false,
    });
    assert.equal(rig.controls.size, 0);
    assert.deepEqual(rig.targets, {});
    assert.equal(warnings.length, 2);
    assert.match(warnings[0], /was not found/);
  } finally {
    console.warn = originalWarn;
  }
});
