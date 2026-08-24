import { ASSET_PATHS } from "./assets.js";

export const SPAWN_DISTANCE = 1.5;
export const DEFAULT_INSTRUMENT_DISTANCE = 1.5;
export const SPAWN_Y_OFFSET = -0.12;
export const SCALE_JOYSTICK_DEADZONE = 0.45;

export const SPAWN_PREVIEW_DISTANCE_SETTINGS = Object.freeze({
  min: 0.5,
  max: 3,
  step: 0.15,
});

export const RADIAL_MENU_HAPTICS = Object.freeze({
  open: Object.freeze({ intensity: 0.35, durationMs: 28 }),
  selection: Object.freeze({ intensity: 0.18, durationMs: 14 }),
  layer: Object.freeze({ intensity: 0.45, durationMs: 30 }),
  confirm: Object.freeze({ intensity: 0.65, durationMs: 38 }),
  dismiss: Object.freeze({ intensity: 0.25, durationMs: 20 }),
  cancel: Object.freeze({ intensity: 0.3, durationMs: 24 }),
  close: Object.freeze({ intensity: 0.25, durationMs: 20 }),
});

export const RADIAL_MENU_SETTINGS = Object.freeze({
  radius: 0.18,
  innerRadius: 0.035,
  distance: 0.32,
  rollDeadzoneRadians: Math.PI / 60,
  dialSpeed: 2.4,
  rollDirection: 1,
  childEntryThresholdM: 0.05,
  childExitThresholdM: 0.035,
  layerSeparationM: 0.055,
});

export const SPAWN_CATALOG_ENTRIES = Object.freeze([
  { id: "metronome", label: "Metronome", action: "instrument", kind: "metronome", modelPath: ASSET_PATHS.models.metronome, color: 0xff8c42 },
  { id: "honk", label: "Honk", action: "instrument", kind: "honk", modelPath: ASSET_PATHS.models.honk, color: 0xf7d04a },
  { id: "honk-cmajor", label: "C Major Scale", action: "formation", recipeId: "honk-cmajor", color: 0x72d572 },
  { id: "honk-fminor", label: "F Natural Minor", action: "formation", recipeId: "honk-fminor", color: 0xb78cff },
  { id: "honk-fsharpminor", label: "F# Natural Minor", action: "formation", recipeId: "honk-fsharpminor", color: 0x8f7cff },
  { id: "chord-aminor", label: "A Minor", action: "formation", recipeId: "chord-aminor", color: 0xff7fb0 },
  { id: "chord-emajor", label: "E Major", action: "formation", recipeId: "chord-emajor", color: 0x5ac8fa },
  { id: "chord-cmajor", label: "C Major", action: "formation", recipeId: "chord-cmajor", color: 0x65d66e },
  { id: "chord-dminor", label: "D Minor", action: "formation", recipeId: "chord-dminor", color: 0xf0a23c },
  { id: "preset-quiet", label: "Quiet", action: "formation", recipeId: "preset-quiet", color: 0xffd166 },
  { id: "preset-melody", label: "Melody", action: "formation", recipeId: "preset-melody", color: 0xffd166 },
  { id: "preset-bass", label: "Bass", action: "formation", recipeId: "preset-bass", color: 0xffd166 },
  { id: "preset-decoration", label: "Decoration", action: "formation", recipeId: "preset-decoration", color: 0xffd166 },
  { id: "preset-still-believe", label: "Still Believe", action: "formation", recipeId: "preset-still-believe", color: 0xffd166 },
  { id: "preset-metronome-96", label: "Metronome 96", action: "instrument", kind: "metronome", componentId: "metronome", bpm: 96, color: 0xffd166 },
  { id: "looper", label: "Looper", action: "instrument", kind: "looper", modelPath: ASSET_PATHS.models.looper, color: 0x45f6ff },
  { id: "stick", label: "Stick", action: "equip", kind: "stick", visibleInRadial: false, color: 0xf7d04a },
]);

export const SPAWN_RADIAL_CATEGORIES = Object.freeze([
  Object.freeze({
    id: "category-instruments",
    label: "Instruments",
    color: 0xf7d04a,
    childIds: Object.freeze(["honk", "looper", "metronome"]),
  }),
  Object.freeze({
    id: "category-scales",
    label: "Scales",
    color: 0x72d572,
    childIds: Object.freeze(["honk-cmajor", "honk-fminor", "honk-fsharpminor"]),
  }),
  Object.freeze({
    id: "category-chords",
    label: "Chords",
    color: 0x5ac8fa,
    childIds: Object.freeze(["chord-aminor", "chord-emajor", "chord-cmajor", "chord-dminor"]),
  }),
  Object.freeze({
    id: "category-presets",
    label: "Presets",
    color: 0xffd166,
    childIds: Object.freeze([
      "preset-quiet",
      "preset-melody",
      "preset-bass",
      "preset-decoration",
      "preset-still-believe",
      "preset-metronome-96",
    ]),
  }),
]);
