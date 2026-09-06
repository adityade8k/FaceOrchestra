import test from "node:test";
import assert from "node:assert/strict";

import {
  METRONOME_HANDLE_CONTROLS,
  METRONOME_SETTINGS,
} from "../../../src/config/metronome.js";
import {
  MetronomeHandleRig,
  resolveHandleAxisInRootSpace,
} from "../../../src/instruments/metronome/MetronomeHandleRig.js";
import {
  mapAngleToValue,
  mapValueToAngle,
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

test("handle config contains the verified Ver-8 hinges on the spatially reversed Ver-9 meshes", () => {
  const [bpm, volume] = METRONOME_HANDLE_CONTROLS;

  assert.equal(bpm.nodeName, "L_handle_geo");
  assert.equal(bpm.parameter, "bpm");
  assert.deepEqual(bpm.pivot, { x: 9.907267464, y: 14.899678701, z: 10.923128679 });
  assert.deepEqual(bpm.colliderOffset, { x: 5, y: 0, z: -5 });
  assert.equal(bpm.colliderRadius, 1.6);
  assert.equal(bpm.minAngleDegrees, -90);
  assert.equal(bpm.maxAngleDegrees, 50);

  assert.equal(volume.nodeName, "R_handle_geo");
  assert.equal(volume.parameter, "volume");
  assert.deepEqual(volume.pivot, { x: -10.089564549, y: 14.890084927, z: 10.666345168 });
  assert.deepEqual(volume.colliderOffset, { x: -5, y: 0, z: -5 });
  assert.equal(volume.colliderRadius, 1.6);
  assert.equal(volume.minAngleDegrees, -40);
  assert.equal(volume.maxAngleDegrees, 100);
});

test("default values place both visible handles and colliders at their arc midpoints", () => {
  const { rig } = createOutletsFixture();
  const bpm = rig.controls.get("bpm");
  const volume = rig.controls.get("volume");
  const controls = [bpm, volume];
  const rest = new Map(controls.map((control) => {
    const hinge = control.pivotGroup.localToWorld(new Vector3());
    return [control, {
      hinge,
      axis: control.axis.clone().transformDirection(control.restFrame.matrixWorld),
      visible: control.handle.localToWorld(control.handle.geometry.vertices[0].clone()).sub(hinge.clone()),
      collider: control.collider.localToWorld(new Vector3()).sub(hinge.clone()),
    }];
  }));

  rig.setValue("bpm", METRONOME_SETTINGS.defaultBpm);
  rig.setValue("volume", METRONOME_SETTINGS.defaultVolume);

  assert.equal(METRONOME_SETTINGS.defaultBpm, 135);
  assert.equal(METRONOME_SETTINGS.defaultVolume, 0.5);
  for (const control of controls) {
    const expectedAngle = (control.minAngle + control.maxAngle) / 2;
    const initial = rest.get(control);
    const hinge = control.pivotGroup.localToWorld(new Vector3());
    const visible = control.handle.localToWorld(control.handle.geometry.vertices[0].clone()).sub(hinge.clone());
    const collider = control.collider.localToWorld(new Vector3()).sub(hinge.clone());
    assertNear(control.angle, expectedAngle);
    assertNear(signedRotation(initial.visible, visible, initial.axis), expectedAngle, 1e-7);
    assertNear(signedRotation(initial.collider, collider, initial.axis), expectedAngle, 1e-7);
  }
});

test("zero-origin baked handles get distinct hinges without jumping and local Y resolves to root Z", () => {
  const fixture = createOutletsFixture();
  const { rig, root, group1, left, right, before } = fixture;
  const bpm = rig.controls.get("bpm");
  const volume = rig.controls.get("volume");

  assert.notEqual(bpm.pivotGroup, volume.pivotGroup);
  assert.equal(bpm.pivotGroup.parent, group1);
  assert.equal(volume.pivotGroup.parent, group1);
  assertVector(bpm.pivotGroup.position, vector(METRONOME_HANDLE_CONTROLS[0].pivot));
  assertVector(volume.pivotGroup.position, vector(METRONOME_HANDLE_CONTROLS[1].pivot));
  assertVectorNotEqual(bpm.pivotGroup.position, volume.pivotGroup.position);

  assert.equal(left.parent, bpm.pivotGroup);
  assert.equal(right.parent, volume.pivotGroup);
  assertVector(left.localToWorld(left.geometry.vertices[0].clone()), before.leftPoint);
  assertVector(right.localToWorld(right.geometry.vertices[0].clone()), before.rightPoint);

  assertVector(bpm.rootAxis, new Vector3(0, 0, 1), 1e-7);
  assertVector(volume.rootAxis, new Vector3(0, 0, 1), 1e-7);
  assertVector(resolveHandleAxisInRootSpace({
    THREE,
    root,
    handle: bpm.pivotGroup,
    localAxis: new Vector3(0, 1, 0),
    restQuaternion: bpm.restPivotQuaternion,
  }), new Vector3(0, 0, 1), 1e-7);
});

test("visible handles and colliders share one pivot transform through both control ranges", () => {
  const { rig, root } = createOutletsFixture();

  for (const [parameter, values] of [
    ["bpm", [30, 135, 240]],
    ["volume", [0, 0.5, 1]],
  ]) {
    const control = rig.controls.get(parameter);
    rig.applyAngle(control, 0);
    const hinge = control.pivotGroup.localToWorld(new Vector3());
    const worldAxis = control.axis.clone().transformDirection(control.restFrame.matrixWorld);
    const visibleRest = control.handle.localToWorld(control.handle.geometry.vertices[0].clone()).sub(hinge.clone());
    const colliderRest = control.collider.localToWorld(new Vector3()).sub(hinge.clone());
    const visibleRadius = visibleRest.length();
    const colliderRadius = colliderRest.length();
    const visibleRootZ = root.worldToLocal(control.handle.localToWorld(
      control.handle.geometry.vertices[0].clone(),
    )).z;
    const colliderRootZ = root.worldToLocal(control.collider.localToWorld(new Vector3())).z;

    for (const value of values) {
      rig.setValue(parameter, value);
      const currentHinge = control.pivotGroup.localToWorld(new Vector3());
      const visiblePoint = control.handle.localToWorld(control.handle.geometry.vertices[0].clone());
      const colliderPoint = control.collider.localToWorld(new Vector3());
      const configuredColliderPoint = control.pivotGroup.localToWorld(vector(control.config.colliderOffset));
      const visibleVector = visiblePoint.clone().sub(currentHinge);
      const colliderVector = colliderPoint.clone().sub(currentHinge);

      assertVector(currentHinge, hinge);
      assertVector(colliderPoint, configuredColliderPoint);
      assertNear(visibleVector.length(), visibleRadius);
      assertNear(colliderVector.length(), colliderRadius);
      assertNear(signedRotation(visibleRest, visibleVector, worldAxis), control.angle, 1e-7);
      assertNear(signedRotation(colliderRest, colliderVector, worldAxis), control.angle, 1e-7);
      assertNear(root.worldToLocal(visiblePoint.clone()).z, visibleRootZ, 1e-9);
      assertNear(root.worldToLocal(colliderPoint.clone()).z, colliderRootZ, 1e-9);
    }
  }
});

test("moving BPM leaves the other handle, shared parent, body, and pendulum unchanged", () => {
  const { rig, group1, right, body, pendulum } = createOutletsFixture();
  const volume = rig.controls.get("volume");
  const snapshots = new Map([
    [volume.pivotGroup, snapshotTransform(volume.pivotGroup)],
    [right, snapshotTransform(right)],
    [group1, snapshotTransform(group1)],
    [body, snapshotTransform(body)],
    [pendulum, snapshotTransform(pendulum)],
  ]);

  rig.setValue("bpm", 30);
  rig.setValue("bpm", 240);

  for (const [object, snapshot] of snapshots) assertTransform(object, snapshot);
});

test("angular dragging uses the static hinge-centered rest frame", () => {
  const { rig } = createOutletsFixture();
  const control = rig.controls.get("bpm");
  rig.applyAngle(control, 0);
  const normal = control.axis.clone().transformDirection(control.restFrame.matrixWorld);
  const startPoint = control.restFrame.localToWorld(control.colliderOffset.clone());
  const targetAngle = 0.4;
  const targetPoint = control.restFrame.localToWorld(
    control.colliderOffset.clone().applyAxisAngle(control.axis, targetAngle),
  );
  const rayDirection = normal.clone().multiplyScalar(-1);
  const drag = rig.beginDrag(
    "bpm",
    startPoint.clone().addScaledVector(normal, 10),
    rayDirection,
  );
  const result = rig.updateDrag(
    drag,
    targetPoint.clone().addScaledVector(normal, 10),
    rayDirection,
  );

  assertNear(result.angle, targetAngle);
  assertNear(control.angle, targetAngle);
  assertVector(rig.getDragPlane(control).point, control.pivotGroup.localToWorld(new Vector3()));
});

test("production sphere colliders stay transparent, visible, and raycastable", () => {
  const { rig } = createOutletsFixture();

  for (const control of rig.controls.values()) {
    assert.equal(control.collider.parent, control.pivotGroup);
    assert.equal(control.collider.geometry.radius, 1.6);
    assert.equal(control.collider.material.opacity, 0);
    assert.equal(control.collider.visible, true);
    assert.equal(typeof control.collider.raycast, "function");
    assert.equal(control.collider.userData.isHitTarget, true);
    assert.equal(control.collider.geometry.userData.disposeWithOwner, true);
    assert.equal(control.collider.material.userData.disposeWithOwner, true);
  }
});

test("disposal restores the imported hierarchy and removes generated resources", () => {
  const { rig, root, group1, left, right, originalChildren } = createOutletsFixture();
  const generated = [...rig.controls.values()].map((control) => ({
    pivot: control.pivotGroup,
    restFrame: control.restFrame,
    collider: control.collider,
    geometry: control.collider.geometry,
    material: control.collider.material,
  }));
  rig.setValue("bpm", 240);
  rig.setValue("volume", 0);

  rig.dispose();

  assert.equal(left.parent, group1);
  assert.equal(right.parent, group1);
  assertVector(left.position, new Vector3());
  assertVector(right.position, new Vector3());
  assertQuaternion(left.quaternion, new Quaternion());
  assertQuaternion(right.quaternion, new Quaternion());
  assertVector(left.scale, new Vector3(1, 1, 1));
  assertVector(right.scale, new Vector3(1, 1, 1));
  assert.deepEqual(group1.children, originalChildren);
  assert.equal(rig.controls.size, 0);
  assert.deepEqual(rig.targets, {});

  for (const item of generated) {
    assert.equal(item.pivot.parent, null);
    assert.equal(item.restFrame.parent, null);
    assert.equal(item.collider.parent, null);
    assert.equal(item.geometry.disposed, true);
    assert.equal(item.material.disposed, true);
    assert.equal(root.getObjectByName(item.pivot.name), null);
    assert.equal(root.getObjectByName(item.collider.name), null);
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

test("missing handle geometry disables only that control", () => {
  const root = new Group();
  const invalid = new Mesh(null, null);
  invalid.name = "L_handle_geo";
  const valid = new Mesh(new Geometry([new Vector3(-12, 15, 6)]), null);
  valid.name = "R_handle_geo";
  root.add(invalid, valid);
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (message) => warnings.push(message);
  try {
    const rig = new MetronomeHandleRig({ THREE, root, showDebug: false });
    assert.equal(rig.controls.has("bpm"), false);
    assert.equal(rig.controls.has("volume"), true);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /has no geometry/);
  } finally {
    console.warn = originalWarn;
  }
});

function createOutletsFixture() {
  const root = new Group();
  root.name = "metronome-root";
  root.quaternion.setFromAxisAngle(new Vector3(0, 0, 1), 0.37);
  const group1 = new Group();
  group1.name = "group1";
  group1.position.set(0, 0.17732909321784973, -0.09963829815387726);
  group1.quaternion.setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2);
  group1.scale.setScalar(0.01);
  root.add(group1);

  const left = new Mesh(new Geometry([
    new Vector3(16.025203704833984, 14.4, 10.2),
    new Vector3(9.554720878601074, 15.2, 3.682633876800537),
  ]), null);
  left.name = "L_handle_geo";
  const right = new Mesh(new Geometry([
    new Vector3(-16.125577926635742, 14.2, 9.8),
    new Vector3(-9.758662223815918, 15.4, 3.2848024368286133),
  ]), null);
  right.name = "R_handle_geo";
  const body = new Mesh(new Geometry([new Vector3(0, 0, 0)]), null);
  body.name = "body_geo";
  const pendulum = new Mesh(new Geometry([new Vector3(0, 1, 0)]), null);
  pendulum.name = "pendulum_geo";
  group1.add(left, right, body, pendulum);

  const originalChildren = [...group1.children];
  const before = {
    leftPoint: left.localToWorld(left.geometry.vertices[0].clone()),
    rightPoint: right.localToWorld(right.geometry.vertices[0].clone()),
  };
  const rig = new MetronomeHandleRig({ THREE, root, showDebug: false });
  return { rig, root, group1, left, right, body, pendulum, originalChildren, before };
}

function signedRotation(from, to, axis) {
  const first = from.clone().addScaledVector(axis, -from.dot(axis)).normalize();
  const second = to.clone().addScaledVector(axis, -to.dot(axis)).normalize();
  const cross = new Vector3().crossVectors(first, second);
  return Math.atan2(axis.dot(cross), first.dot(second));
}

function snapshotTransform(object) {
  return {
    position: object.position.clone(),
    quaternion: object.quaternion.clone(),
    scale: object.scale.clone(),
  };
}

function assertTransform(object, snapshot) {
  assertVector(object.position, snapshot.position);
  assertQuaternion(object.quaternion, snapshot.quaternion);
  assertVector(object.scale, snapshot.scale);
}

function vector(value) {
  return new Vector3(value.x, value.y, value.z);
}

class Vector3 {
  constructor(x = 0, y = 0, z = 0) { this.set(x, y, z); }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  setScalar(value) { return this.set(value, value, value); }
  clone() { return new Vector3(this.x, this.y, this.z); }
  copy(value) { return this.set(value.x, value.y, value.z); }
  add(value) { this.x += value.x; this.y += value.y; this.z += value.z; return this; }
  sub(value) { this.x -= value.x; this.y -= value.y; this.z -= value.z; return this; }
  addScaledVector(value, scale) { this.x += value.x * scale; this.y += value.y * scale; this.z += value.z * scale; return this; }
  multiplyScalar(scale) { this.x *= scale; this.y *= scale; this.z *= scale; return this; }
  multiply(value) { this.x *= value.x; this.y *= value.y; this.z *= value.z; return this; }
  divide(value) { this.x /= value.x; this.y /= value.y; this.z /= value.z; return this; }
  dot(value) { return this.x * value.x + this.y * value.y + this.z * value.z; }
  crossVectors(a, b) {
    this.x = a.y * b.z - a.z * b.y;
    this.y = a.z * b.x - a.x * b.z;
    this.z = a.x * b.y - a.y * b.x;
    return this;
  }
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
  applyAxisAngle(axis, angle) { return this.applyQuaternion(new Quaternion().setFromAxisAngle(axis, angle)); }
  transformDirection(object) { return this.applyQuaternion(object.getWorldQuaternion(new Quaternion())).normalize(); }
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
    this.name = "";
    this.position = new Vector3();
    this.quaternion = new Quaternion();
    this.scale = new Vector3(1, 1, 1);
    this.children = [];
    this.parent = null;
    this.userData = {};
    this.matrixWorld = this;
    this.visible = true;
  }
  add(...objects) {
    for (const object of objects) {
      object.removeFromParent();
      object.parent = this;
      this.children.push(object);
    }
    return this;
  }
  removeFromParent() {
    if (!this.parent) return this;
    this.parent.children = this.parent.children.filter((child) => child !== this);
    this.parent = null;
    return this;
  }
  getObjectByName(name) {
    if (this.name === name) return this;
    for (const child of this.children) {
      const found = child.getObjectByName(name);
      if (found) return found;
    }
    return null;
  }
  traverse(callback) {
    callback(this);
    for (const child of this.children) child.traverse(callback);
  }
  updateMatrixWorld() {}
  getWorldQuaternion(target = new Quaternion()) {
    const chain = [];
    for (let object = this; object; object = object.parent) chain.unshift(object);
    const result = new Quaternion();
    for (const object of chain) result.multiply(object.quaternion);
    return target.copy(result);
  }
  localToWorld(value) {
    for (let object = this; object; object = object.parent) {
      value.multiply(object.scale).applyQuaternion(object.quaternion).add(object.position);
    }
    return value;
  }
  worldToLocal(value) {
    const chain = [];
    for (let object = this; object; object = object.parent) chain.push(object);
    for (const object of chain.reverse()) {
      value.sub(object.position).applyQuaternion(object.quaternion.clone().invert()).divide(object.scale);
    }
    return value;
  }
}

class Group extends Object3D {}
class Mesh extends Object3D {
  constructor(geometry, material) { super(); this.geometry = geometry; this.material = material; }
  raycast() {}
}
class Geometry {
  constructor(vertices) { this.vertices = vertices; this.userData = {}; }
}
class SphereGeometry {
  constructor(radius, widthSegments, heightSegments) {
    Object.assign(this, { radius, widthSegments, heightSegments, userData: {} });
  }
  dispose() { this.disposed = true; }
}
class MeshBasicMaterial {
  constructor(options) { Object.assign(this, options); this.userData = {}; }
  dispose() { this.disposed = true; }
}

const THREE = {
  Group,
  Mesh,
  MeshBasicMaterial,
  SphereGeometry,
  Vector3,
  Quaternion,
  MathUtils: {
    degToRad: (value) => value * Math.PI / 180,
    radToDeg: (value) => value * 180 / Math.PI,
  },
};

function assertNear(actual, expected, epsilon = 1e-9) {
  assert.ok(Math.abs(actual - expected) < epsilon, `${actual} vs ${expected}`);
}

function assertVector(actual, expected, epsilon = 1e-9) {
  for (const axis of ["x", "y", "z"]) assertNear(actual[axis], expected[axis], epsilon);
}

function assertQuaternion(actual, expected, epsilon = 1e-9) {
  assertVector(actual, expected, epsilon);
  assertNear(actual.w, expected.w, epsilon);
}

function assertVectorNotEqual(actual, expected, epsilon = 1e-9) {
  assert.ok(
    ["x", "y", "z"].some((axis) => Math.abs(actual[axis] - expected[axis]) >= epsilon),
    `expected vectors to differ: ${JSON.stringify(actual)}`,
  );
}
