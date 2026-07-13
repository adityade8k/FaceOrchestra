import { LOOPER_MODEL_PATH, MODEL_PATH } from "./assets.js";

export const SCALE_JOYSTICK_DEADZONE = 0.45;
export const SPAWN_DISTANCE = 1.5;
export const DEFAULT_INSTRUMENT_DISTANCE = 1.5;
export const SPAWN_Y_OFFSET = -0.12;
export const SHOW_INSTRUCTION_PANEL = false;

export const NOTE_LABEL_SETTINGS = {
  enabled: true,
  fontUrl: "https://unpkg.com/three@0.164.1/examples/fonts/helvetiker_regular.typeface.json",
  color: 0xf7efe2,
  size: 0.05,
  depth: 0.008,
  curveSegments: 4,
  showOctave: true,
  position: { x: 0, y: 0.23, z: 0 },
  rotationDegrees: { x: -18, y: 0, z: 0 },
  scale: { x: 1, y: 1, z: 1 },
};

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
    id: "honk-fminor",
    label: "Honk Fm",
    modelPath: MODEL_PATH,
    color: 0xb78cff,
    variantOf: "honk",
    preset: "fNaturalMinorScale",
  },
  {
    id: "honk-fsharpminor",
    label: "Honk F#m",
    modelPath: MODEL_PATH,
    color: 0x8f7cff,
    variantOf: "honk",
    preset: "fSharpNaturalMinorScale",
  },
  {
    id: "chord-cmajor",
    label: "C Maj",
    modelPath: MODEL_PATH,
    color: 0x65d66e,
    variantOf: "honk",
    preset: "cMajorChord",
  },
  {
    id: "chord-gmajor",
    label: "G Maj",
    modelPath: MODEL_PATH,
    color: 0x5ac8fa,
    variantOf: "honk",
    preset: "gMajorChord",
  },
  {
    id: "chord-fmajor",
    label: "F Maj",
    modelPath: MODEL_PATH,
    color: 0xf0a23c,
    variantOf: "honk",
    preset: "fMajorChord",
  },
  {
    id: "chord-aminor",
    label: "A Min",
    modelPath: MODEL_PATH,
    color: 0xff7fb0,
    variantOf: "honk",
    preset: "aMinorChord",
  },
  {
    id: "looper",
    label: "Looper",
    modelPath: LOOPER_MODEL_PATH,
    color: 0x45f6ff,
  },
];
