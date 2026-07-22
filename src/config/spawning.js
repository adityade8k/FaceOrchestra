import { ASSET_PATHS } from "./assets.js";

export const SPAWN_DISTANCE = 1.5;
export const DEFAULT_INSTRUMENT_DISTANCE = 1.5;
export const SPAWN_Y_OFFSET = -0.12;
export const SCALE_JOYSTICK_DEADZONE = 0.45;

export const SPAWN_CATALOG_ENTRIES = Object.freeze([
  { id: "metronome", label: "Metro", action: "instrument", kind: "metronome", color: 0xff8c42 },
  { id: "honk", label: "Honk", action: "instrument", kind: "honk", modelPath: ASSET_PATHS.models.honk, color: 0xf7d04a },
  { id: "honk-cmajor", label: "Honk C", action: "formation", recipeId: "honk-cmajor", color: 0x72d572 },
  { id: "honk-fminor", label: "Honk Fm", action: "formation", recipeId: "honk-fminor", color: 0xb78cff },
  { id: "honk-fsharpminor", label: "Honk F#m", action: "formation", recipeId: "honk-fsharpminor", color: 0x8f7cff },
  { id: "chord-cmajor", label: "C Maj", action: "formation", recipeId: "chord-cmajor", color: 0x65d66e },
  { id: "chord-gmajor", label: "G Maj", action: "formation", recipeId: "chord-gmajor", color: 0x5ac8fa },
  { id: "chord-fmajor", label: "F Maj", action: "formation", recipeId: "chord-fmajor", color: 0xf0a23c },
  { id: "chord-aminor", label: "A Min", action: "formation", recipeId: "chord-aminor", color: 0xff7fb0 },
  { id: "looper", label: "Looper", action: "instrument", kind: "looper", modelPath: ASSET_PATHS.models.looper, color: 0x45f6ff },
  { id: "stick", label: "Stick", action: "equip", kind: "stick", visibleInRadial: false, color: 0xf7d04a },
]);
