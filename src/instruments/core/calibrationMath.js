const EPSILON = 1e-12;

class CalibrationValueError extends TypeError {
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

export function colliderScaleToRadius(colliderScale, maxModelDimension) {
  assertFiniteNumber(colliderScale, "colliderScale");
  assertPositiveDimension(maxModelDimension);
  if (colliderScale < 0) throw new CalibrationValueError("colliderScale cannot be negative.");
  return colliderScale * maxModelDimension;
}

function assertFiniteVector(value, label = "vector") {
  if (!value || typeof value !== "object") throw new CalibrationValueError(`${label} must be a vector.`);
  for (const axis of ["x", "y", "z"]) assertFiniteNumber(value[axis], `${label}.${axis}`);
  return value;
}

function assertFiniteNumber(value, label = "number") {
  if (!Number.isFinite(value)) throw new CalibrationValueError(`${label} must be finite.`);
  return value;
}

function assertPositiveDimension(value) {
  assertFiniteNumber(value, "max model dimension");
  if (value <= EPSILON) throw new CalibrationValueError("max model dimension must be greater than zero.");
}
