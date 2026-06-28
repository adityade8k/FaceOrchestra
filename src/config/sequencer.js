export const LOOPER_COMPONENT_ID = "looper";
export const LEGACY_LOOPER_COMPONENT_ID = "__legacy_looper";
export const RECORDER_COMPONENT_ID = LOOPER_COMPONENT_ID;
export const HONK_CONNECTION_TARGET_NAME = "HIT_honkConnection";

export const LOOPER_PAD_COUNT = 8;
export const RECORDER_CHANNEL_COUNT = 8;
export const LOOPER_COLLIDER_OPACITY = 0.34;
export const HONK_CONNECTION_COLLIDER_OPACITY = 0.32;
export const LOOPER_WIRE_RADIUS = 0.008;
export const LOOPER_WIRE_SEGMENTS = 36;
export const LOOPER_MIN_CLIP_DURATION_MS = 80;
export const RECORDER_MIN_EVENT_DURATION_MS = 24;
export const LOOPER_BUTTON_ACTIONS = ["play", "pause", "record", "stop"];
export const LOOPER_WIRE_COLORS = [0x2f80ff, 0xff4f5e];

export const LOOPER_DEBUG_COLORS = {
  honkConnection: 0xff6bd6,
  button: {
    play: 0x5ee67c,
    pause: 0xf7d04a,
    record: 0xff4f5e,
    stop: 0xff8a3d,
  },
  buttonActive: 0xffffff,
  padEmpty: 0x33495f,
  padRecorded: 0x65d66e,
  padSilent: 0x8f7cff,
  padRecording: 0xff4f5e,
  padPlaying: 0xf7d04a,
  nodeOpen: 0x45f6ff,
  recorderNodeOpen: 0xffb15c,
  recorderRecording: 0xff4f5e,
  recorderRecorded: 0x65d66e,
  recorderPlaying: 0xf7d04a,
  controlVolume: 0x9e8cff,
  controlSpeed: 0xf0a23c,
  controlGap: 0x5ac8fa,
};
