export const LOOPER_VOLUME_RANGE = Object.freeze({ min: 0.08, max: 0.95 });
export const LOOPER_SPEED_RANGE = Object.freeze({ min: 0.45, max: 2.0 });
export const LOOPER_LOOP_GAP_RANGE_MS = Object.freeze({ min: 0, max: 4000 });

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function mapControl(value, range) {
  const normalized = clamp(value, -1, 1);
  return range.min + ((normalized + 1) / 2) * (range.max - range.min);
}

export function getLooperVolumeFromControl(value) {
  return mapControl(value, LOOPER_VOLUME_RANGE);
}

export function getLooperSpeedFromControl(value) {
  return mapControl(value, LOOPER_SPEED_RANGE);
}

export function getLooperGapFromControl(value) {
  return mapControl(value, LOOPER_LOOP_GAP_RANGE_MS);
}

export class LooperControlMapping {
  static getVolumeFromControl(value) {
    return getLooperVolumeFromControl(value);
  }

  static getSpeedFromControl(value) {
    return getLooperSpeedFromControl(value);
  }

  static getGapFromControl(value) {
    return getLooperGapFromControl(value);
  }
}
