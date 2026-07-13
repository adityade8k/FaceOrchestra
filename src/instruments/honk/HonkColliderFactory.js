import { DEBUG_SHOW_COLLIDERS } from "../../config/debug.js";
import {
  BEND_ALIGNED_COLLIDER_GROUP_NAME,
  BEND_ALIGNED_INTERACTION_TYPES,
  GRIP_TRANSFORM_COLLIDER_SETTINGS,
  HONK_CONNECTION_COLLIDER_SETTINGS,
  INTERACTION_COLLIDERS,
  INTERACTION_TARGET_NAMES,
  INTERACTION_TYPES,
  MORPH_TARGET_COLLIDER_SETTINGS,
  MORPH_TARGET_NAMES,
} from "../../config/honk.js";
import {
  HONK_CONNECTION_COLLIDER_OPACITY,
  HONK_CONNECTION_TARGET_NAME,
  LOOPER_DEBUG_COLORS,
} from "../../config/looper.js";
import { HONK_INTERACTION_ROLES } from "./HonkInstrument.js";

export class HonkColliderFactory {
  constructor({ THREE, showDebug = DEBUG_SHOW_COLLIDERS } = {}) {
    if (!THREE) {
      throw new TypeError("HonkColliderFactory requires the Three.js namespace.");
    }
    this.THREE = THREE;
    this.showDebug = showDebug;
    this.box = new THREE.Box3();
    this.center = new THREE.Vector3();
    this.size = new THREE.Vector3();
  }

  create(root) {
    this.measureModel(root);
    const targets = {};
    const bendAlignedGroup = this.createBendAlignedGroup(root);
    targets[HONK_INTERACTION_ROLES.body] = this.createBodyTarget(root);

    for (const config of INTERACTION_COLLIDERS) {
      const parent = BEND_ALIGNED_INTERACTION_TYPES.includes(config.type) ? bendAlignedGroup : root;
      const collider = this.createInteractionTarget(parent, bendAlignedGroup, config);
      targets[roleForInteraction(config)] = collider;
    }
    targets[HONK_INTERACTION_ROLES.looperConnector] = this.createLooperConnector(root);
    return { targets, bendAlignedGroup };
  }

  measureModel(root) {
    this.box.makeEmpty();
    root.updateMatrixWorld?.(true);
    root.traverse((object) => {
      if (
        object.isMesh &&
        !object.userData?.isHitTarget &&
        !object.userData?.interactionTarget
      ) {
        this.box.expandByObject(object);
      }
    });
    this.box.getCenter(this.center);
    this.box.getSize(this.size);
  }

  createBendAlignedGroup(root) {
    const group = new this.THREE.Group();
    group.name = BEND_ALIGNED_COLLIDER_GROUP_NAME;
    group.position.copy(this.center);
    root.add(group);
    return group;
  }

  createBodyTarget(root) {
    const relativeScale = GRIP_TRANSFORM_COLLIDER_SETTINGS.relativeScale;
    const target = new this.THREE.Mesh(
      new this.THREE.BoxGeometry(
        this.size.x * axisScale(relativeScale, "x"),
        this.size.y * axisScale(relativeScale, "y"),
        this.size.z * axisScale(relativeScale, "z"),
      ),
      this.createMaterial(0xffffff),
    );
    markOwnedGeometry(target.geometry);
    target.name = INTERACTION_TARGET_NAMES.body;
    target.position.copy(this.center);
    target.renderOrder = GRIP_TRANSFORM_COLLIDER_SETTINGS.renderOrder;
    markTarget(target, "honk.body", this.showDebug ? 0.24 : 0);
    root.add(target);
    return target;
  }

  createInteractionTarget(parent, bendAlignedGroup, config) {
    const maxSize = Math.max(this.size.x, this.size.y, this.size.z);
    const radius = maxSize * config.size;
    const travel = this.size.y * config.movementRange;
    const neutralY = this.center.y + config.y * this.size.y;
    const bendAligned = parent === bendAlignedGroup;
    const parentOffsetY = bendAligned ? bendAlignedGroup.position.y : 0;
    const target = new this.THREE.Mesh(
      new this.THREE.SphereGeometry(
        radius,
        MORPH_TARGET_COLLIDER_SETTINGS.sphereSegments,
        MORPH_TARGET_COLLIDER_SETTINGS.sphereRings,
      ),
      this.createMaterial(config.color),
    );
    markOwnedGeometry(target.geometry);
    target.name = config.name;
    target.position.set(
      this.center.x + config.x * this.size.x - (bendAligned ? bendAlignedGroup.position.x : 0),
      neutralY - parentOffsetY,
      this.center.z + config.z * this.size.z - (bendAligned ? bendAlignedGroup.position.z : 0),
    );
    target.renderOrder = MORPH_TARGET_COLLIDER_SETTINGS.renderOrder;
    markTarget(target, roleForInteraction(config), this.showDebug ? 0.24 : 0);
    Object.assign(target.userData, {
      isProceduralMorphTarget: true,
      interactionType: config.type,
      side: config.side,
      colliderRadius: radius,
      invertVerticalMorph: Boolean(config.invertVerticalMorph),
      neutralY: neutralY - parentOffsetY,
      minY: neutralY - travel - parentOffsetY,
      maxY: neutralY + travel - parentOffsetY,
      positiveMorphName: getPositiveMorph(config),
      negativeMorphName: getNegativeMorph(config),
      morphName: config.type === INTERACTION_TYPES.nose ? MORPH_TARGET_NAMES.nose : null,
    });
    const worldCenter = new this.THREE.Vector3();
    const worldScale = new this.THREE.Vector3();
    target.userData.getWorldSphere = () => {
      target.updateWorldMatrix(true, false);
      target.getWorldPosition(worldCenter);
      target.getWorldScale(worldScale);
      return {
        center: worldCenter,
        radius: radius * Math.max(Math.abs(worldScale.x), Math.abs(worldScale.y), Math.abs(worldScale.z)),
      };
    };
    parent.add(target);
    return target;
  }

  createLooperConnector(root) {
    const maxSize = Math.max(
      this.size.x,
      this.size.y,
      this.size.z,
      HONK_CONNECTION_COLLIDER_SETTINGS.minModelSize,
    );
    const radius = maxSize * HONK_CONNECTION_COLLIDER_SETTINGS.scale;
    const target = new this.THREE.Mesh(
      new this.THREE.SphereGeometry(
        radius,
        HONK_CONNECTION_COLLIDER_SETTINGS.sphereSegments,
        HONK_CONNECTION_COLLIDER_SETTINGS.sphereRings,
      ),
      this.createMaterial(LOOPER_DEBUG_COLORS.honkConnection, HONK_CONNECTION_COLLIDER_OPACITY),
    );
    markOwnedGeometry(target.geometry);
    const position = HONK_CONNECTION_COLLIDER_SETTINGS.position;
    target.name = HONK_CONNECTION_TARGET_NAME;
    target.position.set(
      this.center.x + this.size.x * position.x,
      this.center.y + this.size.y * position.y,
      this.center.z + this.size.z * position.z,
    );
    target.renderOrder = HONK_CONNECTION_COLLIDER_SETTINGS.renderOrder;
    markTarget(
      target,
      HONK_INTERACTION_ROLES.looperConnector,
      this.showDebug ? HONK_CONNECTION_COLLIDER_OPACITY : 0,
    );
    target.userData.hitColor = LOOPER_DEBUG_COLORS.honkConnection;
    root.add(target);
    return target;
  }

  createMaterial(color, debugOpacity = 0.24) {
    const material = new this.THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: this.showDebug ? debugOpacity : 0,
      depthWrite: false,
      wireframe: this.showDebug,
    });
    material.userData.disposeWithOwner = true;
    return material;
  }
}

function roleForInteraction(config) {
  if (config.type === INTERACTION_TYPES.ear) {
    return config.side === "left" ? HONK_INTERACTION_ROLES.leftEar : HONK_INTERACTION_ROLES.rightEar;
  }
  if (config.type === INTERACTION_TYPES.nose) return HONK_INTERACTION_ROLES.nose;
  if (config.type === INTERACTION_TYPES.mouth) return HONK_INTERACTION_ROLES.mouth;
  return HONK_INTERACTION_ROLES.squeeze;
}

function getPositiveMorph(config) {
  if (config.type === INTERACTION_TYPES.nose) return MORPH_TARGET_NAMES.nose;
  if (config.type !== INTERACTION_TYPES.ear) return null;
  return config.side === "left" ? MORPH_TARGET_NAMES.ears.leftUp : MORPH_TARGET_NAMES.ears.rightUp;
}

function getNegativeMorph(config) {
  if (config.type !== INTERACTION_TYPES.ear) return null;
  return config.side === "left" ? MORPH_TARGET_NAMES.ears.leftDown : MORPH_TARGET_NAMES.ears.rightDown;
}

function markTarget(target, role, opacity) {
  target.userData.isHitTarget = true;
  target.userData.interactionRole = role;
  target.userData.baseHitOpacity = opacity;
}

function markOwnedGeometry(geometry) {
  geometry.userData.disposeWithOwner = true;
}

function axisScale(scale, axis) {
  if (Number.isFinite(scale)) return scale;
  return Number.isFinite(scale?.[axis]) ? scale[axis] : 1;
}
