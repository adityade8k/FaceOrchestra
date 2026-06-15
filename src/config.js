export const MODEL_PATH = "./model/horn_gltf.glb";

export const DEBUG_SHOW_COLLIDERS = false;
export const DEBUG_SHOW_BOUNDING_BOXES = false;
export const DEBUG_SHOW_RAYS = true;
export const DEBUG_LOG_MORPHS = true;

export const MORPH_TARGET_NAMES = {
  bendRight: "bend_R_geo",
  bendLeft: "bend_L_geo",
  vowels: {
    A: "A_morph_geo",
    E: "E_morph_geo",
    I: "I_morph_geo",
    O: "O_morph_geo",
    U: "U_morph_geo",
  },
  squeeze: "regular_squeez_geo",
  nose: "nose_push_morph_geo",
  ears: {
    leftUp: "ear_up_L_morph_geo",
    leftDown: "ear_down_L_morph_geo",
    rightUp: "ear_up_R_morph_geo",
    rightDown: "ear_down_R_morph_geo",
  },
};

export const INTERACTION_TARGET_NAMES = {
  mouth: "HIT_mouth",
  horn: "HIT_horn",
  nose: "HIT_nose",
  leftEar: "HIT_leftEar",
  rightEar: "HIT_rightEar",
  body: "HIT_body",
};

export const BEND_SENSITIVITY = 5.5;
export const BEND_SMOOTHING = 0.18;
export const MAX_PITCH_BEND_SEMITONES = 4;
export const SQUEEZE_SENSITIVITY = 0.18;
export const EAR_DRAG_SENSITIVITY = 1.8;
export const NOSE_DRAG_SENSITIVITY = 1.8;

export const INSTRUMENT_BASE_SCALE = 0.04;
export const SPAWN_DISTANCE = 0.25;
export const DEFAULT_INSTRUMENT_DISTANCE = 0.72;
export const SHOW_INSTRUCTION_PANEL = true;

export const XR_BUTTONS = {
  trigger: 0,
  grip: 1,
  primary: 4,
};

export const XR_OPTIONAL_FEATURES = ["local-floor", "bounded-floor", "dom-overlay"];

export const INSTRUMENT_TEXTURE_PATHS = {
  normalMap: "./textures/normal.jpg",
  roughnessMap: "./textures/roughness.jpg",
};

export const INTERACTION_COLLIDERS = [
  {
    name: INTERACTION_TARGET_NAMES.leftEar,
    type: "ear",
    side: "left",
    invertVerticalMorph: false,
    size: 0.045,
    x: -0.22,
    y: 0.22,
    z: 0,
    movementRange: 0.05,
    color: 0x72d572,
  },
  {
    name: INTERACTION_TARGET_NAMES.nose,
    type: "nose",
    size: 0.035,
    x: 0,
    y: 0.22,
    z: 0.21,
    movementRange: 0.05,
    color: 0x5ac8fa,
  },
  {
    name: INTERACTION_TARGET_NAMES.rightEar,
    type: "ear",
    side: "right",
    invertVerticalMorph: false,
    size: 0.045,
    x: 0.22,
    y: 0.21,
    z: 0,
    movementRange: 0.05,
    color: 0x9e8cff,
  },
  {
    name: INTERACTION_TARGET_NAMES.mouth,
    type: "mouth",
    size: 0.035,
    x: 0,
    y: 0.15,
    z: 0.12,
    movementRange: 0,
    color: 0xf0a23c,
  },
  {
    name: INTERACTION_TARGET_NAMES.horn,
    type: "horn",
    size: 0.15,
    x: 0,
    y: -0.26,
    z: 0,
    movementRange: 0,
    color: 0xf7d04a,
  },
];

export const SPATIAL_AUDIO_SETTINGS = {
  masterGain: 5.0,
  distanceFalloff: {
    model: "inverse",
    refDistance: 0.12,
    maxDistance: 2.2,
    rolloffFactor: 6,
  },
  directionalFalloff: {
    coneInnerAngle: 35,
    coneOuterAngle: 110,
    coneOuterGain: 0.02,
  },
  contactChainMargin: 0,
  contactChainBoxScale: {
    x: 0.62,
    y: 0.62,
    z: 0.62,
  },
};

export const INSTRUMENT_BASE_COLORS = [
  { name: "Deep Slate", hex: 0x395e66 },
  { name: "Mulberry", hex: 0x533b4d },
  { name: "Seafoam", hex: 0x9cc4b2 },
  { name: "Dusty Rose", hex: 0xc98ca7 },
  { name: "Coral Pink", hex: 0xe76d83 },
];
