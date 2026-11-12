import { ASSET_PATHS } from "./assets.js";

export const SHOW_INSTRUCTION_PANEL = false;

// Shared dimensions are in world meters, independent of instrument size.
export const MODEL_LABEL_SETTINGS = Object.freeze({
  color: 0xf7efe2,
  size: 0.06,
  depth: 0.003,
  curveSegments: 4,
  gap: 0.03,
  rotationDegrees: Object.freeze({ x: -18, y: 0, z: 0 }),
});

export const NOTE_LABEL_SETTINGS = {
  ...MODEL_LABEL_SETTINGS,
  enabled: true,
  fontUrl: ASSET_PATHS.fonts.noteLabel,
  showOctave: true,
  position: { x: 0, y: 0.23, z: 0 },
  rotationDegrees: { x: -18, y: 0, z: 0 },
  scale: { x: 1, y: 1, z: 1 },
};
