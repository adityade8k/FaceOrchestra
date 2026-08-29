import { CalibrationValueError, normalizeCalibrationAxis } from "../../instruments/core/calibrationMath.js";
import { mapValueToAngle, projectOntoPlane, vectorLength } from "../../instruments/metronome/metronomeArcMath.js";

export function projectHandleColliderOffset(offset, axis, label = "handle") {
  const normalizedAxis = normalizeCalibrationAxis(axis, `${label} axis`);
  const projectedOffset = projectOntoPlane(offset, normalizedAxis);
  const orbitRadius = projectedOffset ? vectorLength(projectedOffset) : 0;
  if (orbitRadius < 1e-8) {
    throw new CalibrationValueError(`${label} colliderOffset must project to a non-zero orbit radius.`);
  }
  return {
    axis: normalizedAxis,
    projectedOffset,
    neutralDirection: {
      x: projectedOffset.x / orbitRadius,
      y: projectedOffset.y / orbitRadius,
      z: projectedOffset.z / orbitRadius,
    },
    orbitRadius,
  };
}

export function mapHandleValueToAngles({
  value,
  valueMin,
  valueMax,
  minAngleDegrees,
  maxAngleDegrees,
  referenceAngleDegrees = 0,
} = {}) {
  const degreesToRadians = Math.PI / 180;
  const movementAngleRadians = mapValueToAngle(
    value,
    valueMin,
    valueMax,
    minAngleDegrees * degreesToRadians,
    maxAngleDegrees * degreesToRadians,
  );
  return {
    movementAngleRadians,
    appliedAngleRadians: movementAngleRadians + referenceAngleDegrees * degreesToRadians,
  };
}
