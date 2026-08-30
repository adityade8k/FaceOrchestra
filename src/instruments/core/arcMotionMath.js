const EPSILON = 1e-10;
const TAU = Math.PI * 2;
const DEG_TO_RAD = Math.PI / 180;

export class ArcMotionError extends TypeError {
  constructor(message) {
    super(message);
    this.name = "ArcMotionError";
  }
}

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

export function normalizeArcAxis(axis, label = "arc axis") {
  assertVector(axis, label);
  const length = vectorLength(axis);
  if (length <= EPSILON) throw new ArcMotionError(`${label} cannot be zero-length.`);
  return scale(axis, 1 / length);
}

export function projectOntoPlane(vector, normal) {
  assertVector(vector, "projected vector");
  const axis = normalizeArcAxis(normal, "plane normal");
  return subtract(vector, scale(axis, dot(vector, axis)));
}

export function resolveArcMotion(config = {}, { label = "arc" } = {}) {
  assertVector(config.center, `${label} center`);
  assertVector(config.colliderOffset, `${label} colliderOffset`);
  const axis = normalizeArcAxis(config.axis, `${label} axis`);
  const parallelAmount = dot(config.colliderOffset, axis);
  const colliderOffset = subtract(config.colliderOffset, scale(axis, parallelAmount));
  const orbitRadius = vectorLength(colliderOffset);
  if (orbitRadius <= EPSILON) {
    throw new ArcMotionError(`${label} colliderOffset must project to a non-zero orbit radius.`);
  }
  const minAngleDegrees = finite(config.minAngleDegrees, `${label} minAngleDegrees`);
  const maxAngleDegrees = finite(config.maxAngleDegrees, `${label} maxAngleDegrees`);
  const referenceAngleDegrees = finite(config.referenceAngleDegrees ?? 0, `${label} referenceAngleDegrees`);
  if (minAngleDegrees >= maxAngleDegrees) {
    throw new ArcMotionError(`${label} minAngleDegrees must be less than maxAngleDegrees.`);
  }
  return {
    center: clone(config.center),
    axis,
    colliderOffset,
    parallelOffset: scale(axis, parallelAmount),
    parallelOffsetAmount: parallelAmount,
    orbitRadius,
    minAngleDegrees,
    maxAngleDegrees,
    referenceAngleDegrees,
  };
}

export function rotateOffsetAroundAxis(offset, axis, angleRadians) {
  assertVector(offset, "rotated offset");
  const normal = normalizeArcAxis(axis);
  finite(angleRadians, "angleRadians");
  const cosine = Math.cos(angleRadians);
  const sine = Math.sin(angleRadians);
  const crossValue = cross(normal, offset);
  const parallelScale = dot(normal, offset) * (1 - cosine);
  return add(
    add(scale(offset, cosine), scale(crossValue, sine)),
    scale(normal, parallelScale),
  );
}

// colliderOffset is the center-relative rest vector. referenceAngleDegrees is
// applied before the requested movement angle, matching the Metronome rig.
export function getArcPointAtAngle(config, angleDegrees) {
  const arc = isResolvedArc(config) ? config : resolveArcMotion(config);
  const deltaRadians = (finite(angleDegrees, "angleDegrees") + arc.referenceAngleDegrees) * DEG_TO_RAD;
  return add(arc.center, rotateOffsetAroundAxis(arc.colliderOffset, arc.axis, deltaRadians));
}

export function getArcAngleForValue(config, value, valueMin = -1, valueMax = 1) {
  const arc = isResolvedArc(config) ? config : resolveArcMotion(config);
  return mapValueToAngle(value, valueMin, valueMax, arc.minAngleDegrees, arc.maxAngleDegrees);
}

export function getArcValueForAngle(config, angleDegrees, valueMin = -1, valueMax = 1) {
  const arc = isResolvedArc(config) ? config : resolveArcMotion(config);
  return mapAngleToValue(angleDegrees, arc.minAngleDegrees, arc.maxAngleDegrees, valueMin, valueMax);
}

export function getArcPointForValue(config, value, valueMin = -1, valueMax = 1) {
  const arc = isResolvedArc(config) ? config : resolveArcMotion(config);
  return getArcPointAtAngle(arc, getArcAngleForValue(arc, value, valueMin, valueMax));
}

export function setArcOrbitRadius(config, orbitRadius) {
  const arc = isResolvedArc(config) ? config : resolveArcMotion(config);
  finite(orbitRadius, "orbitRadius");
  if (orbitRadius <= EPSILON) {
    throw new ArcMotionError("orbitRadius must be greater than zero.");
  }
  const {
    orbitRadius: _orbitRadius,
    parallelOffset: _parallelOffset,
    parallelOffsetAmount: _parallelOffsetAmount,
    ...stableConfig
  } = config;
  return {
    ...stableConfig,
    colliderOffset: scale(arc.colliderOffset, orbitRadius / arc.orbitRadius),
  };
}

export function getArcAngleForPoint(config, point) {
  const arc = isResolvedArc(config) ? config : resolveArcMotion(config);
  assertVector(point, "arc point");
  const delta = signedAngleOnPlane(arc.colliderOffset, subtract(point, arc.center), arc.axis);
  return delta === null ? null : delta / DEG_TO_RAD - arc.referenceAngleDegrees;
}

export function intersectRayWithPlane(origin, direction, center, axis) {
  assertVector(origin, "ray origin");
  assertVector(direction, "ray direction");
  assertVector(center, "plane center");
  const normal = normalizeArcAxis(axis, "plane axis");
  const denominator = dot(direction, normal);
  if (Math.abs(denominator) <= EPSILON) return null;
  const distance = dot(subtract(center, origin), normal) / denominator;
  if (!Number.isFinite(distance) || distance < 0) return null;
  return add(origin, scale(direction, distance));
}

export function signedAngleOnPlane(from, to, normal) {
  const axis = normalizeArcAxis(normal, "angle plane normal");
  const projectedFrom = projectOntoPlane(from, axis);
  const projectedTo = projectOntoPlane(to, axis);
  const fromLength = vectorLength(projectedFrom);
  const toLength = vectorLength(projectedTo);
  if (fromLength <= EPSILON || toLength <= EPSILON) return null;
  const a = scale(projectedFrom, 1 / fromLength);
  const b = scale(projectedTo, 1 / toLength);
  return Math.atan2(dot(axis, cross(a, b)), clamp(dot(a, b), -1, 1));
}

export function signedAngularDeltaAroundPivot(fromPoint, toPoint, center, axis) {
  assertVector(center, "arc center");
  return signedAngleOnPlane(subtract(fromPoint, center), subtract(toPoint, center), axis);
}

export function wrapAngleRadians(angle) {
  finite(angle, "angle");
  let wrapped = angle % TAU;
  if (wrapped > Math.PI) wrapped -= TAU;
  if (wrapped <= -Math.PI) wrapped += TAU;
  return wrapped;
}

export function unwrapAngleDelta(current, previous) {
  return wrapAngleRadians(current - previous);
}

export function unwrapAngleNear(angle, reference) {
  finite(reference, "reference angle");
  return reference + unwrapAngleDelta(angle, reference);
}

export function generateArcPoints(config, {
  startAngleDegrees,
  endAngleDegrees,
  segments = 64,
} = {}) {
  const arc = isResolvedArc(config) ? config : resolveArcMotion(config);
  const start = startAngleDegrees ?? arc.minAngleDegrees;
  const end = endAngleDegrees ?? arc.maxAngleDegrees;
  if (!Number.isInteger(segments) || segments < 1) {
    throw new ArcMotionError("arc segments must be a positive integer.");
  }
  return Array.from({ length: segments + 1 }, (_, index) => (
    getArcPointAtAngle(arc, start + (end - start) * (index / segments))
  ));
}

export function vectorLength(vector) {
  return Math.hypot(vector.x, vector.y, vector.z);
}

function isResolvedArc(value) {
  return Boolean(value && Number.isFinite(value.orbitRadius) && value.parallelOffset);
}

function finite(value, label) {
  if (!Number.isFinite(value)) throw new ArcMotionError(`${label} must be finite.`);
  return value;
}

function assertVector(value, label) {
  if (!value || typeof value !== "object") throw new ArcMotionError(`${label} must be a vector.`);
  for (const key of ["x", "y", "z"]) finite(value[key], `${label}.${key}`);
}

function clone(value) {
  return { x: value.x, y: value.y, z: value.z };
}

function add(a, b) {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function subtract(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function scale(vector, amount) {
  return { x: vector.x * amount, y: vector.y * amount, z: vector.z * amount };
}

function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}
