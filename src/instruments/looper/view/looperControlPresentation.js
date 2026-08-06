export function getLooperControlColliderPosition(userData = {}, value = 0) {
  const clamped = clamp(value, -1, 1);
  if (userData.movementMode !== "arc") {
    return {
      x: finite(userData.neutralX, 0),
      y: mapLinear(clamped, -1, 1, finite(userData.minY, 0), finite(userData.maxY, 0)),
      z: finite(userData.neutralZ, 0),
    };
  }

  const minAngle = finite(userData.arcMinAngle, 0);
  const maxAngle = finite(userData.arcMaxAngle, 0);
  const angle = mapLinear(clamped, -1, 1, minAngle, maxAngle);
  const midpointAngle = mapLinear(0.5, 0, 1, minAngle, maxAngle);
  const side = finite(userData.arcSide, 1);
  const radius = Math.max(finite(userData.arcRadius, 0), 0);
  const midpointX = -side * Math.cos(midpointAngle) * radius;
  const midpointY = Math.sin(midpointAngle) * radius;
  const localX = -side * Math.cos(angle) * radius - midpointX;
  const localY = Math.sin(angle) * radius - midpointY;
  const rotationZ = finite(userData.arcRotationZ, 0);
  const rotationCos = Math.cos(rotationZ);
  const rotationSin = Math.sin(rotationZ);
  return {
    x: finite(userData.neutralX, 0) + localX * rotationCos - localY * rotationSin,
    y: finite(userData.neutralY, 0) + localX * rotationSin + localY * rotationCos,
    z: finite(userData.neutralZ, 0),
  };
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
