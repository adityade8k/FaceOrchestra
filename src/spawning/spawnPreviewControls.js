import { SPAWN_PREVIEW_DISTANCE_SETTINGS } from "../config/spawning.js";

export function stepSpawnPreviewDistance(
  currentDistance,
  direction,
  settings = SPAWN_PREVIEW_DISTANCE_SETTINGS,
) {
  const nextDistance = currentDistance + Math.sign(direction) * settings.step;
  return Math.min(Math.max(nextDistance, settings.min), settings.max);
}
