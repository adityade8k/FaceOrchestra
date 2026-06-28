export const LOOPER_COMPONENT_ID = "looper";
export const HONK_CONNECTION_TARGET_NAME = "HIT_honkConnection";

export const LOOPER_TRACK_COUNT = 8;
export const LOOPER_COLLIDER_OPACITY = 0.34;
export const HONK_CONNECTION_COLLIDER_OPACITY = 0.32;
export const LOOPER_WIRE_RADIUS = 0.008;
export const LOOPER_WIRE_SEGMENTS = 36;
export const LOOPER_MIN_NOTE_DURATION_MS = 24;
export const LOOPER_GESTURE_SAMPLE_INTERVAL_MS = 33;
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
  nodeOpen: 0x45f6ff,
  recording: 0xff4f5e,
  recorded: 0x65d66e,
  playing: 0xf7d04a,
  controlVolume: 0x9e8cff,
  controlSpeed: 0xf0a23c,
};

export const LOOPER_MORPH_TARGET_NAMES = {
  buttonRecord: "button_record",
  buttonStop: "button_stop_recording",
  buttonPlay: "button_play",
  buttonPause: "button_pause",
  bottomHandleDown: "bottom_handle_down",
  bottomHandleUp: "bottom_handle_up",
  rightHandleDown: "Right_handle_down",
  rightHandleUp: "Right_handle_up",
  leftHandleUp: "Left_handle_up",
  leftHandleDown: "Left_handle_down",
  playingHead: "playing_looper_head",
};

export const LOOPER_BUTTON_MORPH_TARGETS = {
  record: LOOPER_MORPH_TARGET_NAMES.buttonRecord,
  stop: LOOPER_MORPH_TARGET_NAMES.buttonStop,
  play: LOOPER_MORPH_TARGET_NAMES.buttonPlay,
  pause: LOOPER_MORPH_TARGET_NAMES.buttonPause,
};

export const LOOPER_CONTROL_MORPH_TARGETS = {
  volume: {
    down: LOOPER_MORPH_TARGET_NAMES.leftHandleDown,
    up: LOOPER_MORPH_TARGET_NAMES.leftHandleUp,
  },
  speed: {
    down: LOOPER_MORPH_TARGET_NAMES.rightHandleDown,
    up: LOOPER_MORPH_TARGET_NAMES.rightHandleUp,
  },
};

export const LOOPER_MORPH_SETTINGS = {
  buttonPressDurationMs: 140,
  playingHead: {
    min: 0,
    max: 1,
    minIncrement: 0.06,
    maxIncrement: 0.18,
    changeIntervalMs: 120,
  },
};

export const LOOPER_BUTTON_COLLIDERS = {
  play: {
    x: -0.27,
    y: 0.34,
    z: 0.56,
    rotationDegrees: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    morphTarget: LOOPER_BUTTON_MORPH_TARGETS.play,
  },
  pause: {
    x: -0.09,
    y: 0.34,
    z: 0.56,
    rotationDegrees: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    morphTarget: LOOPER_BUTTON_MORPH_TARGETS.pause,
  },
  record: {
    x: 0.09,
    y: 0.34,
    z: 0.56,
    rotationDegrees: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    morphTarget: LOOPER_BUTTON_MORPH_TARGETS.record,
  },
  stop: {
    x: 0.27,
    y: 0.34,
    z: 0.56,
    rotationDegrees: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    morphTarget: LOOPER_BUTTON_MORPH_TARGETS.stop,
  },
};

export const LOOPER_CONTROL_COLLIDERS = {
  volume: {
    x: -0.32,
    y: 0.16,
    z: 0,
    rotationDegrees: { x: 0, y: 0, z: -45 },
    scale: { x: 0.8, y: 0.8, z: 0.8 },
    movementMode: "arc",
    movementRange: 0.24,
    dragSensitivity: 3,
    arc: {
      side: 1,
      radius: 0.18,
      minDegrees: -30,
      maxDegrees: 30,
    },
    morphTargets: LOOPER_CONTROL_MORPH_TARGETS.volume,
  },
  speed: {
    x: 0.18,
    y: 0.16,
    z: 0,
    rotationDegrees: { x: 0, y: 0, z:45 },
    scale: { x: 0.8, y: 0.8, z: 0.8 },
    movementMode: "arc",
    movementRange: 0.24,
    dragSensitivity: 3,
    arc: {
      side: -1,
      radius: 0.28,
      minDegrees: -20,
      maxDegrees: 20,
    },
    morphTargets: LOOPER_CONTROL_MORPH_TARGETS.speed,
  },
};
