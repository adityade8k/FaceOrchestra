import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MetronomePendulumRig } from "../../../src/instruments/metronome/MetronomePendulumRig.js";
import { MetronomeButtonRig } from "../../../src/instruments/metronome/MetronomeButtonRig.js";

async function load(name) {
  const data = await readFile(new URL(`../../../model/metronome/${name}.glb`, import.meta.url));
  const gltf = await new GLTFLoader().parseAsync(
    data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
    "",
  );
  gltf.scene.updateMatrixWorld(true);
  return gltf.scene;
}

function corners(root) {
  const result = [];
  root.traverse((mesh) => {
    if (!mesh.isMesh) return;
    const { position, uv, normal } = mesh.geometry.attributes;
    for (const i of mesh.geometry.index.array) {
      const point = new THREE.Vector3()
        .fromBufferAttribute(position, i)
        .applyMatrix4(mesh.matrixWorld);
      result.push({
        key: [uv.getX(i), uv.getY(i), normal.getX(i), normal.getY(i), normal.getZ(i)].join(","),
        point,
      });
    }
  });
  return result;
}

test("rigged eye-fix preserves every textured face at rest and removes no painted details", async () => {
  const source = corners(await load("metronome_eye_fix"));
  const prepared = corners(await load("metronome_eye_fix_rigged"));
  assert.equal(prepared.length, source.length, "No extra stationary eyes or missing surfaces");
  const buckets = new Map();
  for (const vertex of source) {
    if (!buckets.has(vertex.key)) buckets.set(vertex.key, []);
    buckets.get(vertex.key).push(vertex.point);
  }
  for (const vertex of prepared) {
    const candidates = buckets.get(vertex.key);
    assert.ok(candidates, "Original UV and normal preserved");
    const index = candidates.findIndex((point) => point.distanceTo(vertex.point) < 1e-6);
    assert.ok(index >= 0, "Every textured corner remains in its authored position");
    candidates.splice(index, 1);
  }
});

test("new eye buttons press into the face and release without changing their textures", async () => {
  const root = await load("metronome_eye_fix_rigged");
  const rig = new MetronomeButtonRig({ root });
  for (const [action, name] of [
    ["play", "L_button_geo"],
    ["pause", "R_button_geo"],
  ]) {
    const node = root.getObjectByName(name),
      position = node.position.clone();
    const uv = node.geometry.attributes.uv.array.slice(),
      material = node.material;
    assert.equal(node.parent, root, "Button offset is in model meters");
    rig.press(action, 1000);
    assert.ok(
      node.position.distanceTo(position.clone().add(new THREE.Vector3(0, 0, -0.003))) < 1e-10,
    );
    assert.equal(node.material, material);
    assert.deepEqual(node.geometry.attributes.uv.array, uv);
    rig.update(1141);
    assert.equal(rig.isPressed(action), action === "play");
    rig.reset();
    assert.ok(node.position.equals(position));
  }
});

test("new pendulum swings side to side about its fixed base and resets on pause", async () => {
  const root = await load("metronome_eye_fix_rigged");
  const rig = new MetronomePendulumRig({ THREE, root });
  const node = rig.node,
    position = node.position.clone(),
    quaternion = node.quaternion.clone();
  assert.equal(node.parent, root);
  assert.ok(Math.abs(position.y - 0.096618988) < 1e-7, "Mechanical hinge is at the base");
  const vertex = new THREE.Vector3(0, 0, -22),
    point = () => node.localToWorld(vertex.clone());
  const rest = point();
  rig.update({ nowMs: 1250, beatOriginMs: 1000, bpm: 120, playing: true });
  const left = point();
  rig.update({ nowMs: 1750, beatOriginMs: 1000, bpm: 120, playing: true });
  const right = point();
  assert.ok((left.x - rest.x) * (right.x - rest.x) < 0);
  assert.ok(Math.abs(left.x - rest.x) > 0.015);
  assert.ok(
    Math.abs(left.z - rest.z) < 1e-8 && Math.abs(right.z - rest.z) < 1e-8,
    "No swing into the wooden body",
  );
  assert.ok(node.position.equals(position));
  rig.update({ playing: false });
  assert.ok(node.quaternion.equals(quaternion));
  assert.ok(point().distanceTo(rest) < 1e-10);
});

test("pressed metronome eyes remain in front of the wooden face at normal and tutorial sizes", async () => {
  const root = await load("metronome_eye_fix_rigged");
  const rig = new MetronomeButtonRig({ root });
  const ray = new THREE.Raycaster();
  for (const size of [1, 1.75]) {
    root.scale.setScalar(size);
    root.updateMatrixWorld(true);
    for (const [action, name] of [
      ["play", "L_button_geo"],
      ["pause", "R_button_geo"],
    ]) {
      const eye = root.getObjectByName(name);
      const bounds = new THREE.Box3().setFromObject(eye);
      for (const pressed of [false, true]) {
        rig.setPressed(action, pressed);
        for (const u of [0.25, 0.5, 0.75]) {
          for (const v of [0.25, 0.5, 0.75]) {
            ray.set(
              new THREE.Vector3(
                THREE.MathUtils.lerp(bounds.min.x, bounds.max.x, u),
                THREE.MathUtils.lerp(bounds.min.y, bounds.max.y, v),
                bounds.max.z + 1,
              ),
              new THREE.Vector3(0, 0, -1),
            );
            assert.equal(
              ray.intersectObject(root, true)[0]?.object,
              eye,
              `${action} eye is visible at size ${size}, pressed ${pressed}, sample ${u}/${v}`,
            );
          }
        }
      }
      rig.reset();
    }
  }
});
