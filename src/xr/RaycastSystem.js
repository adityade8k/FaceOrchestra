import * as THREE from "three";
import { INTERACTION_TARGET_NAMES } from "../config/honk.js";

const tempMatrix = new THREE.Matrix4();

export class RaycastSystem {
  constructor({
    raycaster,
    getInstruments,
    getCloseButton,
    isPanelVisible,
    resolveOwner,
    getTargets = (instrument) => instrument?.getInteractionTargets?.() || instrument?.hitTargetList || [],
    isLooperTarget = (target) => Boolean(target?.userData.isLooperCollider),
    canLock = (instrument) => Boolean(instrument?.canTransform),
    debug = false,
  }) {
    this.raycaster = raycaster;
    this.getInstruments = getInstruments;
    this.getCloseButton = getCloseButton;
    this.isPanelVisible = isPanelVisible;
    this.resolveOwner = resolveOwner;
    this.getTargets = getTargets;
    this.isLooperTarget = isLooperTarget;
    this.canLock = canLock;
    this.debug = debug;
    this.targets = [];
    this.intersections = [];
  }

  getCurrentHit(controller) {
    if (!controller) return null;
    this.setFromController(controller);
    this.targets.length = 0;
    const closeButton = this.getCloseButton?.();
    if (this.isPanelVisible?.() && closeButton) this.targets.push(closeButton);
    for (const instrument of this.getInstruments()) {
      if (!instrument?.root?.visible) continue;
      this.targets.push(...this.getTargets(instrument));
    }

    this.intersections.length = 0;
    this.raycaster.intersectObjects(this.targets, true, this.intersections);
    const nearest = this.intersections[0] || null;
    const hit =
      (nearest?.object.userData.isCloseButton || this.isLooperTarget(nearest?.object) ? nearest : null) ||
      this.intersections.find(({ object }) => object.userData.isHonkConnectionTarget) ||
      this.intersections.find(({ object }) => this.isLooperTarget(object)) ||
      this.intersections.find(({ object }) => object.userData.isProceduralMorphTarget) ||
      this.intersections.find(({ object }) => object.name !== INTERACTION_TARGET_NAMES.body) ||
      nearest;
    if (this.debug && hit) console.log("Ray hit:", hit.object.name);
    return hit || null;
  }

  getLockedInstrumentFromRay(controller) {
    if (!controller) return null;
    this.setFromController(controller);
    this.targets.length = 0;
    for (const instrument of this.getInstruments()) {
      const body = instrument?.hitTargets?.[INTERACTION_TARGET_NAMES.body];
      if (instrument?.locked && instrument.root?.visible && this.canLock(instrument) && body) this.targets.push(body);
    }
    if (!this.targets.length) return null;
    this.intersections.length = 0;
    this.raycaster.intersectObjects(this.targets, false, this.intersections);
    return this.resolveOwner(this.intersections[0]?.object) || null;
  }

  getGripHit(controller) {
    if (!controller) return null;
    this.setFromController(controller);
    this.targets.length = 0;
    const seen = new Set();
    for (const instrument of this.getInstruments()) {
      if (!instrument?.root?.visible) continue;
      for (const target of [
        instrument.hitTargets?.[INTERACTION_TARGET_NAMES.body],
        ...(instrument.gripTargetList || []),
      ]) {
        if (target?.visible !== false && target?.userData.isBodyGripTarget && !seen.has(target)) {
          seen.add(target);
          this.targets.push(target);
        }
      }
    }
    this.intersections.length = 0;
    this.raycaster.intersectObjects(this.targets, true, this.intersections);
    return this.intersections.find(({ object }) => this.resolveOwner(object)?.root?.visible) || null;
  }

  setFromController(controller) {
    controller.updateMatrixWorld(true);
    tempMatrix.identity().extractRotation(controller.matrixWorld);
    this.raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    this.raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);
  }
}
