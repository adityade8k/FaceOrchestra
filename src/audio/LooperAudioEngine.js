import * as THREE from "three";

export const RECORDER_LOOP_GAP_RANGE_MS = { min: 0, max: 4000 };
export const LOOPER_VOLUME_RANGE = { min: 0.12, max: 1.25 };
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

  static getRecorderLoopGapFromControl(value) {
    return THREE.MathUtils.mapLinear(
      THREE.MathUtils.clamp(value, -1, 1),
      -1,
      1,
      RECORDER_LOOP_GAP_RANGE_MS.min,
      RECORDER_LOOP_GAP_RANGE_MS.max,
    );
  }

  static cloneClip(clip) {
    if (!clip) {
      return null;
    }

    return {
      silent: Boolean(clip.silent),
      durationMs: clip.durationMs,
      note: clip.note ? { ...clip.note } : null,
    };
  }

  static cloneRecorderEvent(event) {
    return {
      id: event.id,
      channelIndex: event.channelIndex,
      startMs: event.startMs,
      durationMs: event.durationMs,
      samples: event.samples.map((sample) => ({ ...sample })),
    };
  }
}
