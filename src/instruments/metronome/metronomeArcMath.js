const EPSILON = 1e-8;

export function clamp(value, min, max) {
  return Math.min(Math.max(Number.isFinite(value) ? value : min, min), max);
}

export function mapValueToAngle(value, valueMin, valueMax, angleMin, angleMax) {
  const amount = (clamp(value, valueMin, valueMax) - valueMin) / (valueMax - valueMin || 1);
  return angleMin + amount * (angleMax - angleMin);
}

export function mapAngleToValue(angle, angleMin, angleMax, valueMin, valueMax) {
  const amount = (clamp(angle, angleMin, angleMax) - angleMin) / (angleMax - angleMin || 1);
  return clamp(valueMin + amount * (valueMax - valueMin), valueMin, valueMax);
}

export function projectOntoPlane(vector, normal) {
  const normalLengthSquared = dot(normal, normal);
  if (normalLengthSquared < EPSILON) return null;
  const scale = dot(vector, normal) / normalLengthSquared;
  return {
    x: vector.x - normal.x * scale,
    y: vector.y - normal.y * scale,
    z: vector.z - normal.z * scale,
  };
}

export function vectorLength(vector) {
  return Math.hypot(vector.x, vector.y, vector.z);
}

export function signedAngleOnPlane(from, to, normal) {
  const projectedFrom = projectOntoPlane(from, normal);
  const projectedTo = projectOntoPlane(to, normal);
  if (!projectedFrom || !projectedTo) return null;
  const fromLength = vectorLength(projectedFrom);
  const toLength = vectorLength(projectedTo);
  if (fromLength < EPSILON || toLength < EPSILON) return null;
  const a = scale(projectedFrom, 1 / fromLength);
  const b = scale(projectedTo, 1 / toLength);
  const cross = {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
  return Math.atan2(dot(normal, cross), clamp(dot(a, b), -1, 1));
}

export function unwrapAngleDelta(current, previous) {
  let delta = current - previous;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function scale(vector, amount) {
  return { x: vector.x * amount, y: vector.y * amount, z: vector.z * amount };
}
