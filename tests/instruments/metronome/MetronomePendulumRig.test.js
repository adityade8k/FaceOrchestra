import test from "node:test";
import assert from "node:assert/strict";
import { METRONOME_PENDULUM_SETTINGS } from "../../../src/config/metronome.js";
import {
  getMetronomePendulumAngle,
  MetronomePendulumRig,
} from "../../../src/instruments/metronome/MetronomePendulumRig.js";

test("pendulum completes one local-Z oscillation every two beats", () => {
  const swing = Math.PI / 6;
  const angleAt = (nowMs) => getMetronomePendulumAngle({
    nowMs,
    beatOriginMs: 1000,
    bpm: 120,
    swingRadians: swing,
  });

  approximately(angleAt(1000), 0);
  approximately(angleAt(1250), swing);
  approximately(angleAt(1500), 0);
  approximately(angleAt(1750), -swing);
  approximately(angleAt(2000), 0);
});

test("pendulum premultiplies the imported rest pose around model-local Z", () => {
  const halfSqrt = Math.sqrt(0.5);
  const node = {
    position: new Vector3(1, 2, 3),
    quaternion: new Quaternion(halfSqrt, 0, 0, halfSqrt),
    scale: new Vector3(0.01, 0.01, 0.01),
    updateMatrixWorld() {},
  };
  const root = {
    getObjectByName: (name) => (
      name === METRONOME_PENDULUM_SETTINGS.nodeName ? node : null
    ),
  };
  const rig = new MetronomePendulumRig({
    THREE: { Vector3, Quaternion },
    root,
  });
  const restQuaternion = node.quaternion.clone();
  const restPosition = node.position.clone();
  const restScale = node.scale.clone();

  rig.applyAngle(Math.PI / 2);

  // deltaZ * importedRest produces a positive Y term. importedRest * deltaZ
  // would produce the opposite sign and rotate around the mesh's own axis.
  assert.ok(node.quaternion.y > 0);
  approximately(node.quaternion.x, 0.5);
  approximately(node.quaternion.y, 0.5);
  approximately(node.quaternion.z, 0.5);
  approximately(node.quaternion.w, 0.5);
  assertVector(node.position, restPosition);
  assertVector(node.scale, restScale);

  rig.reset();
  assertQuaternion(node.quaternion, restQuaternion);
  assertVector(node.position, restPosition);
  assertVector(node.scale, restScale);
});

test("paused and disposed pendulum rigs restore the exact imported transform", () => {
  const node = {
    position: new Vector3(0.1, 0.2, 0.3),
    quaternion: new Quaternion(0.2, 0.3, 0.4, 0.5),
    scale: new Vector3(2, 3, 4),
    updateMatrixWorld() {},
  };
  const rest = {
    position: node.position.clone(),
    quaternion: node.quaternion.clone(),
    scale: node.scale.clone(),
  };
  const rig = new MetronomePendulumRig({
    THREE: { Vector3, Quaternion },
    root: { getObjectByName: () => node },
  });

  rig.update({ nowMs: 1250, beatOriginMs: 1000, bpm: 120, playing: true });
  assert.notDeepEqual(node.quaternion, rest.quaternion);
  assert.equal(rig.update({ nowMs: 1300, bpm: 120, playing: false }), 0);
  assertQuaternion(node.quaternion, rest.quaternion);
  assertVector(node.position, rest.position);
  assertVector(node.scale, rest.scale);

  rig.applyAngle(0.2);
  rig.dispose();
  assertQuaternion(node.quaternion, rest.quaternion);
  assert.equal(rig.node, null);
});

test("a missing pendulum node disables animation without breaking the metronome", () => {
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (message) => warnings.push(message);
  try {
    const rig = new MetronomePendulumRig({
      THREE: { Vector3, Quaternion },
      root: { getObjectByName: () => null },
    });
    assert.equal(rig.node, null);
    assert.equal(rig.update({ playing: true }), 0);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /pendulum node/);
  } finally {
    console.warn = originalWarn;
  }
});

class Vector3 {
  constructor(x = 0, y = 0, z = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }

  clone() {
    return new Vector3(this.x, this.y, this.z);
  }

  copy(other) {
    this.x = other.x;
    this.y = other.y;
    this.z = other.z;
    return this;
  }

  lengthSq() {
    return this.x ** 2 + this.y ** 2 + this.z ** 2;
  }

  normalize() {
    const length = Math.sqrt(this.lengthSq());
    this.x /= length;
    this.y /= length;
    this.z /= length;
    return this;
  }
}

class Quaternion {
  constructor(x = 0, y = 0, z = 0, w = 1) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.w = w;
  }

  clone() {
    return new Quaternion(this.x, this.y, this.z, this.w);
  }

  copy(other) {
    this.x = other.x;
    this.y = other.y;
    this.z = other.z;
    this.w = other.w;
    return this;
  }

  setFromAxisAngle(axis, angle) {
    const halfAngle = angle / 2;
    const sine = Math.sin(halfAngle);
    this.x = axis.x * sine;
    this.y = axis.y * sine;
    this.z = axis.z * sine;
    this.w = Math.cos(halfAngle);
    return this;
  }

  premultiply(other) {
    const current = this.clone();
    const { x: ax, y: ay, z: az, w: aw } = other;
    const { x: bx, y: by, z: bz, w: bw } = current;
    this.x = ax * bw + aw * bx + ay * bz - az * by;
    this.y = ay * bw + aw * by + az * bx - ax * bz;
    this.z = az * bw + aw * bz + ax * by - ay * bx;
    this.w = aw * bw - ax * bx - ay * by - az * bz;
    return this;
  }
}

function approximately(actual, expected, epsilon = 1e-10) {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `Expected ${actual} to be within ${epsilon} of ${expected}`,
  );
}

function assertVector(actual, expected) {
  approximately(actual.x, expected.x);
  approximately(actual.y, expected.y);
  approximately(actual.z, expected.z);
}

function assertQuaternion(actual, expected) {
  assertVector(actual, expected);
  approximately(actual.w, expected.w);
}
