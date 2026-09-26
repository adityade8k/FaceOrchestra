import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { LooperColliderFactory } from "../../../src/instruments/looper/LooperColliderFactory.js";
import {
  getWireSocketTangent,
  updateConnectionWireBetweenTargets,
  updateConnectionWireToPoint,
} from "../../../src/instruments/core/view/connectionWirePresentation.js";

test("bank metadata preserves outward tangents through parent rotation/scale, duplication and restore", () => {
  const root = new THREE.Group();
  root.add(
    new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()),
  );
  const targets = new LooperColliderFactory({
    makeHitTargetMaterial: () => new THREE.MeshBasicMaterial(),
  }).create(root);
  const sockets = Object.values(targets).filter((n) => n.userData.isLooperNode);
  assert.equal(sockets.length, 8);
  const parent = new THREE.Group();
  parent.add(root);
  parent.rotation.set(0.2, 0.5, 0.1);
  parent.scale.set(2, 3, 1.5);
  root.position.set(1, 2, -1);
  root.rotation.set(0.4, -0.6, 0.3);
  root.scale.setScalar(0.7);
  parent.updateMatrixWorld(true);
  for (const socket of sockets) {
    const side = socket.userData.looperBank === "left" ? -1 : 1;
    const expected = new THREE.Vector3(side, 0, 0).transformDirection(
      root.matrixWorld,
    );
    const endpoint = socket.getWorldPosition(new THREE.Vector3());
    assert.ok(
      getWireSocketTangent(socket, root, endpoint).distanceTo(expected) < 1e-12,
    );
    assert.ok(
      getWireSocketTangent(
        socket,
        root,
        endpoint,
        new THREE.Vector3(),
        true,
      ).distanceTo(expected.clone().negate()) < 1e-12,
    );
    const duplicate = socket.clone();
    root.add(duplicate);
    assert.deepEqual(
      duplicate.userData.wireSocketOutward,
      socket.userData.wireSocketOutward,
    );
    const end = new THREE.Object3D();
    end.position.set(4, 2, 2);
    parent.add(end);
    parent.updateMatrixWorld(true);
    const preview = new THREE.Mesh(new THREE.BufferGeometry()),
      completed = new THREE.Mesh(new THREE.BufferGeometry());
    updateConnectionWireToPoint({
      wireMesh: preview,
      startTarget: socket,
      startOwnerRoot: root,
      endPoint: end.getWorldPosition(new THREE.Vector3()),
      endTarget: end,
      endOwnerRoot: parent,
    });
    updateConnectionWireBetweenTargets({
      wireMesh: completed,
      startTarget: socket,
      startOwnerRoot: root,
      endTarget: end,
      endOwnerRoot: parent,
    });
    assert.deepEqual(
      [...preview.geometry.attributes.position.array],
      [...completed.geometry.attributes.position.array],
    );
    const geometry = completed.geometry;
    updateConnectionWireBetweenTargets({
      wireMesh: completed,
      startTarget: socket,
      startOwnerRoot: root,
      endTarget: end,
      endOwnerRoot: parent,
    });
    assert.equal(
      completed.geometry,
      geometry,
      "unchanged paths retain geometry cache",
    );
  }
});
