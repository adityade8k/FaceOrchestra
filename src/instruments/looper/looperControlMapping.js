import { LOOPER_RECORD_BEATS } from "../../config/looper.js";
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
  const steppedBeats = Math.round(
    clamp(beats, LOOPER_GAP_BEAT_RANGE.min, LOOPER_GAP_BEAT_RANGE.max),
  );
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

export function getRecordLengthDetent(value, previousBeats = null) {
  const intervals = LOOPER_RECORD_BEATS.length - 1;
  const position = ((Math.min(Math.max(value, -1), 1) + 1) * intervals) / 2;
  let index = LOOPER_RECORD_BEATS.indexOf(previousBeats);
  if (index < 0) index = Math.round(position);
  // A 0.06 control-unit dead band on either side of each midpoint.
  while (index < intervals && position > index + 0.5 + 0.03 * intervals) index++;
  while (index > 0 && position < index - 0.5 - 0.03 * intervals) index--;
  return { beats: LOOPER_RECORD_BEATS[index], value: (index / intervals) * 2 - 1 };
}
