import * as THREE from "three";

export const LOOPER_VOLUME_RANGE = { min: 0.08, max: 0.95 };
export const LOOPER_SPEED_RANGE = { min: 0.45, max: 2.0 };

export class LooperAudioEngine {
  static getVolumeFromControl(value) {
    return THREE.MathUtils.mapLinear(
      THREE.MathUtils.clamp(value, -1, 1),
      -1,
      1,
      LOOPER_VOLUME_RANGE.min,
      LOOPER_VOLUME_RANGE.max,
    );
  }

  static getSpeedFromControl(value) {
    return THREE.MathUtils.mapLinear(
      THREE.MathUtils.clamp(value, -1, 1),
      -1,
      1,
      LOOPER_SPEED_RANGE.min,
      LOOPER_SPEED_RANGE.max,
    );
  }
}
