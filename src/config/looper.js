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
  gap: {
    down: LOOPER_MORPH_TARGET_NAMES.bottomHandleDown,
    up: LOOPER_MORPH_TARGET_NAMES.bottomHandleUp,
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
  gap: {
    x: 0.29,
    y: -0.27,
    z: 0,
    rotationDegrees: { x: 0, y: 0, z: 0 },
    scale: { x: 0.9, y: 0.9, z: 0.9 },
    movementRange: 0.065,
    dragSensitivity: 0.8,
    morphTargets: LOOPER_CONTROL_MORPH_TARGETS.gap,
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
