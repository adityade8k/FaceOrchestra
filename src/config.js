export const MODEL_PATH = "./model/honk/horn_gltf.glb";
export const LOOPER_MODEL_PATH = "./model/looper/looper.glb";

export const DEBUG_SHOW_COLLIDERS = false;
export const DEBUG_SHOW_BOUNDING_BOXES = false;
export const DEBUG_SHOW_RAYS = true;
export const DEBUG_LOG_RAYCAST = false;
export const DEBUG_LOG_MORPHS = false;

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

export const BEND_SENSITIVITY = 2.5;
export const BEND_SMOOTHING = 0.18;
export const BEND_COLLIDER_ROTATION_DEGREES = -18;
export const MAX_PITCH_BEND_SEMITONES = 4;
export const SQUEEZE_SENSITIVITY = 0.18;
export const EAR_DRAG_SENSITIVITY = 1.8;
export const NOSE_DRAG_SENSITIVITY = 1.8;

export const NASALITY_SETTINGS = {
  oralReductionAtMax: 0.55,
  lowGainAtMax: 1.25,
  highGainAtMax: 0.65,
  highFrequencyLiftAtMax: 260,
};
export const CHORD_BOX_SCALE = {
  x: 0.55,
  y: 0.75,
  z: 0.55,
};

export const INSTRUMENT_BASE_SCALE = 2.5;
export const SPAWN_DISTANCE = 0.75;
export const DEFAULT_INSTRUMENT_DISTANCE = 1.05;
export const SPAWN_Y_OFFSET = -0.12;
export const SHOW_INSTRUCTION_PANEL = false;

export const SPAWN_COMPONENT_OPTIONS = [
  {
    id: "honk",
    label: "Honk",
    modelPath: MODEL_PATH,
    color: 0xf7d04a,
  },
  {
    id: "honk-cmajor",
    label: "Honk C",
    modelPath: MODEL_PATH,
    color: 0x72d572,
    variantOf: "honk",
    preset: "cMajorScale",
  },
  {
    id: "looper",
    label: "Looper",
    modelPath: LOOPER_MODEL_PATH,
    color: 0x45f6ff,
  },
];

export const XR_BUTTONS = {
  trigger: 0,
  grip: 1,
  primary: 4,
};

export const XR_OPTIONAL_FEATURES = ["local-floor", "bounded-floor", "dom-overlay"];

export const INSTRUMENT_TEXTURE_PATHS = {
  baseMap: "./model/honk/clown_horn_diffuse_map.png",
  normalMap: "./model/honk/Clay001_2K-JPG_NormalGL.jpg",
  roughnessMap: "./model/honk/Clay001_2K-JPG_Roughness_curves.png",
};

export const INTERACTION_COLLIDERS = [
  {
    name: INTERACTION_TARGET_NAMES.leftEar,
    type: "ear",
    side: "left",
    invertVerticalMorph: false,
    size: 0.045,
    x: -0.2,
    y: 0.22,
    z: 0,
    movementRange: 0.04,
    color: 0x72d572,
  },
  {
    name: INTERACTION_TARGET_NAMES.nose,
    type: "nose",
    size: 0.045,
    x: 0,
    y: 0.21,
    z: 0.20,
    movementRange: 0.03,
    color: 0x5ac8fa,
  },
  {
    name: INTERACTION_TARGET_NAMES.rightEar,
    type: "ear",
    side: "right",
    invertVerticalMorph: false,
    size: 0.045,
    x: 0.2,
    y: 0.215,
    z: 0,
    movementRange: 0.04,
    color: 0x9e8cff,
  },
  {
    name: INTERACTION_TARGET_NAMES.mouth,
    type: "mouth",
    size: 0.03,
    x: 0,
    y: 0.12,
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
};
