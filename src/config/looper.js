export const LOOPER_COMPONENT_ID = "looper";
export const HONK_CONNECTION_TARGET_NAME = "HIT_honkConnection";

export const LOOPER_TRACK_COUNT = 8;
export const LOOPER_COLLIDER_OPACITY = 0.34;
export const HONK_CONNECTION_COLLIDER_OPACITY = 0.32;
export const LOOPER_WIRE_SETTINGS = {
  radius: 0.008,
  radialSegments: 7,
  minimumLength: 0.004,
  positionEpsilon: 0.00035,
  directionEpsilon: 0.002,
  minSplineSpans: 2,
  maxSplineSpans: 5,
  distancePerSplineSpan: 0.5,
  anglePerSplineSpanDegrees: 70,
  endpointLeadRatio: 0.22,
  maxEndpointLead: 0.24,
  sagRatio: 0.11,
  angleSagRatio: 0.025,
  minSag: 0.012,
  maxSag: 0.24,
  minTubularSegments: 20,
  maxTubularSegments: 64,
  tubularSegmentsPerMeter: 28,
  tubularSegmentsPerSpan: 5,
};
export const LOOPER_MIN_ACTION_DURATION_MS = 24;
export const LOOPER_GESTURE_SAMPLE_INTERVAL_MS = 33;
export const LOOPER_MAX_RECORDING_DURATION_MS = 120000;
export const LOOPER_BEAT_DETECTION_SETTINGS = Object.freeze({
  minBpm: 60,
  maxBpm: 200,
  chordClusterMs: 90,
  subdivisionsPerBeat: 4,
  maxSnapMs: 85,
});
export const LOOPER_SHAKE_DISCONNECT_SETTINGS = {
  enabled: true,
  durationMs: 360,
  intensity: 0.85,
  range: 0.16,
  cooldownMs: 700,
};
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
  controlGap: 0x5ac8fa,
};

export const LOOPER_MORPH_TARGET_NAMES = {
  buttonRecord: "button_record",
  buttonStop: "button_stop_recording",
  buttonPlay: "button_play",
  buttonPause: "button_pause",
  rightHandleDown: "Right_handle_down",
  rightHandleUp: "right_handle_up",
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
    down: LOOPER_MORPH_TARGET_NAMES.rightHandleDown,
    up: LOOPER_MORPH_TARGET_NAMES.rightHandleUp,
  },
};

export const LOOPER_CONTROL_DEFAULT_VALUES = Object.freeze({
  volume: 0,
  gap: -1,
});

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
    x: -0.135,
    y: -0.28,
    z: 0.36,
    rotationDegrees: { x: 0, y: -10, z: 0 },
    scale: { x: 0.9, y: 1.2, z: 0.85 },
    morphTarget: LOOPER_BUTTON_MORPH_TARGETS.play,
  },
  pause: {
    x: -0.25,
    y: -0.28,
    z: 0.26,
    rotationDegrees: { x: 0, y: -33, z: 0 },
    scale: { x: 0.9, y: 1.2, z: 0.85 },
    morphTarget: LOOPER_BUTTON_MORPH_TARGETS.pause,
  },
  record: {
    x: 0.10,
    y: -0.275,
    z: 0.28,
    rotationDegrees: { x: 0, y: 40, z: 0 },
    scale: { x: 0.9, y: 1.2, z: 0.85 },
    morphTarget: LOOPER_BUTTON_MORPH_TARGETS.record,
  },
  stop: {
    x: -0.005,
    y: -0.28,
    z: 0.36,
    rotationDegrees: { x: 0, y: 10, z: 0 },
    scale: { x: 0.9, y: 1.2, z: 0.85 },
    morphTarget: LOOPER_BUTTON_MORPH_TARGETS.stop,
  },
};

export const LOOPER_NODE_COLLIDER_LAYOUT = {
  center: { x: -0.068, y: -0.04, z: -0.05 },
  wireDirection: { x: 0, y: 0, z: 1 },
  columns: 2,
  minColumns: 1,
  centerColumn: 0.5,
  columnSpacing: 0.435,
  rowSpacing: 0.042,
  sphereScale: 0.014,
  sphereSegments: 24,
  sphereRings: 16,
  forwardOffsetScale: 0.018,
};

export const LOOPER_COLLIDER_GEOMETRY = {
  minModelSize: 0.1,
  renderOrder: 24,
  buttonScale: { x: 0.09, y: 0.045, z: 0.026 },
  controlSphereScale: 0.044,
  controlSphereSegments: 24,
  controlSphereRings: 16,
  buttonDefaultTransform: { x: 0, y: 0.34, z: 0.56 },
  controlDefaultTransform: { x: 0, y: -0.08, z: 0.56 },
  buttonDebugAxisScale: 0.07,
  controlDebugAxisScale: 0.065,
};

export const LOOPER_COLLIDER_TRANSFORM_DEFAULTS = {
  position: { x: 0, y: 0, z: 0.56 },
  rotationDegrees: { x: 0, y: 0, z: 0 },
  scale: { x: 1, y: 1, z: 1 },
};

export const LOOPER_CONTROL_MOTION_DEFAULTS = {
  movementMode: "vertical",
  movementRange: 0.24,
  dragSensitivity: 1,
  minDragSensitivity: 0,
  minDragRange: 0.0001,
  defaultArcRadius: 0.18,
  minArcRadius: 0.0001,
  defaultArcMinDegrees: -48,
  defaultArcMaxDegrees: 48,
  defaultArcSide: 1,
  arcSideNegativeThreshold: 0,
  defaultArcRotationZ: 0,
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
    x: 0.18,
    y: 0.16,
    z: 0,
    rotationDegrees: { x: 0, y: 0, z: 45 },
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
    morphTargets: LOOPER_CONTROL_MORPH_TARGETS.gap,
  },
};
