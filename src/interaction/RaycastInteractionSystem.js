import * as THREE from "three";
import { INTERACTION_TARGET_NAMES } from "../config/honk.js";

const tempMatrix = new THREE.Matrix4();

export class RaycastInteractionSystem {
  constructor({
    raycaster,
    targets = [],
    intersections = [],
    lockedIntersections = [],
    getInstrumentStates,
    getCloseButton,
    isPanelVisible,
    isSequencerColliderTarget,
    debugRaycast = false,
  }) {
    this.raycaster = raycaster;
    this.targets = targets;
    this.intersections = intersections;
    this.lockedIntersections = lockedIntersections;
    this.getInstrumentStates = getInstrumentStates;
    this.getCloseButton = getCloseButton;
    this.isPanelVisible = isPanelVisible;
    this.isSequencerColliderTarget = isSequencerColliderTarget;
    this.debugRaycast = debugRaycast;
  }

  getCurrentHit(controller) {
    if (!controller) {
      return null;
    }

    this.setFromController(controller);

    const targets = this.targets;
    targets.length = 0;
    const closeButton = this.getCloseButton();
    if (this.isPanelVisible() && closeButton) {
      targets.push(closeButton);
    }

    for (const state of this.getInstrumentStates()) {
      if (!state.root.visible) {
        continue;
      }

      const raycastTargets = state.sceneObject?.getRaycastTargets?.() || state.hitTargetList;
      for (const target of raycastTargets) {
        targets.push(target);
      }
    }

    const intersections = this.intersections;
    intersections.length = 0;
    this.raycaster.intersectObjects(targets, true, intersections);
    const nearestHit = intersections[0] || null;
    const priorityHit =
      nearestHit?.object.userData.isCloseButton || this.isSequencerColliderTarget(nearestHit?.object)
        ? nearestHit
        : null;
    const hit =
      priorityHit ||
      intersections.find((intersection) => intersection.object.userData.isHonkConnectionTarget) ||
      intersections.find((intersection) => this.isSequencerColliderTarget(intersection.object)) ||
      intersections.find((intersection) => intersection.object.userData.isProceduralMorphTarget) ||
      intersections.find((intersection) => intersection.object.name !== INTERACTION_TARGET_NAMES.body) ||
      intersections[0] ||
      null;

    if (this.debugRaycast && hit) {
      console.log("Ray hit:", hit.object.name);
    }

    return hit;
  }

  getLockedInstrumentStateFromRay(controller) {
    if (!controller) {
      return null;
    }

    this.setFromController(controller);

    const lockedBodyTargets = this.targets;
    lockedBodyTargets.length = 0;
    for (const state of this.getInstrumentStates()) {
      const bodyTarget = state.hitTargets?.[INTERACTION_TARGET_NAMES.body];
      if (state.locked && state.interactive && state.root.visible && bodyTarget) {
        lockedBodyTargets.push(bodyTarget);
      }
    }

    if (lockedBodyTargets.length === 0) {
      return null;
    }

    const intersections = this.lockedIntersections;
    intersections.length = 0;
    this.raycaster.intersectObjects(lockedBodyTargets, false, intersections);
    return intersections[0]?.object?.userData.instrumentState || null;
  }

  getGripHit(controller) {
    if (!controller) {
      return null;
    }

    this.setFromController(controller);

    const gripTargets = this.targets;
    gripTargets.length = 0;
    for (const state of this.getInstrumentStates()) {
      if (!state.root.visible) {
        continue;
      }

      for (const target of state.hitTargetList || []) {
        gripTargets.push(target);
      }
      for (const target of state.gripTargetList || []) {
        if (target?.visible !== false) {
          gripTargets.push(target);
        }
      }
    }

    if (gripTargets.length === 0) {
      return null;
    }

    const intersections = this.lockedIntersections;
    intersections.length = 0;
    this.raycaster.intersectObjects(gripTargets, true, intersections);
    return (
      intersections.find((intersection) => intersection.object.userData.instrumentState?.root?.visible) ||
      null
    );
  }

  setFromController(controller) {
    controller.updateMatrixWorld(true);
    tempMatrix.identity().extractRotation(controller.matrixWorld);
    this.raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    this.raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);
  }
}
