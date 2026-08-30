import { getArcPointForValue } from "../../core/arcMotionMath.js";

export function getLooperControlColliderPosition(userData = {}, value = 0) {
  const clamped = clamp(value, -1, 1);
  if (userData.movementMode !== "arc") {
    return {
      x: finite(userData.neutralX, 0),
      y: mapLinear(clamped, -1, 1, finite(userData.minY, 0), finite(userData.maxY, 0)),
      z: finite(userData.neutralZ, 0),
    };
  }

  return getArcPointForValue(userData.arcMotion || userData.arc, clamped);
}

export function getLooperControlMorphWeights(value = 0) {
  const clamped = clamp(value, -1, 1);
  return {
    up: Math.max(clamped, 0),
    down: Math.max(-clamped, 0),
  };
}

function mapLinear(value, inMin, inMax, outMin, outMax) {
  if (inMax === inMin) return outMin;
  return outMin + ((value - inMin) / (inMax - inMin)) * (outMax - outMin);
}

function clamp(value, min, max) {
  return Math.min(Math.max(finite(value, min), min), max);
}

function finite(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}
