const EPSILON = 1e-7;
const IDENTITY_MATRIX = Object.freeze([
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
]);

export function deriveLooperControlGeometry(
  root,
  morphTargets,
  { colliderPadding = 1 } = {},
) {
  const upName = morphTargets?.up;
  const downName = morphTargets?.down;
  if (!root?.traverse || !upName || !downName) return null;

  let match = null;
  root.traverse((object) => {
    if (match) return;
    const dictionary = object.morphTargetDictionary;
    const morphPositions = object.geometry?.morphAttributes?.position;
    const upIndex = dictionary?.[upName];
    const downIndex = dictionary?.[downName];
    if (
      Number.isInteger(upIndex) &&
      Number.isInteger(downIndex) &&
      object.geometry?.attributes?.position &&
      morphPositions?.[upIndex] &&
      morphPositions?.[downIndex]
    ) {
      match = { mesh: object, upIndex, downIndex };
    }
  });
  if (!match) return null;

  root.updateMatrixWorld?.(true);
  match.mesh.updateMatrixWorld?.(true);
  const matrixElements = getMeshToRootMatrixElements(root, match.mesh);
  const geometry = match.mesh.geometry;
  const result = deriveMorphAnchorPath({
    basePosition: geometry.attributes.position,
    upPosition: geometry.morphAttributes.position[match.upIndex],
    downPosition: geometry.morphAttributes.position[match.downIndex],
    morphTargetsRelative: Boolean(geometry.morphTargetsRelative),
    meshToRootMatrixElements: matrixElements,
    colliderPadding,
  });
  return result ? { ...result, mesh: match.mesh } : null;
}

export function deriveMorphAnchorPath({
  basePosition,
  upPosition,
  downPosition,
  morphTargetsRelative = true,
  meshToRootMatrixElements = IDENTITY_MATRIX,
  colliderPadding = 1,
} = {}) {
  const count = basePosition?.count;
  if (
    !Number.isInteger(count) || count <= 0 ||
    upPosition?.count !== count || downPosition?.count !== count ||
    !isMatrix(meshToRootMatrixElements) ||
    !Number.isFinite(colliderPadding) || colliderPadding <= 0
  ) return null;

  const neutralSum = point();
  const upSum = point();
  const downSum = point();
  const bounds = createBounds();
  let affectedVertexCount = 0;

  for (let index = 0; index < count; index += 1) {
    const neutralLocal = readPoint(basePosition, index);
    const upAttributePoint = readPoint(upPosition, index);
    const downAttributePoint = readPoint(downPosition, index);
    const upDelta = morphTargetsRelative
      ? upAttributePoint
      : subtract(upAttributePoint, neutralLocal);
    const downDelta = morphTargetsRelative
      ? downAttributePoint
      : subtract(downAttributePoint, neutralLocal);
    if (!isNonZero(upDelta) && !isNonZero(downDelta)) continue;

    const upLocal = morphTargetsRelative ? add(neutralLocal, upDelta) : upAttributePoint;
    const downLocal = morphTargetsRelative ? add(neutralLocal, downDelta) : downAttributePoint;
    const neutral = applyMatrix(neutralLocal, meshToRootMatrixElements);
    const up = applyMatrix(upLocal, meshToRootMatrixElements);
    const down = applyMatrix(downLocal, meshToRootMatrixElements);
    accumulate(neutralSum, neutral);
    accumulate(upSum, up);
    accumulate(downSum, down);
    expandBounds(bounds, neutral);
    expandBounds(bounds, up);
    expandBounds(bounds, down);
    affectedVertexCount += 1;
  }

  if (affectedVertexCount === 0) return null;
  const neutralAnchor = divide(neutralSum, affectedVertexCount);
  const upAnchor = divide(upSum, affectedVertexCount);
  const downAnchor = divide(downSum, affectedVertexCount);
  const dimensions = {
    x: bounds.max.x - bounds.min.x,
    y: bounds.max.y - bounds.min.y,
    z: bounds.max.z - bounds.min.z,
  };
  const positiveDimensions = Object.values(dimensions).filter((value) => value > EPSILON);
  if (positiveDimensions.length === 0) return null;
  const colliderRadius = Math.min(...positiveDimensions) * 0.5 * colliderPadding;
  if (!Number.isFinite(colliderRadius) || colliderRadius <= EPSILON) return null;

  return {
    neutralAnchor,
    upAnchor,
    downAnchor,
    colliderRadius,
    affectedVertexCount,
  };
}

function getMeshToRootMatrixElements(root, mesh) {
  if (root === mesh) return IDENTITY_MATRIX;
  const rootMatrix = root.matrixWorld;
  const meshMatrix = mesh.matrixWorld;
  if (!rootMatrix?.clone || !meshMatrix) return IDENTITY_MATRIX;
  return rootMatrix.clone().invert().multiply(meshMatrix).elements;
}

function readPoint(attribute, index) {
  if (attribute?.getX) {
    return { x: attribute.getX(index), y: attribute.getY(index), z: attribute.getZ(index) };
  }
  const itemSize = attribute?.itemSize || 3;
  const offset = index * itemSize;
  return {
    x: attribute?.array?.[offset],
    y: attribute?.array?.[offset + 1],
    z: attribute?.array?.[offset + 2],
  };
}

function applyMatrix(value, elements) {
  const denominator = elements[3] * value.x + elements[7] * value.y + elements[11] * value.z + elements[15];
  const w = denominator ? 1 / denominator : 1;
  return {
    x: (elements[0] * value.x + elements[4] * value.y + elements[8] * value.z + elements[12]) * w,
    y: (elements[1] * value.x + elements[5] * value.y + elements[9] * value.z + elements[13]) * w,
    z: (elements[2] * value.x + elements[6] * value.y + elements[10] * value.z + elements[14]) * w,
  };
}

function isMatrix(value) {
  return value?.length === 16 && [...value].every(Number.isFinite);
}

function isNonZero(value) {
  return value.x !== 0 || value.y !== 0 || value.z !== 0;
}

function point(x = 0, y = 0, z = 0) {
  return { x, y, z };
}

function add(a, b) {
  return point(a.x + b.x, a.y + b.y, a.z + b.z);
}

function subtract(a, b) {
  return point(a.x - b.x, a.y - b.y, a.z - b.z);
}

function accumulate(target, value) {
  target.x += value.x;
  target.y += value.y;
  target.z += value.z;
}

function divide(value, divisor) {
  return point(value.x / divisor, value.y / divisor, value.z / divisor);
}

function createBounds() {
  return {
    min: point(Infinity, Infinity, Infinity),
    max: point(-Infinity, -Infinity, -Infinity),
  };
}

function expandBounds(bounds, value) {
  for (const axis of ["x", "y", "z"]) {
    bounds.min[axis] = Math.min(bounds.min[axis], value[axis]);
    bounds.max[axis] = Math.max(bounds.max[axis], value[axis]);
  }
}
