import { DEBUG_SHOW_COLLIDERS } from "../../config/debug.js";
import { METRONOME_SETTINGS } from "../../config/metronome.js";
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
    return { targets, handleRig, buttonRig };
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
