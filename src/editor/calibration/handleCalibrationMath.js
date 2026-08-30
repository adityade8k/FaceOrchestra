import { CalibrationValueError, normalizeCalibrationAxis } from "../../instruments/core/calibrationMath.js";
import { mapValueToAngle, projectOntoPlane, vectorLength } from "../../instruments/core/arcMotionMath.js";

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

export function handlePivotPositionFromCenter(center, restPosition, restQuaternion, restScale) {
  const scaledCenter = {
    x: finiteAxis(center, "x", "handle center") * nonZeroAxis(restScale, "x"),
    y: finiteAxis(center, "y", "handle center") * nonZeroAxis(restScale, "y"),
    z: finiteAxis(center, "z", "handle center") * nonZeroAxis(restScale, "z"),
  };
  const rotatedCenter = rotateByQuaternion(scaledCenter, normalizedQuaternion(restQuaternion));
  return {
    x: finiteAxis(restPosition, "x", "handle rest position") + rotatedCenter.x,
    y: finiteAxis(restPosition, "y", "handle rest position") + rotatedCenter.y,
    z: finiteAxis(restPosition, "z", "handle rest position") + rotatedCenter.z,
  };
}

export function handleCenterFromPivotPosition(position, restPosition, restQuaternion, restScale) {
  const delta = {
    x: finiteAxis(position, "x", "handle pivot position") - finiteAxis(restPosition, "x", "handle rest position"),
    y: finiteAxis(position, "y", "handle pivot position") - finiteAxis(restPosition, "y", "handle rest position"),
    z: finiteAxis(position, "z", "handle pivot position") - finiteAxis(restPosition, "z", "handle rest position"),
  };
  const quaternion = normalizedQuaternion(restQuaternion);
  const local = rotateByQuaternion(delta, {
    x: -quaternion.x,
    y: -quaternion.y,
    z: -quaternion.z,
    w: quaternion.w,
  });
  return {
    x: local.x / nonZeroAxis(restScale, "x"),
    y: local.y / nonZeroAxis(restScale, "y"),
    z: local.z / nonZeroAxis(restScale, "z"),
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

function normalizedQuaternion(value) {
  const x = finiteAxis(value, "x", "handle rest quaternion");
  const y = finiteAxis(value, "y", "handle rest quaternion");
  const z = finiteAxis(value, "z", "handle rest quaternion");
  const w = finiteAxis(value, "w", "handle rest quaternion");
  const length = Math.hypot(x, y, z, w);
  if (length < 1e-12) throw new CalibrationValueError("handle rest quaternion cannot be zero-length.");
  return { x: x / length, y: y / length, z: z / length, w: w / length };
}

function rotateByQuaternion(vector, quaternion) {
  const tx = 2 * (quaternion.y * vector.z - quaternion.z * vector.y);
  const ty = 2 * (quaternion.z * vector.x - quaternion.x * vector.z);
  const tz = 2 * (quaternion.x * vector.y - quaternion.y * vector.x);
  return {
    x: vector.x + quaternion.w * tx + quaternion.y * tz - quaternion.z * ty,
    y: vector.y + quaternion.w * ty + quaternion.z * tx - quaternion.x * tz,
    z: vector.z + quaternion.w * tz + quaternion.x * ty - quaternion.y * tx,
  };
}

function finiteAxis(value, axis, label) {
  const number = value?.[axis];
  if (!Number.isFinite(number)) throw new CalibrationValueError(`${label}.${axis} must be finite.`);
  return number;
}

function nonZeroAxis(value, axis) {
  const number = finiteAxis(value, axis, "handle rest scale");
  if (Math.abs(number) < 1e-12) throw new CalibrationValueError(`handle rest scale.${axis} cannot be zero.`);
  return number;
}
