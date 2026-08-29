const EPSILON = 1e-12;

export class CalibrationValueError extends TypeError {
  constructor(message) {
    super(message);
    this.name = "CalibrationValueError";
  }
}

export function normalizedPositionToModel(position, center, size) {
  assertFiniteVector(position, "normalized position");
  assertFiniteVector(center, "bounds center");
  assertFiniteVector(size, "bounds size");
  return {
    x: center.x + size.x * position.x,
    y: center.y + size.y * position.y,
    z: center.z + size.z * position.z,
  };
}

export function modelPositionToNormalized(position, center, size) {
  assertFiniteVector(position, "model position");
  assertFiniteVector(center, "bounds center");
  assertFiniteVector(size, "bounds size");
  for (const axis of ["x", "y", "z"]) {
    if (Math.abs(size[axis]) <= EPSILON) {
      throw new CalibrationValueError(`Cannot normalize position: bounds size.${axis} is zero.`);
    }
  }
  return {
    x: (position.x - center.x) / size.x,
    y: (position.y - center.y) / size.y,
    z: (position.z - center.z) / size.z,
  };
}

export function colliderScaleToRadius(colliderScale, maxModelDimension) {
  assertFiniteNumber(colliderScale, "colliderScale");
  assertPositiveDimension(maxModelDimension);
  if (colliderScale < 0) throw new CalibrationValueError("colliderScale cannot be negative.");
  return colliderScale * maxModelDimension;
}

export function radiusToColliderScale(radius, maxModelDimension) {
  assertFiniteNumber(radius, "collider radius");
  assertPositiveDimension(maxModelDimension);
  if (radius < 0) throw new CalibrationValueError("collider radius cannot be negative.");
  return radius / maxModelDimension;
}

export function normalizeCalibrationAxis(axis, label = "axis") {
  assertFiniteVector(axis, label);
  const length = Math.hypot(axis.x, axis.y, axis.z);
  if (length <= EPSILON) throw new CalibrationValueError(`${label} cannot be zero-length.`);
  return { x: axis.x / length, y: axis.y / length, z: axis.z / length };
}

export function maxBoundsDimension(size) {
  assertFiniteVector(size, "bounds size");
  const maximum = Math.max(Math.abs(size.x), Math.abs(size.y), Math.abs(size.z));
  assertPositiveDimension(maximum);
  return maximum;
}

export function roundCalibrationNumber(value, places = 6) {
  assertFiniteNumber(value, "exported number");
  if (!Number.isInteger(places) || places < 0 || places > 12) {
    throw new CalibrationValueError("rounding places must be an integer from 0 through 12.");
  }
  const factor = 10 ** places;
  const rounded = Math.round((value + Number.EPSILON) * factor) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function assertFiniteVector(value, label = "vector") {
  if (!value || typeof value !== "object") throw new CalibrationValueError(`${label} must be a vector.`);
  for (const axis of ["x", "y", "z"]) assertFiniteNumber(value[axis], `${label}.${axis}`);
  return value;
}

export function assertFiniteNumber(value, label = "number") {
  if (!Number.isFinite(value)) throw new CalibrationValueError(`${label} must be finite.`);
  return value;
}

function assertPositiveDimension(value) {
  assertFiniteNumber(value, "max model dimension");
  if (value <= EPSILON) throw new CalibrationValueError("max model dimension must be greater than zero.");
}
