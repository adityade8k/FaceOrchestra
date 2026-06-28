import * as THREE from "three";

export class BaseInteractiveObject {
  constructor({ root = new THREE.Group(), name = "InteractiveObject" } = {}) {
    this.root = root;
    this.root.name = this.root.name || name;
    this.raycastTargets = new Set();
    this.disposed = false;
  }

  get position() {
    return this.root.position;
  }

  get rotation() {
    return this.root.rotation;
  }

  get quaternion() {
    return this.root.quaternion;
  }

  get scale() {
    return this.root.scale;
  }

  get visible() {
    return this.root.visible;
  }

  set visible(value) {
    this.root.visible = Boolean(value);
  }

  attachTo(parent) {
    parent?.add(this.root);
    return this;
  }

  detach() {
    this.root.removeFromParent();
    return this;
  }

  registerRaycastTarget(target) {
    if (!target) {
      return null;
    }

    target.userData.sceneObject = this;
    this.raycastTargets.add(target);
    return target;
  }

  unregisterRaycastTarget(target) {
    if (!target) {
      return;
    }

    if (target.userData.sceneObject === this) {
      delete target.userData.sceneObject;
    }
    this.raycastTargets.delete(target);
  }

  registerRaycastTargets(targets = []) {
    for (const target of targets) {
      this.registerRaycastTarget(target);
    }
  }

  clearRaycastTargets() {
    for (const target of this.raycastTargets) {
      if (target.userData.sceneObject === this) {
        delete target.userData.sceneObject;
      }
    }
    this.raycastTargets.clear();
  }

  getRaycastTargets() {
    return [...this.raycastTargets].filter((target) => target?.visible !== false);
  }

  duplicate({ cloneRoot = (root) => root.clone(true) } = {}) {
    return new this.constructor({
      root: cloneRoot(this.root),
      name: this.root.name,
    });
  }

  update() {}

  onTrigger() {}

  onGrip() {}

  onHover() {}

  onDrag() {}

  onRelease() {}

  dispose() {
    if (this.disposed) {
      return;
    }

    this.clearRaycastTargets();
    this.detach();
    this.disposed = true;
  }
}
