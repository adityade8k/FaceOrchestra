import {
  getArcPointForValue,
  resolveArcMotion,
} from "../../instruments/core/arcMotionMath.js";

export function arcCenterFromGizmoPosition(position) {
  return vectorObject(position);
}

export function colliderGizmoPositionForValue(arcConfig, value) {
  const arc = resolveArcMotion(arcConfig);
  const point = getArcPointForValue(arc, value);
  return subtract(point, arc.center);
}

export function applyCenterGizmoPosition(arcConfig, position) {
  return { ...arcConfig, center: arcCenterFromGizmoPosition(position) };
}

function vectorObject(value) {
  return { x: value.x, y: value.y, z: value.z };
}

function subtract(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}
