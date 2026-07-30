import { DEBUG_SHOW_COLLIDERS } from "../../config/debug.js";
import { METRONOME_SETTINGS } from "../../config/metronome.js";
import { createBodyGripTarget } from "../core/BodyGripTargetFactory.js";
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
    const handleRig = new MetronomeHandleRig({
      THREE: this.THREE,
      root,
      showDebug: this.showDebug,
    });
    Object.assign(targets, handleRig.targets);
    return { targets, handleRig };
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
