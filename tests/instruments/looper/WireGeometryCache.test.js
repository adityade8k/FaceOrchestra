import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  createWireCurve,
  updateWireMeshGeometry,
} from "../../../src/instruments/looper/view/wireUtils.js";

const fixedTopology = { minTubularSegments: 24, maxTubularSegments: 24 };

test("stationary wires retain the path plan and buffers; mutated settings and normalized directions invalidate correctly", () => {
  const wire = new THREE.Mesh(new THREE.BufferGeometry());
  const start = new THREE.Vector3(0, 1, 0),
    end = new THREE.Vector3(1, 1, 0);
  const startTangent = new THREE.Vector3(1, 0, 0);
  const settings = { ...fixedTopology, radius: 0.008 };
  const options = { startTangent, settings };
  assert.equal(updateWireMeshGeometry(wire, start, end, options), true);
  const geometry = wire.geometry,
    plan = wire.userData.wirePathPlan;
  const buffer = geometry.attributes.position.array;
  for (let i = 0; i < 200; i++)
    assert.equal(updateWireMeshGeometry(wire, start, end, options), false);
  assert.equal(wire.userData.wirePathPlan, plan, "idle frames must not allocate a new path plan");
  assert.equal(wire.geometry.attributes.position.array, buffer);
  startTangent.multiplyScalar(2);
  assert.equal(
    updateWireMeshGeometry(wire, start, end, options),
    false,
    "direction, not vector magnitude, determines the path",
  );
  settings.radius = 0.012;
  assert.equal(updateWireMeshGeometry(wire, start, end, options), true);
  assert.equal(wire.geometry, geometry);
  assert.equal(wire.geometry.parameters.radius, 0.012, "capture sees the updated radius");
  settings.sagRatio = 0.2;
  assert.equal(updateWireMeshGeometry(wire, start, end, options), true);
  assert.notEqual(wire.userData.wirePathPlan, plan, "capture sees the new path plan");
  startTangent.set(0, 1e-7, 0);
  assert.equal(
    updateWireMeshGeometry(wire, start, end, options),
    true,
    "small nonzero tangents still have an authoritative direction",
  );
  wire.geometry.dispose();
});

test("moving wires reuse GPU attributes and match fresh tube positions/normals with valid culling bounds", () => {
  const wire = new THREE.Mesh(new THREE.BufferGeometry());
  const start = new THREE.Vector3(0, 1, 0),
    end = new THREE.Vector3(1, 1, 0);
  const options = {
    settings: fixedTopology,
    startTangent: new THREE.Vector3(0, 0, -1),
    endTangent: new THREE.Vector3(1, 0, 0),
  };
  updateWireMeshGeometry(wire, start, end, options);
  const geometry = wire.geometry,
    position = geometry.attributes.position,
    normal = geometry.attributes.normal,
    uv = geometry.attributes.uv,
    index = geometry.index;
  geometry.computeBoundingSphere();
  const previousBound = geometry.boundingSphere.clone();
  for (const point of [
    [2, 2, 1],
    [3, -1, -2],
    [0.1, 0.2, 0.4],
  ]) {
    end.set(...point);
    const version = position.version;
    assert.equal(updateWireMeshGeometry(wire, start, end, options), true);
    assert.equal(wire.geometry, geometry);
    assert.equal(geometry.attributes.position, position);
    assert.equal(geometry.attributes.normal, normal);
    assert.equal(geometry.attributes.uv, uv);
    assert.equal(geometry.index, index);
    assert.equal(position.version, version + 1);
    assert.equal(geometry.boundingSphere, null, "moving paths invalidate stale frustum/ray bounds");
    const expected = new THREE.TubeGeometry(
      createWireCurve(start, end, options),
      24,
      0.008,
      7,
      false,
    );
    assert.deepEqual(position.array, expected.attributes.position.array);
    assert.deepEqual(normal.array, expected.attributes.normal.array);
    geometry.computeBoundingSphere();
    assert.notDeepEqual(geometry.boundingSphere, previousBound);
    expected.dispose();
  }
  let disposals = 0;
  geometry.addEventListener("dispose", () => disposals++);
  updateWireMeshGeometry(wire, start, end, {
    ...options,
    settings: { ...fixedTopology, radialSegments: 9 },
  });
  assert.notEqual(wire.geometry, geometry, "topology changes allocate appropriate buffers");
  assert.equal(disposals, 1);
  wire.geometry.dispose();
});

test("crossing the minimum length changes visibility even within the position epsilon", () => {
  const wire = new THREE.Mesh(new THREE.BufferGeometry());
  const start = new THREE.Vector3(),
    end = new THREE.Vector3(0.0039, 0, 0);
  updateWireMeshGeometry(wire, start, end);
  assert.equal(wire.visible, false);
  end.x = 0.0041;
  assert.equal(updateWireMeshGeometry(wire, start, end), true);
  assert.equal(wire.visible, true);
  end.x = 0.0039;
  updateWireMeshGeometry(wire, start, end);
  assert.equal(wire.visible, false);
  wire.geometry.dispose();
});
