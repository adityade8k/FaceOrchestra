import { DEBUG_MODE } from "../../config/debug.js";
import {
  METRONOME_CONNECTION_PORTS,
  METRONOME_CONNECTION_ROLE,
  METRONOME_SETTINGS,
} from "../../config/metronome.js";
import {
  colliderScaleToRadius,
  normalizedPositionToModel,
} from "../core/calibrationMath.js";
import { createBodyGripTarget } from "../core/BodyGripTargetFactory.js";
import { MetronomeButtonRig } from "./MetronomeButtonRig.js";
import { createMetronomeConnectionPortMaterial } from "./metronomeConnectionPortPresentation.js";
import { METRONOME_INTERACTION_ROLES } from "./MetronomeInstrument.js";
import { MetronomeHandleRig } from "./MetronomeHandleRig.js";

export class MetronomeColliderFactory {
  constructor({ THREE, showDebug = DEBUG_MODE } = {}) {
    this.THREE = THREE;
    this.showDebug = showDebug;
  }

  create(root) {
    const targets = {};
    const bodyTargets = {};
    const modelBounds = new this.THREE.Box3().setFromObject(root);
    const bodyTarget = createBodyGripTarget(root, bodyTargets, {
      interactionRole: METRONOME_INTERACTION_ROLES.body,
    });
    if (bodyTarget) {
      root.traverse((object) => {
        if (!object.userData?.isBodyGripTarget) return;
        object.userData.isMetronomeTarget = true;
        object.userData.metronomeControl = null;
      });
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
        colliderScaleToRadius(config.colliderScale, maxSize),
        METRONOME_SETTINGS.sphereSegments,
        METRONOME_SETTINGS.sphereRings,
      );
      geometry.userData ||= {};
      geometry.userData.disposeWithOwner = true;
      const collider = new this.THREE.Mesh(
        geometry,
        createMetronomeConnectionPortMaterial({
          THREE: this.THREE,
          color: config.colliderColor,
          showDebug: this.showDebug,
        }),
      );
      collider.name = config.name;
      const position = normalizedPositionToModel(config.position, center, size);
      collider.position.set(position.x, position.y, position.z);
      collider.renderOrder = METRONOME_SETTINGS.renderOrder;
      Object.assign(collider.userData, {
        isHitTarget: true,
        isBodyGripTarget: false,
        isMetronomeTarget: true,
        isMetronomeConnectionPort: true,
        metronomePortId: config.portId,
        interactionRole: METRONOME_CONNECTION_ROLE,
        wireSocketOutward: { ...config.socketDirection },
        baseHitOpacity: this.showDebug ? METRONOME_SETTINGS.connectionPortOpacity : 0,
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
