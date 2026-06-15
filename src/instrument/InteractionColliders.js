import * as THREE from "three";
import { DEBUG_SHOW_COLLIDERS, INTERACTION_COLLIDERS, INTERACTION_TARGET_NAMES } from "../config.js";

const HIT_MARKER_OPACITY = DEBUG_SHOW_COLLIDERS ? 0.24 : 0;

const tempBox = new THREE.Box3();
const tempBoxCenter = new THREE.Vector3();
const tempBoxSize = new THREE.Vector3();

export function getHitTargetColor(name) {
  return {
    [INTERACTION_TARGET_NAMES.mouth]: 0xf0a23c,
    [INTERACTION_TARGET_NAMES.horn]: 0xf7d04a,
    [INTERACTION_TARGET_NAMES.nose]: 0x5ac8fa,
    [INTERACTION_TARGET_NAMES.leftEar]: 0x72d572,
    [INTERACTION_TARGET_NAMES.rightEar]: 0x9e8cff,
    [INTERACTION_TARGET_NAMES.body]: 0xffffff,
  }[name] || 0xffffff;
}

export function makeHitTargetMaterial(name) {
  return new THREE.MeshBasicMaterial({
    color: getHitTargetColor(name),
    transparent: true,
    opacity: HIT_MARKER_OPACITY,
    depthWrite: false,
    wireframe: DEBUG_SHOW_COLLIDERS,
  });
}

export function collectHitTargets(root) {
  const hitTargets = {};

  root.traverse((object) => {
    if (!object.name || !object.name.startsWith("HIT_")) {
      return;
    }

    hitTargets[object.name] = object;
    configureHitTarget(object);
  });

  return hitTargets;
}

export function configureHitTarget(object) {
  object.userData.isHitTarget = true;
  object.userData.baseHitOpacity = HIT_MARKER_OPACITY;

  if (object.isMesh) {
    object.material = makeHitTargetMaterial(object.name);
    object.material.opacity = HIT_MARKER_OPACITY;
    object.material.transparent = true;
    object.material.depthWrite = false;
    object.visible = true;
    object.renderOrder = object.userData.isProceduralMorphTarget ? 20 : 10;
  }
}

export function createBodyGripTarget(root, hitTargets) {
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
    console.warn(`Expected HIT_ collider missing: ${INTERACTION_TARGET_NAMES.body}`);
    return;
  }

  bodyBox.getCenter(tempBoxCenter);
  bodyBox.getSize(tempBoxSize);
  const bodyTarget = new THREE.Mesh(
    new THREE.BoxGeometry(tempBoxSize.x * 1.12, tempBoxSize.y * 1.12, tempBoxSize.z * 1.12),
    makeHitTargetMaterial(INTERACTION_TARGET_NAMES.body),
  );
  bodyTarget.name = INTERACTION_TARGET_NAMES.body;
  bodyTarget.position.copy(tempBoxCenter);
  bodyTarget.userData.isHitTarget = true;
  bodyTarget.userData.isBodyGripTarget = true;
  bodyTarget.userData.baseHitOpacity = HIT_MARKER_OPACITY;
  bodyTarget.material.opacity = HIT_MARKER_OPACITY;
  bodyTarget.renderOrder = 5;

  root.add(bodyTarget);
  hitTargets[INTERACTION_TARGET_NAMES.body] = bodyTarget;
}

export function createProceduralColliders(root, hitTargets) {
  tempBox.setFromObject(root);
  tempBox.getCenter(tempBoxCenter);
  tempBox.getSize(tempBoxSize);

  const maxSize = Math.max(tempBoxSize.x, tempBoxSize.y, tempBoxSize.z);

  for (const target of INTERACTION_COLLIDERS) {
    if (hitTargets[target.name]) {
      continue;
    }

    const radius = maxSize * target.size;
    const travel = tempBoxSize.y * target.movementRange;
    const neutralY = tempBoxCenter.y + target.y * tempBoxSize.y;
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 24, 16),
      new THREE.MeshBasicMaterial({
        color: target.color,
        transparent: true,
        opacity: HIT_MARKER_OPACITY,
        depthWrite: false,
        wireframe: DEBUG_SHOW_COLLIDERS,
      }),
    );

    sphere.name = target.name;
    sphere.userData.isHitTarget = true;
    sphere.userData.isProceduralMorphTarget = true;
    sphere.userData.interactionType = target.type;
    sphere.userData.side = target.side;
    sphere.userData.invertVerticalMorph = Boolean(target.invertVerticalMorph);
    sphere.userData.baseHitOpacity = HIT_MARKER_OPACITY;
    sphere.renderOrder = 20;
    sphere.userData.neutralY = neutralY;
    sphere.userData.minY = neutralY - travel;
    sphere.userData.maxY = neutralY + travel;
    sphere.position.set(
      tempBoxCenter.x + target.x * tempBoxSize.x,
      neutralY,
      tempBoxCenter.z + target.z * tempBoxSize.z,
    );

    root.add(sphere);
    hitTargets[target.name] = sphere;
  }
}

export function updateColliderVisibility(root) {
  root.traverse((object) => {
    if (!object.userData.isHitTarget || !object.isMesh) {
      return;
    }
    object.material.opacity = HIT_MARKER_OPACITY;
    object.material.wireframe = DEBUG_SHOW_COLLIDERS;
  });
}

export function validateHitTargets(hitTargets) {
  for (const hitName of Object.values(INTERACTION_TARGET_NAMES)) {
    if (!hitTargets[hitName]) {
      console.warn(`Expected HIT_ collider missing: ${hitName}`);
    }
  }
}
