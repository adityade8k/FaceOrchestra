import test from "node:test";
import assert from "node:assert/strict";

import {
  deriveLooperControlGeometry,
  deriveMorphAnchorPath,
} from "../../../src/instruments/looper/looperMorphGeometry.js";

const BASE = attribute([
  0, 0, 0,
  2, 0, 0,
  0, 2, 0,
  100, 100, 100,
]);
const UP_RELATIVE = attribute([
  2, 0, 0,
  0, 0, 0,
  0, 0, 1,
  0, 0, 0,
]);
const DOWN_RELATIVE = attribute([
  0, 0, 0,
  0, -2, 0,
  0, 0, -1,
  0, 0, 0,
]);

test("synthetic relative morphs derive exact neutral, up, and down affected-vertex means", () => {
  const result = deriveMorphAnchorPath({
    basePosition: BASE,
    upPosition: UP_RELATIVE,
    downPosition: DOWN_RELATIVE,
    morphTargetsRelative: true,
    colliderPadding: 1.15,
  });

  assert.equal(result.affectedVertexCount, 3);
  closePoint(result.neutralAnchor, { x: 2 / 3, y: 2 / 3, z: 0 });
  closePoint(result.upAnchor, { x: 4 / 3, y: 2 / 3, z: 1 / 3 });
  closePoint(result.downAnchor, { x: 2 / 3, y: 0, z: -1 / 3 });
  assert.ok(Math.abs(result.colliderRadius - 1.15) < 1e-12);
});

test("absolute morph targets produce the same anchors as relative targets", () => {
  const upAbsolute = addAttributes(BASE, UP_RELATIVE);
  const downAbsolute = addAttributes(BASE, DOWN_RELATIVE);
  const relative = deriveMorphAnchorPath({
    basePosition: BASE, upPosition: UP_RELATIVE, downPosition: DOWN_RELATIVE,
    morphTargetsRelative: true,
  });
  const absolute = deriveMorphAnchorPath({
    basePosition: BASE, upPosition: upAbsolute, downPosition: downAbsolute,
    morphTargetsRelative: false,
  });

  assert.deepEqual(absolute, relative);
});

test("mesh-to-root transforms are applied before anchor means are returned", () => {
  const matrix = [
    2, 0, 0, 0,
    0, 3, 0, 0,
    0, 0, 4, 0,
    10, 20, 30, 1,
  ];
  const result = deriveMorphAnchorPath({
    basePosition: BASE,
    upPosition: UP_RELATIVE,
    downPosition: DOWN_RELATIVE,
    morphTargetsRelative: true,
    meshToRootMatrixElements: matrix,
  });

  closePoint(result.neutralAnchor, { x: 10 + 4 / 3, y: 22, z: 30 });
  closePoint(result.upAnchor, { x: 10 + 8 / 3, y: 22, z: 30 + 4 / 3 });
  closePoint(result.downAnchor, { x: 10 + 4 / 3, y: 20, z: 30 - 4 / 3 });
});

test("only vertices affected by the configured morph pair contribute", () => {
  const result = deriveMorphAnchorPath({
    basePosition: BASE,
    upPosition: UP_RELATIVE,
    downPosition: DOWN_RELATIVE,
    morphTargetsRelative: true,
  });
  assert.equal(result.affectedVertexCount, 3);
  assert.ok(result.neutralAnchor.x < 1);
  assert.ok(result.neutralAnchor.y < 1);
});

test("mesh discovery uses both exact morph names and disables only a missing pair", () => {
  const mesh = {
    geometry: {
      attributes: { position: BASE },
      morphAttributes: { position: [UP_RELATIVE, DOWN_RELATIVE, attribute(new Array(12).fill(5))] },
      morphTargetsRelative: true,
    },
    morphTargetDictionary: {
      Left_handle_up: 0,
      Left_handle_down: 1,
      unrelated: 2,
    },
    matrixWorld: new Matrix(),
    updateMatrixWorld() {},
  };
  const root = {
    matrixWorld: new Matrix(),
    updateMatrixWorld() {},
    traverse(visitor) { visitor(mesh); },
  };

  assert.ok(deriveLooperControlGeometry(root, {
    up: "Left_handle_up", down: "Left_handle_down",
  }));
  assert.equal(deriveLooperControlGeometry(root, {
    up: "right_handle_up", down: "Right_handle_down",
  }), null);
});

function attribute(array) {
  return {
    array: Float32Array.from(array),
    itemSize: 3,
    count: array.length / 3,
    getX(index) { return this.array[index * 3]; },
    getY(index) { return this.array[index * 3 + 1]; },
    getZ(index) { return this.array[index * 3 + 2]; },
  };
}

function addAttributes(left, right) {
  return attribute([...left.array].map((value, index) => value + right.array[index]));
}

class Matrix {
  constructor(elements = [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ]) { this.elements = [...elements]; }
  clone() { return new Matrix(this.elements); }
  invert() { return this; }
  multiply(other) { this.elements = [...other.elements]; return this; }
}

function closePoint(actual, expected, epsilon = 1e-9) {
  for (const axis of ["x", "y", "z"]) {
    assert.ok(Math.abs(actual[axis] - expected[axis]) < epsilon, `${axis}: ${actual[axis]} vs ${expected[axis]}`);
  }
}
