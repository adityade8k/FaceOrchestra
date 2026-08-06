export const LOOPER_VOLUME_RANGE = Object.freeze({ min: 0.08, max: 0.95 });
export const LOOPER_GAP_BEAT_RANGE = Object.freeze({ min: 0, max: 4 });

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

export function getLooperGapBeatsFromControl(value) {
  const normalized = clamp(value, -1, 1);
  return Math.round(((normalized + 1) / 2) * LOOPER_GAP_BEAT_RANGE.max);
}

export function getLooperGapControlFromBeats(beats) {
  const steppedBeats = Math.round(clamp(beats, LOOPER_GAP_BEAT_RANGE.min, LOOPER_GAP_BEAT_RANGE.max));
  return (steppedBeats / LOOPER_GAP_BEAT_RANGE.max) * 2 - 1;
}


export class LooperControlMapping {
  static getVolumeFromControl(value) {
    return getLooperVolumeFromControl(value);
  }

  static getGapBeatsFromControl(value) {
    return getLooperGapBeatsFromControl(value);
  }

  static getGapControlFromBeats(beats) {
    return getLooperGapControlFromBeats(beats);
  }

}
