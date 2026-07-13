import * as THREE from "three";
import {
  GRIP_TRANSFORM_COLLIDER_SETTINGS,
  INTERACTION_TARGET_NAMES,
} from "../../config/honk.js";

const tempBoxCenter = new THREE.Vector3();
const tempBoxSize = new THREE.Vector3();

export function createBodyGripTarget(
  root,
  hitTargets,
  { makeHitTargetMaterial, hitMarkerOpacity },
) {
  const bodyBox = new THREE.Box3();
  let hasVisibleMesh = false;
  root.traverse((object) => {
    if (object.isMesh && !object.userData.isHitTarget) {
      object.updateWorldMatrix(true, false);
      bodyBox.expandByObject(object);
      hasVisibleMesh = true;
    }
  });

  if (!hasVisibleMesh || bodyBox.isEmpty()) {
    return null;
  }

  bodyBox.getCenter(tempBoxCenter);
  bodyBox.getSize(tempBoxSize);
  const bodyScale = GRIP_TRANSFORM_COLLIDER_SETTINGS.relativeScale;
  const geometry = new THREE.BoxGeometry(
    tempBoxSize.x * getRelativeScaleAxis(bodyScale, "x"),
    tempBoxSize.y * getRelativeScaleAxis(bodyScale, "y"),
    tempBoxSize.z * getRelativeScaleAxis(bodyScale, "z"),
  );
  markOwnedResource(geometry);
  const material = makeHitTargetMaterial(INTERACTION_TARGET_NAMES.body);
  markOwnedResource(material);
  const bodyTarget = new THREE.Mesh(geometry, material);
  bodyTarget.name = INTERACTION_TARGET_NAMES.body;
  bodyTarget.position.copy(tempBoxCenter);
  bodyTarget.userData.isHitTarget = true;
  bodyTarget.userData.isBodyGripTarget = true;
  bodyTarget.userData.baseHitOpacity = hitMarkerOpacity;
  bodyTarget.material.opacity = bodyTarget.userData.baseHitOpacity;
  bodyTarget.renderOrder = GRIP_TRANSFORM_COLLIDER_SETTINGS.renderOrder;

  root.add(bodyTarget);
  hitTargets[INTERACTION_TARGET_NAMES.body] = bodyTarget;
  return bodyTarget;
}

function getRelativeScaleAxis(scale, axis) {
  if (Number.isFinite(scale)) {
    return scale;
  }
  return getNumber(scale?.[axis], GRIP_TRANSFORM_COLLIDER_SETTINGS.defaultRelativeScale);
}

function getNumber(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function markOwnedResource(resource) {
  if (!resource) {
    return;
  }
  resource.userData ||= {};
  resource.userData.disposeWithOwner = true;
  resource.userData.disposeOnInstrumentDelete = true;
}
