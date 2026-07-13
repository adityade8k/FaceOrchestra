import { STICK_MODEL_PATH } from "./assets.js";

export const STICK_SETTINGS = {
  enabled: true,
  modelPath: STICK_MODEL_PATH,

  // Local transform from the XR controller to the held stick.
  position: { x: 0, y: -0.02, z: -0.28 },
  rotationDegrees: { x: -90, y: 0, z: 0 },
  size: { x: 0.25, y: 0.46, z: 0.25},

  // Local transform from the stick to its collider.
  collider: {
    enabled: true,
    position: { x: 0, y: 0.1, z: 0 },
    rotationDegrees: { x: 0, y: 0, z: 0 },
    scale: { x: 0.08, y: 0.75, z: 0.08 },
    color: 0xf7d04a,
    opacity: 0.28,
    renderOrder: 32,
  },

  collision: {
    maxUserDistance: 2.25,
  },

  haptics: {
    enabled: true,
    intensity: 1,
    durationMs: 35,
    cooldownMs: 45,
  },
};
