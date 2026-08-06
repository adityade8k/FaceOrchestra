import { DEBUG_SHOW_COLLIDERS } from "../../config/debug.js";
import {
  METRONOME_CONNECTION_PORTS,
  METRONOME_CONNECTION_ROLE,
  METRONOME_SETTINGS,
} from "../../config/metronome.js";
import { createBodyGripTarget } from "../core/BodyGripTargetFactory.js";
import { MetronomeButtonRig } from "./MetronomeButtonRig.js";
import { METRONOME_INTERACTION_ROLES } from "./MetronomeInstrument.js";
import { MetronomeHandleRig } from "./MetronomeHandleRig.js";

export class MetronomeColliderFactory {
  constructor({ THREE, showDebug = DEBUG_SHOW_COLLIDERS } = {}) {
    this.THREE = THREE;
    this.showDebug = showDebug;
  }

  create(root) {
    const targets = {};
    const bodyTargets = {};
    const modelBounds = new this.THREE.Box3().setFromObject(root);
    const bodyTarget = createBodyGripTarget(root, bodyTargets, {
      makeHitTargetMaterial: () => this.createMaterial(0xffffff),
      hitMarkerOpacity: this.showDebug ? METRONOME_SETTINGS.debugOpacity : 0,
    });
    if (bodyTarget) {
      bodyTarget.userData.isMetronomeTarget = true;
      bodyTarget.userData.metronomeControl = null;
      bodyTarget.userData.interactionRole = METRONOME_INTERACTION_ROLES.body;
      targets[METRONOME_INTERACTION_ROLES.body] = bodyTarget;
    }
    const buttonRig = new MetronomeButtonRig({ root });
    for (const [action, button] of buttonRig.buttons) {
      if (!button.node.geometry?.clone) {
        console.warn(`Metronome eye node "${button.config.nodeName}" has no geometry; ${action} disabled.`);
        continue;
      }
      const geometry = button.node.geometry.clone();
      geometry.userData ||= {};
      geometry.userData.disposeWithOwner = true;
      const collider = new this.THREE.Mesh(
        geometry,
        this.createMaterial(button.config.colliderColor),
      );
      collider.name = `HIT_metronome_${action}`;
      collider.scale.setScalar(button.config.colliderScale);
      collider.renderOrder = METRONOME_SETTINGS.renderOrder;
      Object.assign(collider.userData, {
        isHitTarget: true,
        isBodyGripTarget: false,
        isMetronomeTarget: true,
        isMetronomeButton: true,
        metronomeButtonAction: action,
        interactionRole: METRONOME_INTERACTION_ROLES[action],
        baseHitOpacity: this.showDebug ? METRONOME_SETTINGS.debug.colliderOpacity : 0,
        hitColor: button.config.colliderColor,
      });
      button.node.add(collider);
      buttonRig.attachTarget(action, collider);
      targets[METRONOME_INTERACTION_ROLES[action]] = collider;
    }
    const handleRig = new MetronomeHandleRig({
      THREE: this.THREE,
      root,
      showDebug: this.showDebug,
    });
    Object.assign(targets, handleRig.targets);
    this.createConnectionPorts(root, targets, modelBounds);
    return { targets, handleRig, buttonRig };
  }

  createConnectionPorts(root, targets, bounds) {
    const center = bounds.getCenter(new this.THREE.Vector3());
    const size = bounds.getSize(new this.THREE.Vector3());
    const maxSize = Math.max(size.x, size.y, size.z, 0.1);
    for (const config of METRONOME_CONNECTION_PORTS) {
      const geometry = new this.THREE.SphereGeometry(
        maxSize * config.colliderScale,
        METRONOME_SETTINGS.sphereSegments,
        METRONOME_SETTINGS.sphereRings,
      );
      geometry.userData ||= {};
      geometry.userData.disposeWithOwner = true;
      const collider = new this.THREE.Mesh(
        geometry,
        this.createMaterial(config.colliderColor),
      );
      collider.name = config.name;
      collider.position.set(
        center.x + size.x * config.position.x,
        center.y + size.y * config.position.y,
        center.z + size.z * config.position.z,
      );
      collider.renderOrder = METRONOME_SETTINGS.renderOrder;
      Object.assign(collider.userData, {
        isHitTarget: true,
        isBodyGripTarget: false,
        isMetronomeTarget: true,
        isMetronomeConnectionPort: true,
        metronomePortId: config.portId,
        interactionRole: METRONOME_CONNECTION_ROLE,
        wireSocketOutward: { ...config.socketDirection },
        baseHitOpacity: this.showDebug ? METRONOME_SETTINGS.debug.colliderOpacity : 0,
        hitColor: config.colliderColor,
      });
      root.add(collider);
      targets[`connectionPort:${config.portId}`] = collider;
    }
  }

  createMaterial(color) {
    const material = new this.THREE.MeshBasicMaterial({
      color, transparent: true, opacity: this.showDebug ? METRONOME_SETTINGS.debugOpacity : 0,
      depthTest: !this.showDebug, depthWrite: false, wireframe: this.showDebug,
    });
    material.userData.disposeWithOwner = true;
    return material;
  }
}
