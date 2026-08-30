export function getLooperControlColliderPosition(userData = {}, value = 0) {
  const path = userData.looperControlPath || userData.controlPath;
  if (!isPath(path)) return null;
  const clamped = clamp(value, -1, 1);
  return clamped >= 0
    ? lerpPoint(path.neutralAnchor, path.upAnchor, clamped)
    : lerpPoint(path.neutralAnchor, path.downAnchor, -clamped);
}

export function getClosestLooperControlValue(path, position) {
  if (!isPath(path) || !isPoint(position)) return null;
  const negative = closestPointOnSegment(position, path.downAnchor, path.neutralAnchor);
  const positive = closestPointOnSegment(position, path.neutralAnchor, path.upAnchor);
  return negative.distanceSquared <= positive.distanceSquared
    ? negative.t - 1
    : positive.t;
}

export function getLooperControlValueFromDrag(
  path,
  startingControllerPosition,
  startingColliderPosition,
  currentControllerPosition,
) {
  if (![startingControllerPosition, startingColliderPosition, currentControllerPosition].every(isPoint)) {
    return null;
  }
  const candidatePosition = {
    x: startingColliderPosition.x + currentControllerPosition.x - startingControllerPosition.x,
    y: startingColliderPosition.y + currentControllerPosition.y - startingControllerPosition.y,
    z: startingColliderPosition.z + currentControllerPosition.z - startingControllerPosition.z,
  };
  return getClosestLooperControlValue(path, candidatePosition);
}

export function getLooperControlMorphWeights(value = 0) {
  const clamped = clamp(value, -1, 1);
  return {
    up: Math.max(clamped, 0),
    down: Math.max(-clamped, 0),
  };
}

function closestPointOnSegment(point, start, end) {
  const delta = subtract(end, start);
  const lengthSquared = dot(delta, delta);
  const t = lengthSquared > 1e-12
    ? clamp(dot(subtract(point, start), delta) / lengthSquared, 0, 1)
    : 0;
  const closest = lerpPoint(start, end, t);
  const difference = subtract(point, closest);
  return { t, distanceSquared: dot(difference, difference) };
}

function lerpPoint(start, end, t) {
  return {
    x: start.x + (end.x - start.x) * t,
    y: start.y + (end.y - start.y) * t,
    z: start.z + (end.z - start.z) * t,
  };
}

function subtract(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function isPath(path) {
  return isPoint(path?.neutralAnchor) && isPoint(path?.upAnchor) && isPoint(path?.downAnchor);
}

function isPoint(value) {
  return value && [value.x, value.y, value.z].every(Number.isFinite);
}

function clamp(value, min, max) {
  return Math.min(Math.max(finite(value, min), min), max);
}

function finite(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}
