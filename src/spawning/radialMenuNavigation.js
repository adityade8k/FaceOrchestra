export const RadialMenuPhase = Object.freeze({
  parent: "parent",
  child: "child",
});

export function choosePullAxisTowardViewer(openPosition, openQuaternion, viewerPosition) {
  const q = components(openQuaternion, [0, 0, 0, 1]);
  const axis = normalize([
    2 * (q[0] * q[2] + q[3] * q[1]),
    2 * (q[1] * q[2] - q[3] * q[0]),
    1 - 2 * (q[0] * q[0] + q[1] * q[1]),
  ]);
  const open = components(openPosition);
  const viewer = components(viewerPosition);
  const towardViewer = viewer.map((value, index) => value - open[index]);
  const sign = dot(axis, towardViewer) < 0 ? -1 : 1;
  return { axis: axis.map((value) => value * sign || 0), localZSign: sign };
}

export function projectPullDistance(openPosition, currentPosition, pullAxis) {
  const open = components(openPosition);
  const current = components(currentPosition);
  return dot(current.map((value, index) => value - open[index]), components(pullAxis));
}

export function projectControllerRelativePullDistance({
  openingControllerPosition,
  currentControllerPosition,
  openingViewerPosition,
  currentViewerPosition,
  pullAxis,
}) {
  const openingController = components(openingControllerPosition);
  const currentController = components(currentControllerPosition);
  const openingViewer = components(openingViewerPosition);
  const currentViewer = components(currentViewerPosition);
  const controllerOnlyDisplacement = currentController.map((value, index) =>
    value - openingController[index] - (currentViewer[index] - openingViewer[index]));
  return dot(controllerOnlyDisplacement, components(pullAxis));
}

export function lockPositionToOpeningPlane(openingPosition, currentPosition, planeNormal) {
  const opening = components(openingPosition);
  const current = components(currentPosition);
  const normal = components(planeNormal);
  const depthDisplacement = dot(
    current.map((value, index) => value - opening[index]),
    normal,
  );
  return current.map((value, index) => value - normal[index] * depthDisplacement);
}

export function resolvePullPhase(phase, pullDistance, {
  childEntryThresholdM,
  childExitThresholdM,
}) {
  if (phase === RadialMenuPhase.parent && pullDistance >= childEntryThresholdM) {
    return RadialMenuPhase.child;
  }
  if (phase === RadialMenuPhase.child && pullDistance <= childExitThresholdM) {
    return RadialMenuPhase.parent;
  }
  return phase;
}

export function relativeZRoll(startQuaternion, currentQuaternion) {
  const start = components(startQuaternion, [0, 0, 0, 1]);
  const current = components(currentQuaternion, [0, 0, 0, 1]);
  const relativeZ = start[3] * current[2] - start[0] * current[1] +
    start[1] * current[0] - start[2] * current[3];
  const relativeW = start[3] * current[3] + start[0] * current[0] +
    start[1] * current[1] + start[2] * current[2];
  return normalizeAngle(2 * Math.atan2(relativeZ, relativeW));
}

export function getRadialLayerPresentation({
  controllerRoll,
  optionCount,
  dialBaseRotation = 0,
  ringBaseRotation = 0,
  settings,
}) {
  const directedRoll = controllerRoll * settings.rollDirection;
  const rollPastDeadzone = Math.abs(directedRoll) < settings.rollDeadzoneRadians
    ? 0
    : directedRoll - Math.sign(directedRoll) * settings.rollDeadzoneRadians;
  const dialRotation = dialBaseRotation - rollPastDeadzone * settings.dialSpeed;
  const arc = optionCount > 0 ? (Math.PI * 2) / optionCount : Math.PI * 2;
  return {
    ringRotation: ringBaseRotation - controllerRoll,
    dialRotation,
    selectedIndex: optionCount > 1 ? euclideanModulo(Math.round(dialRotation / arc), optionCount) : 0,
  };
}

function components(value, fallback = [0, 0, 0]) {
  if (!value) return [...fallback];
  if (Array.isArray(value)) return value;
  return [value.x, value.y, value.z, value.w].slice(0, fallback.length);
}

function dot(a, b) {
  return a.reduce((sum, value, index) => sum + value * b[index], 0);
}

function normalize(vector) {
  const length = Math.hypot(...vector) || 1;
  return vector.map((value) => value / length);
}

function normalizeAngle(angle) {
  return euclideanModulo(angle + Math.PI, Math.PI * 2) - Math.PI;
}

function euclideanModulo(value, divisor) {
  return ((value % divisor) + divisor) % divisor;
}
