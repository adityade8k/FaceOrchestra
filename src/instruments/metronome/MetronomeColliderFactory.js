import { DEBUG_SHOW_COLLIDERS } from "../../config/debug.js";
import { METRONOME_SETTINGS } from "../../config/metronome.js";
import { INTERACTION_TARGET_NAMES } from "../../config/honk.js";
import { METRONOME_INTERACTION_ROLES } from "./MetronomeInstrument.js";

export const METRONOME_TARGET_NAMES = Object.freeze({
  body: INTERACTION_TARGET_NAMES.body,
  bpm: "HIT_metronomeBpm",
  volume: "HIT_metronomeVolume",
});

export class MetronomeColliderFactory {
  constructor({ THREE, showDebug = DEBUG_SHOW_COLLIDERS } = {}) {
    this.THREE = THREE;
    this.showDebug = showDebug;
  }

  create(root) {
    const targets = {};
    targets[METRONOME_INTERACTION_ROLES.body] = this.createSphere(root, {
      name: METRONOME_TARGET_NAMES.body, role: METRONOME_INTERACTION_ROLES.body,
      radius: METRONOME_SETTINGS.bodyRadius, color: 0xffffff, x: 0, isBody: true,
    });
    targets[METRONOME_INTERACTION_ROLES.bpm] = this.createSphere(root, {
      name: METRONOME_TARGET_NAMES.bpm, role: METRONOME_INTERACTION_ROLES.bpm,
      radius: METRONOME_SETTINGS.controlRadius, color: 0xff8c42,
      x: METRONOME_SETTINGS.controlHorizontalOffset, control: "bpm",
    });
    targets[METRONOME_INTERACTION_ROLES.volume] = this.createSphere(root, {
      name: METRONOME_TARGET_NAMES.volume, role: METRONOME_INTERACTION_ROLES.volume,
      radius: METRONOME_SETTINGS.controlRadius, color: 0x5ac8fa,
      x: -METRONOME_SETTINGS.controlHorizontalOffset, control: "volume",
    });
    return { targets };
  }

  createSphere(root, { name, role, radius, color, x, isBody = false, control = null }) {
    const geometry = new this.THREE.SphereGeometry(radius, METRONOME_SETTINGS.sphereSegments, METRONOME_SETTINGS.sphereRings);
    geometry.userData.disposeWithOwner = true;
    const material = new this.THREE.MeshBasicMaterial({
      color, transparent: true, opacity: this.showDebug ? METRONOME_SETTINGS.debugOpacity : 0,
      depthWrite: false, wireframe: this.showDebug,
    });
    material.userData.disposeWithOwner = true;
    const target = new this.THREE.Mesh(geometry, material);
    target.name = name;
    target.position.x = x;
    target.renderOrder = METRONOME_SETTINGS.renderOrder;
    Object.assign(target.userData, {
      isHitTarget: true,
      isBodyGripTarget: isBody,
      isMetronomeTarget: true,
      metronomeControl: control,
      interactionRole: role,
      baseHitOpacity: this.showDebug ? METRONOME_SETTINGS.debugOpacity : 0,
      neutralY: 0,
      minY: -METRONOME_SETTINGS.controlTravel * 0.5,
      maxY: METRONOME_SETTINGS.controlTravel * 0.5,
    });
    root.add(target);
    return target;
  }
}
