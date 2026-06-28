import * as THREE from "three";
import { CHORD_BOX_SCALE } from "../config/honk.js";

const tempBox = new THREE.Box3();
const tempCenter = new THREE.Vector3();
const tempSize = new THREE.Vector3();

export function setModelBounds(root, targetBox) {
  targetBox.makeEmpty();
  root.updateWorldMatrix(true, true);
  root.traverse((object) => {
    if (!object.isMesh || object.userData.isHitTarget || object.name.startsWith("DEBUG_")) {
      return;
    }
    tempBox.setFromObject(object);
    targetBox.union(tempBox);
  });
  return targetBox;
}

export function setChordBounds(root, targetBox) {
  setModelBounds(root, targetBox);
  if (targetBox.isEmpty()) {
    return targetBox;
  }

  targetBox.getCenter(tempCenter);
  targetBox.getSize(tempSize);
  tempSize.set(
    tempSize.x * Math.max(CHORD_BOX_SCALE.x, 0),
    tempSize.y * Math.max(CHORD_BOX_SCALE.y, 0),
    tempSize.z * Math.max(CHORD_BOX_SCALE.z, 0),
  );
  targetBox.setFromCenterAndSize(tempCenter, tempSize);
  return targetBox;
}
