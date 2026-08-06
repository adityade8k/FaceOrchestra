import * as THREE from "three";
import { LOOPER_WIRE_SETTINGS } from "../../../config/looper.js";
import {
  createWireMaterial,
  disposeWireMesh,
  updateWireMeshGeometry,
} from "../../looper/view/wireUtils.js";

const endpointStart = new THREE.Vector3();
const endpointEnd = new THREE.Vector3();
const tangentStart = new THREE.Vector3();
const tangentEnd = new THREE.Vector3();
const ownerPosition = new THREE.Vector3();
const endpointMatrixCache = new WeakMap();

export function createConnectionWireMesh({
  scene,
  name,
  color,
  textures = {},
  renderOrder = 14,
} = {}) {
  const mesh = new THREE.Mesh(
    new THREE.BufferGeometry(),
    createWireMaterial(color, textures),
  );
  mesh.name = name || "CONNECTION_wire";
  mesh.renderOrder = renderOrder;
  scene?.add?.(mesh);
  return mesh;
}

export function updateConnectionWireBetweenTargets({
  wireMesh,
  startTarget,
  startOwnerRoot,
  endTarget,
  endOwnerRoot,
  settings = LOOPER_WIRE_SETTINGS,
} = {}) {
  return updateConnectionWireTargets(
    wireMesh,
    startTarget,
    startOwnerRoot,
    endTarget,
    endOwnerRoot,
    settings,
  );
}

export function updateConnectionWireTargets(
  wireMesh,
  startTarget,
  startOwnerRoot,
  endTarget,
  endOwnerRoot,
  settings = LOOPER_WIRE_SETTINGS,
) {
  if (!wireMesh || !startTarget?.getWorldPosition || !endTarget?.getWorldPosition) return false;
  getWireEndpointWorldPosition(startTarget, startOwnerRoot, endpointStart);
  getWireEndpointWorldPosition(endTarget, endOwnerRoot, endpointEnd);
  getWireSocketTangent(startTarget, startOwnerRoot, endpointStart, tangentStart);
  getWireSocketTangent(endTarget, endOwnerRoot, endpointEnd, tangentEnd, true);
  return updateConnectionWireGeometry(
    wireMesh,
    endpointStart,
    endpointEnd,
    tangentStart,
    tangentEnd,
    settings,
  );
}

export function updateConnectionWireToPoint({
  wireMesh,
  startTarget,
  startOwnerRoot,
  endPoint,
  endTarget = null,
  endOwnerRoot = null,
  settings = LOOPER_WIRE_SETTINGS,
} = {}) {
  if (!wireMesh || !startTarget?.getWorldPosition || !endPoint) return false;
  getWireEndpointWorldPosition(startTarget, startOwnerRoot, endpointStart);
  endpointEnd.copy(endPoint);
  getWireSocketTangent(startTarget, startOwnerRoot, endpointStart, tangentStart);
  if (endTarget) {
    getWireSocketTangent(endTarget, endOwnerRoot, endpointEnd, tangentEnd, true);
  } else {
    tangentEnd.copy(endpointEnd).sub(endpointStart).normalize();
  }
  return updateConnectionWireGeometry(
    wireMesh,
    endpointStart,
    endpointEnd,
    tangentStart,
    tangentEnd,
    settings,
  );
}

export function getWireSocketTangent(
  target,
  ownerRoot,
  endpoint,
  output = new THREE.Vector3(),
  arriving = false,
) {
  ensureWireEndpointWorldMatrix(target, ownerRoot);
  const socketOutward = target?.userData?.wireSocketOutward;
  if (socketOutward && target?.parent) {
    output
      .set(socketOutward.x || 0, socketOutward.y || 0, socketOutward.z || 0)
      .transformDirection(target.parent.matrixWorld);
  } else if (ownerRoot?.getWorldPosition) {
    ownerRoot.getWorldPosition(ownerPosition);
    output.copy(endpoint).sub(ownerPosition).normalize();
  } else {
    output.set(0, 0, 0);
  }
  if (arriving) output.negate();
  return output;
}

export function getWireEndpointWorldPosition(target, ownerRoot, output) {
  if (!target?.matrixWorld || !output?.setFromMatrixPosition) return output;
  ensureWireEndpointWorldMatrix(target, ownerRoot);
  return output.setFromMatrixPosition(target.matrixWorld);
}

/**
 * Endpoint matrices are refreshed only when their local transform or owning
 * instrument transform changes. The scene renderer remains responsible for
 * the ordinary full-tree matrix update.
 */
export function ensureWireEndpointWorldMatrix(target, ownerRoot = null) {
  if (!target?.updateWorldMatrix) return false;
  let cache = endpointMatrixCache.get(target);
  if (!cache) {
    cache = createEndpointMatrixCache();
    endpointMatrixCache.set(target, cache);
  }
  const ownerTransformChanged = copyTransformIfChanged(
    ownerRoot,
    cache.ownerPosition,
    cache.ownerQuaternion,
    cache.ownerScale,
  );
  const ownerChanged = cache.ownerRoot !== ownerRoot || ownerTransformChanged;
  const endpointChanged = copyTransformIfChanged(
    target,
    cache.targetPosition,
    cache.targetQuaternion,
    cache.targetScale,
  );
  if (!cache.initialized || ownerChanged || endpointChanged || target.matrixWorldNeedsUpdate) {
    target.updateWorldMatrix(true, false);
    cache.ownerRoot = ownerRoot;
    cache.initialized = true;
    return true;
  }
  return false;
}

function updateConnectionWireGeometry(
  wireMesh,
  start,
  end,
  startTangent,
  endTangent,
  settings,
) {
  const data = wireMesh.userData || (wireMesh.userData = {});
  const options = data.connectionWireUpdateOptions ||
    (data.connectionWireUpdateOptions = {});
  options.startTangent = startTangent;
  options.endTangent = endTangent;
  options.settings = settings;
  return updateWireMeshGeometry(wireMesh, start, end, options);
}

function createEndpointMatrixCache() {
  return {
    initialized: false,
    ownerRoot: null,
    ownerPosition: new THREE.Vector3(),
    ownerQuaternion: new THREE.Quaternion(),
    ownerScale: new THREE.Vector3(),
    targetPosition: new THREE.Vector3(),
    targetQuaternion: new THREE.Quaternion(),
    targetScale: new THREE.Vector3(),
  };
}

function copyTransformIfChanged(object, position, quaternion, scale) {
  if (!object) return false;
  const changed = !position.equals(object.position) ||
    !quaternion.equals(object.quaternion) ||
    !scale.equals(object.scale);
  position.copy(object.position);
  quaternion.copy(object.quaternion);
  scale.copy(object.scale);
  return changed;
}

export { disposeWireMesh };
