import { METRONOME_SETTINGS } from "../../config/metronome.js";

export function applyMetronomeSpawnOrientation(root, { relative = false } = {}) {
  if (!root) return root;
  const yawRadians = METRONOME_SETTINGS.spawnYawDegrees * Math.PI / 180;
  if (relative && typeof root.rotateY === "function") {
    root.rotateY(yawRadians);
  } else if (root.rotation) {
    root.rotation.y = yawRadians;
  }
  return root;
}
