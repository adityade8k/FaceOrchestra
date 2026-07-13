import { STICK_SETTINGS } from "../../config/stick.js";
import { applyLocalTransform } from "./StickEquipmentSystem.js";

export class StickColliderFactory {
  constructor({ THREE, settings = STICK_SETTINGS.collider, showDebug = false } = {}) {
    if (!THREE) {
      throw new TypeError("StickColliderFactory requires the Three.js namespace.");
    }
    this.THREE = THREE;
    this.settings = settings;
    this.showDebug = showDebug;
  }

  create({ ownerId = null } = {}) {
    if (this.settings?.enabled === false) {
      return null;
    }
    const geometry = new this.THREE.BoxGeometry(1, 1, 1);
    geometry.userData.disposeWithOwner = true;
    const material = new this.THREE.MeshBasicMaterial({
      color: this.settings.color ?? 0xf7d04a,
      transparent: true,
      opacity: this.showDebug ? this.settings.opacity ?? 0.28 : 0,
      depthWrite: false,
      wireframe: this.showDebug,
    });
    material.userData.disposeWithOwner = true;
    const collider = new this.THREE.Mesh(geometry, material);
    collider.name = "STICK_collider";
    collider.renderOrder = this.settings.renderOrder ?? 32;
    collider.userData.isStickStrikeCollider = true;
    collider.userData.stick = Object.freeze({ ownerId, role: "stick.strike-volume" });
    applyLocalTransform(collider, {
      position: this.settings.position,
      rotationDegrees: this.settings.rotationDegrees,
      scale: this.settings.scale,
    });
    return collider;
  }
}
