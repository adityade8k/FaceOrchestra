import test from "node:test";
import assert from "node:assert/strict";
import { METRONOME_HANDLE_CONTROLS } from "../../../src/config/metronome.js";
import {
  MetronomeHandleRig,
  resolveHandleAxisInRootSpace,
} from "../../../src/instruments/metronome/MetronomeHandleRig.js";
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

test("Metronome handle config contains behavior but no manual collider placement", () => {
  for (const config of METRONOME_HANDLE_CONTROLS) {
    assert.equal("colliderOffset" in config, false);
    assert.equal("colliderRadius" in config, false);
    assert.equal("center" in config, false);
  }
});

test("handle geometry clone stays identity-parented and shares visible world movement", () => {
  const { rig, handle } = createRig();
  const control = rig.controls.get("bpm");
  const restOrigin = handle.localToWorld(new Vector3());

  assert.equal(control.collider.parent, handle);
  assert.notEqual(control.collider.geometry, handle.geometry);
  assert.deepEqual(control.collider.geometry.vertices, handle.geometry.vertices);
  assertVector(control.collider.position, new Vector3());
  assertQuaternion(control.collider.quaternion, new Quaternion());
  assertVector(control.collider.scale, new Vector3(1, 1, 1));
  assert.equal(control.collider.material.opacity, 0);
  assert.equal(typeof control.collider.raycast, "function");
  assert.equal(control.collider.geometry.userData.disposeWithOwner, true);
  assert.equal(control.collider.material.userData.disposeWithOwner, true);

  for (const value of [30, 135, 240]) {
    rig.setValue("bpm", value);
    assertVector(handle.localToWorld(new Vector3()), restOrigin);
    const visiblePoint = handle.localToWorld(handle.geometry.vertices[0].clone());
    const colliderPoint = control.collider.localToWorld(control.collider.geometry.vertices[0].clone());
    assertVector(colliderPoint, visiblePoint);
  }

  const ownedGeometry = control.collider.geometry;
  const ownedMaterial = control.collider.material;
  rig.dispose();
  assert.equal(ownedGeometry.disposed, true);
  assert.equal(ownedMaterial.disposed, true);
});

test("handle rotation is rest-relative and preserves the imported transform", () => {
  const { rig, handle } = createRig();
  const control = rig.controls.get("bpm");
  const restPosition = control.restPosition.clone();
  const restScale = control.restScale.clone();
  const restQuaternion = control.restQuaternion.clone();

  rig.setValue("bpm", 30);
  const expected = restQuaternion.clone().multiply(
    new Quaternion().setFromAxisAngle(control.axis, -Math.PI / 3),
  );
  assertQuaternion(handle.quaternion, expected);
  assertVector(handle.position, restPosition);
  assertVector(handle.scale, restScale);

  rig.setValue("bpm", 135);
  assertQuaternion(handle.quaternion, restQuaternion);
});

test("configured handle-local Y resolves through the imported parent to Metronome-root Z", () => {
  const root = new Group();
  root.quaternion.setFromAxisAngle(new Vector3(0, 0, 1), 0.37);
  const importedParent = new Group();
  importedParent.quaternion.setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2);
  root.add(importedParent);
  const handle = new Mesh(new Geometry([new Vector3(2, 3, 4)]), null);
  handle.name = "L_handle_geo";
  importedParent.add(handle);

  const axis = resolveHandleAxisInRootSpace({
    THREE,
    root,
    handle,
    localAxis: new Vector3(0, 1, 0),
  });
  const rig = new MetronomeHandleRig({
    THREE,
    root,
    configs: [TEST_CONFIGS[0]],
    showDebug: false,
  });

  assertVector(axis, new Vector3(0, 0, 1));
  assertVector(rig.controls.get("bpm").rootAxis, new Vector3(0, 0, 1));
});

test("applying one handle angle moves its geometry around its own origin only", () => {
  const root = new Group();
  const group1 = new Group();
  group1.position.set(9, 8, 7);
  group1.quaternion.setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2);
  root.add(group1);
  const left = new Mesh(new Geometry([new Vector3(2, 0, 0)]), null);
  left.name = "L_handle_geo";
  left.position.set(-3, 0, 0);
  const right = new Mesh(new Geometry([new Vector3(4, 0, 0)]), null);
  right.name = "R_handle_geo";
  right.position.set(3, 0, 0);
  group1.add(left, right);
  const rig = new MetronomeHandleRig({ THREE, root, configs: TEST_CONFIGS, showDebug: false });
  const leftOrigin = left.localToWorld(new Vector3());
  const leftPoint = left.localToWorld(left.geometry.vertices[0].clone());
  const rightPosition = right.position.clone();
  const rightQuaternion = right.quaternion.clone();
  const groupPosition = group1.position.clone();
  const groupQuaternion = group1.quaternion.clone();

  rig.setValue("bpm", 30);

  assertVector(left.localToWorld(new Vector3()), leftOrigin);
  assertVectorNotEqual(left.localToWorld(left.geometry.vertices[0].clone()), leftPoint);
  assertVector(right.position, rightPosition);
  assertQuaternion(right.quaternion, rightQuaternion);
  assertVector(group1.position, groupPosition);
  assertQuaternion(group1.quaternion, groupQuaternion);
});

test("axial anchor displacement is preserved and the drag plane crosses its path center", () => {
  const { rig } = createRig();
  const control = rig.controls.get("bpm");
  assert.equal(control.axialDistance, 3);
  assertVector(control.pathCenter, new Vector3(0, 3, 0));
  assertVector(control.radialOffset, new Vector3(2, 0, 4));
  const plane = rig.getDragPlane(control);
  assertVector(plane.point, control.restFrame.localToWorld(control.pathCenter.clone()));
  assertVector(plane.normal, new Vector3(0, 1, 0).applyQuaternion(control.restQuaternion));
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

test("missing handle geometry disables only that control", () => {
  const root = new Group();
  const invalid = new Mesh(null, null);
  invalid.name = "L_handle_geo";
  const valid = new Mesh(new Geometry([new Vector3(-2, 1, 3)]), null);
  valid.name = "R_handle_geo";
  root.add(invalid, valid);
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (message) => warnings.push(message);
  try {
    const rig = new MetronomeHandleRig({ THREE, root, configs: TEST_CONFIGS, showDebug: false });
    assert.equal(rig.controls.has("bpm"), false);
    assert.equal(rig.controls.has("volume"), true);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /has no geometry/);
  } finally {
    console.warn = originalWarn;
  }
});

const TEST_CONFIGS = [
  {
    nodeName: "L_handle_geo", parameter: "bpm", axis: { x: 0, y: 1, z: 0 },
    minAngleDegrees: -60, maxAngleDegrees: 60, referenceAngleDegrees: 0,
    colliderColor: 1, pivotColor: 2, planeColor: 3, arcColor: 4, invertDrag: false,
  },
  {
    nodeName: "R_handle_geo", parameter: "volume", axis: { x: 0, y: 1, z: 0 },
    minAngleDegrees: -60, maxAngleDegrees: 60, referenceAngleDegrees: 0,
    colliderColor: 1, pivotColor: 2, planeColor: 3, arcColor: 4, invertDrag: false,
  },
];

function createRig() {
  const root = new Group();
  const importedParent = new Group();
  root.add(importedParent);
  const geometry = new Geometry([
    new Vector3(1, 2, 3),
    new Vector3(3, 4, 5),
  ]);
  const handle = new Mesh(geometry, null);
  handle.name = "L_handle_geo";
  handle.position.set(5, 6, 7);
  handle.quaternion.copy(new Quaternion(0.2, -0.1, 0.3, 0.9).normalize());
  handle.scale.set(2, 3, 4);
  importedParent.add(handle);
  const rig = new MetronomeHandleRig({ THREE, root, configs: [TEST_CONFIGS[0]], showDebug: false });
  return { rig, handle };
}

class Vector3 {
  constructor(x = 0, y = 0, z = 0) { this.set(x, y, z); }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  clone() { return new Vector3(this.x, this.y, this.z); }
  copy(value) { return this.set(value.x, value.y, value.z); }
  add(value) { this.x += value.x; this.y += value.y; this.z += value.z; return this; }
  sub(value) { this.x -= value.x; this.y -= value.y; this.z -= value.z; return this; }
  addScaledVector(value, scale) { this.x += value.x * scale; this.y += value.y * scale; this.z += value.z * scale; return this; }
  multiplyScalar(scale) { this.x *= scale; this.y *= scale; this.z *= scale; return this; }
  multiply(value) { this.x *= value.x; this.y *= value.y; this.z *= value.z; return this; }
  divide(value) { this.x /= value.x; this.y /= value.y; this.z /= value.z; return this; }
  dot(value) { return this.x * value.x + this.y * value.y + this.z * value.z; }
  lengthSq() { return this.dot(this); }
  length() { return Math.sqrt(this.lengthSq()); }
  normalize() { return this.multiplyScalar(1 / this.length()); }
  applyQuaternion(q) {
    const { x, y, z } = this;
    const ix = q.w * x + q.y * z - q.z * y;
    const iy = q.w * y + q.z * x - q.x * z;
    const iz = q.w * z + q.x * y - q.y * x;
    const iw = -q.x * x - q.y * y - q.z * z;
    this.x = ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y;
    this.y = iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z;
    this.z = iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x;
    return this;
  }
  transformDirection(object) { return this.applyQuaternion(object.getWorldQuaternion()).normalize(); }
}

class Quaternion {
  constructor(x = 0, y = 0, z = 0, w = 1) { Object.assign(this, { x, y, z, w }); }
  clone() { return new Quaternion(this.x, this.y, this.z, this.w); }
  copy(value) { Object.assign(this, value); return this; }
  identity() { return this.copy(new Quaternion()); }
  normalize() {
    const length = Math.hypot(this.x, this.y, this.z, this.w);
    this.x /= length; this.y /= length; this.z /= length; this.w /= length;
    return this;
  }
  invert() { this.x *= -1; this.y *= -1; this.z *= -1; return this.normalize(); }
  setFromAxisAngle(axis, angle) {
    const sine = Math.sin(angle / 2);
    this.x = axis.x * sine; this.y = axis.y * sine; this.z = axis.z * sine; this.w = Math.cos(angle / 2);
    return this;
  }
  multiply(other) {
    const a = this.clone();
    this.x = a.x * other.w + a.w * other.x + a.y * other.z - a.z * other.y;
    this.y = a.y * other.w + a.w * other.y + a.z * other.x - a.x * other.z;
    this.z = a.z * other.w + a.w * other.z + a.x * other.y - a.y * other.x;
    this.w = a.w * other.w - a.x * other.x - a.y * other.y - a.z * other.z;
    return this;
  }
}

class Object3D {
  constructor() {
    this.position = new Vector3(); this.quaternion = new Quaternion(); this.scale = new Vector3(1, 1, 1);
    this.children = []; this.parent = null; this.userData = {}; this.matrixWorld = this;
  }
  add(...objects) { for (const object of objects) { object.parent = this; this.children.push(object); } }
  removeFromParent() { if (!this.parent) return; this.parent.children = this.parent.children.filter((x) => x !== this); this.parent = null; }
  getObjectByName(name) { if (this.name === name) return this; for (const child of this.children) { const found = child.getObjectByName(name); if (found) return found; } return null; }
  updateMatrixWorld() {}
  getWorldQuaternion() { return this.parent ? this.parent.getWorldQuaternion().multiply(this.quaternion) : this.quaternion.clone(); }
  localToWorld(value) { for (let object = this; object; object = object.parent) value.multiply(object.scale).applyQuaternion(object.quaternion).add(object.position); return value; }
  worldToLocal(value) {
    const chain = []; for (let object = this; object; object = object.parent) chain.push(object);
    for (const object of chain.reverse()) value.sub(object.position).applyQuaternion(object.quaternion.clone().invert()).divide(object.scale);
    return value;
  }
}

class Group extends Object3D {}
class Mesh extends Object3D {
  constructor(geometry, material) { super(); this.geometry = geometry; this.material = material; }
  raycast() {}
}
class Geometry {
  constructor(vertices) { this.vertices = vertices; this.userData = {}; this.boundingSphere = null; }
  clone() { return new Geometry(this.vertices.map((vertex) => vertex.clone())); }
  computeBoundingSphere() {
    const center = this.vertices.reduce((sum, vertex) => sum.add(vertex), new Vector3()).multiplyScalar(1 / this.vertices.length);
    this.boundingSphere = { center };
  }
  dispose() { this.disposed = true; }
}
class MeshBasicMaterial { constructor(options) { Object.assign(this, options); this.userData = {}; } dispose() { this.disposed = true; } }

const THREE = {
  Group, Mesh, MeshBasicMaterial, Vector3, Quaternion,
  MathUtils: { degToRad: (value) => value * Math.PI / 180, radToDeg: (value) => value * 180 / Math.PI },
};

function assertVector(actual, expected, epsilon = 1e-9) {
  for (const axis of ["x", "y", "z"]) assert.ok(Math.abs(actual[axis] - expected[axis]) < epsilon, `${axis}: ${actual[axis]} vs ${expected[axis]}`);
}

function assertQuaternion(actual, expected, epsilon = 1e-9) {
  assertVector(actual, expected, epsilon);
  assert.ok(Math.abs(actual.w - expected.w) < epsilon, `w: ${actual.w} vs ${expected.w}`);
}

function assertVectorNotEqual(actual, expected, epsilon = 1e-9) {
  assert.ok(
    ["x", "y", "z"].some((axis) => Math.abs(actual[axis] - expected[axis]) >= epsilon),
    `expected vectors to differ: ${JSON.stringify(actual)}`,
  );
}
