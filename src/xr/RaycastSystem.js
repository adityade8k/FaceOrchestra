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
    this.intersectTargets();
    const nearest = this.intersections[0] || null;
    const hit =
      (nearest?.object.userData.isCloseButton || this.isLooperTarget(nearest?.object) ? nearest : null) ||
      this.intersections.find(({ object }) => object.userData.isHonkConnectionTarget) ||
      this.intersections.find(({ object }) => this.isLooperTarget(object)) ||
      this.intersections.find(({ object }) => object.userData.isProceduralMorphTarget) ||
      this.intersections.find(({ object }) => !object.userData.isBodyGripTarget) ||
      nearest;
    if (this.debug && hit) console.log("Ray hit:", hit.object.name);
    return hit || null;
  }

  getLockedInstrumentFromRay(controller) {
    if (!controller) return null;
    this.setFromController(controller);
    this.targets.length = 0;
    const seen = new Set();
    for (const instrument of this.getInstruments()) {
      if (!instrument?.locked || !instrument.root?.visible || !this.canLock(instrument)) continue;
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
    if (!this.targets.length) return null;
    this.intersections.length = 0;
    this.intersectTargets();
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
    this.intersectTargets();
    return this.intersections.find(({ object }) => this.resolveOwner(object)?.root?.visible) || null;
  }

  intersectTargets() {
    // Scope the authoritative pose to an owner's complete query, instead of
    // entering/restoring it for every authored mesh. The mesh wrappers remain
    // useful for standalone raycasts and nest without applying the pose twice.
    const byOwner = new Map();
    for (const target of this.targets) {
      const owner = this.resolveOwner(target);
      let belongsToOwner = !owner;
      let visible = true;
      for (let object = target; object; object = object.parent) {
        if (object.visible === false) visible = false;
        if (object === owner?.root) belongsToOwner = true;
      }
      if (!visible || !belongsToOwner || owner?.disposed) continue;
      let targets = byOwner.get(owner);
      if (!targets) byOwner.set(owner, targets = []);
      targets.push(target);
    }
    for (const [owner, targets] of byOwner) {
      // Queries may follow grip, scale, collider or parent changes within the
      // same frame. Refresh transforms; no frame-number geometry cache is used.
      if (owner) owner.root.updateWorldMatrix(true, true);
      else for (const target of targets) target.updateWorldMatrix(true, true);
      const intersect = () => this.raycaster.intersectObjects(targets, true, this.intersections);
      if (owner?.withInteractionPose) owner.withInteractionPose(intersect);
      else intersect();
    }
  }

  setFromController(controller) {
    controller.updateWorldMatrix(true, false);
    tempMatrix.identity().extractRotation(controller.matrixWorld);
    this.raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    this.raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);
  }
}
