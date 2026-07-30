import { METRONOME_PENDULUM_SETTINGS } from "../../config/metronome.js";

export class MetronomePendulumRig {
  constructor({ THREE, root, settings = METRONOME_PENDULUM_SETTINGS } = {}) {
    this.THREE = THREE;
    this.root = root;
    this.settings = settings;
    this.node = root?.getObjectByName?.(settings.nodeName) || null;
    this.axis = null;
    this.restPosition = null;
    this.restQuaternion = null;
    this.restScale = null;
    this.deltaQuaternion = null;
    this.swingRadians = degreesToRadians(Math.abs(finite(settings.swingDegrees, 0)));

    if (!this.node) {
      console.warn(`Metronome pendulum node "${settings.nodeName}" was not found; animation disabled.`);
      return;
    }

    this.axis = new THREE.Vector3(
      settings.modelLocalAxis.x,
      settings.modelLocalAxis.y,
      settings.modelLocalAxis.z,
    );
    if (this.axis.lengthSq() < 1e-12) {
      console.warn(`Metronome pendulum "${settings.nodeName}" has a zero-length model-local axis; animation disabled.`);
      this.node = null;
      this.axis = null;
      return;
    }

    this.axis.normalize();
    this.restPosition = this.node.position.clone();
    this.restQuaternion = this.node.quaternion.clone();
    this.restScale = this.node.scale.clone();
    this.deltaQuaternion = new THREE.Quaternion();
    this.reset();
  }

  update({ nowMs = performance.now(), bpm, beatOriginMs, playing } = {}) {
    if (!this.node) return 0;
    if (!playing) return this.reset();
    const angle = getMetronomePendulumAngle({
      nowMs,
      beatOriginMs,
      bpm,
      swingRadians: this.swingRadians,
    });
    this.applyAngle(angle);
    return angle;
  }

  applyAngle(angle) {
    if (!this.node) return 0;
    this.deltaQuaternion.setFromAxisAngle(this.axis, angle);
    this.node.position.copy(this.restPosition);
    // Premultiplication applies the swing in the parent/model frame. A normal
    // multiply would rotate around pendulum_geo's imported mesh-local axis.
    this.node.quaternion.copy(this.restQuaternion).premultiply(this.deltaQuaternion);
    this.node.scale.copy(this.restScale);
    this.node.updateMatrixWorld?.(true);
    return angle;
  }

  reset() {
    if (!this.node) return 0;
    this.node.position.copy(this.restPosition);
    this.node.quaternion.copy(this.restQuaternion);
    this.node.scale.copy(this.restScale);
    this.node.updateMatrixWorld?.(true);
    return 0;
  }

  dispose() {
    this.reset();
    this.node = null;
    this.axis = null;
    this.restPosition = null;
    this.restQuaternion = null;
    this.restScale = null;
    this.deltaQuaternion = null;
  }
}

export function getMetronomePendulumAngle({
  nowMs,
  beatOriginMs,
  bpm,
  swingRadians,
} = {}) {
  if (
    !Number.isFinite(nowMs) ||
    !Number.isFinite(beatOriginMs) ||
    !Number.isFinite(bpm) ||
    bpm <= 0 ||
    !Number.isFinite(swingRadians)
  ) {
    return 0;
  }
  const beatIntervalMs = 60000 / bpm;
  const beatsSinceOrigin = (nowMs - beatOriginMs) / beatIntervalMs;
  // Each audible beat is a center crossing, so one beat advances the arm by
  // half an oscillation and a complete left-right cycle takes two beats.
  return swingRadians * Math.sin(Math.PI * beatsSinceOrigin);
}

function degreesToRadians(value) {
  return value * Math.PI / 180;
}

function finite(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}
