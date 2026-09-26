import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { AssetRepository } from "../../src/scene/AssetRepository.js";
test("repository releases each shared resource once, including late loads and failed retry", async () => {
  const geometry = new THREE.BoxGeometry(),
    texture = new THREE.Texture(),
    material = new THREE.MeshBasicMaterial({ map: texture });
  let released = 0;
  for (const r of [geometry, texture, material])
    r.addEventListener("dispose", () => released++);
  const root = new THREE.Group();
  root.add(
    new THREE.Mesh(geometry, material),
    new THREE.Mesh(geometry, material),
  );
  const repository = new AssetRepository({
    gltfLoader: { loadAsync: async () => ({ scene: root }) },
  });
  await repository.loadModel("test", "/test.glb");
  const clone = repository.cloneModel(root);
  clone.removeFromParent();
  assert.equal(released, 0);
  await repository.clear();
  await repository.clear();
  assert.equal(released, 3);
  let finish;
  const late = new AssetRepository({
    gltfLoader: {
      loadAsync: () =>
        new Promise((r) => {
          finish = r;
        }),
    },
  });
  const pending = late.loadModel("late", "/late.glb");
  const rejection = assert.rejects(pending, /after disposal/);
  const closing = late.clear();
  finish({ scene: new THREE.Group() });
  await rejection;
  await closing;
});
