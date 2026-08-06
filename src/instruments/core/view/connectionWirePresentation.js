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
  if (!wireMesh || !startTarget?.getWorldPosition || !endTarget?.getWorldPosition) return false;
  startTarget.getWorldPosition(endpointStart);
  endTarget.getWorldPosition(endpointEnd);
  getWireSocketTangent(startTarget, startOwnerRoot, endpointStart, tangentStart);
  getWireSocketTangent(endTarget, endOwnerRoot, endpointEnd, tangentEnd, true);
  return updateWireMeshGeometry(wireMesh, endpointStart, endpointEnd, {
    startTangent: tangentStart,
    endTangent: tangentEnd,
    settings,
  });
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
  startTarget.getWorldPosition(endpointStart);
  endpointEnd.copy(endPoint);
  getWireSocketTangent(startTarget, startOwnerRoot, endpointStart, tangentStart);
  if (endTarget) {
    getWireSocketTangent(endTarget, endOwnerRoot, endpointEnd, tangentEnd, true);
  } else {
    tangentEnd.copy(endpointEnd).sub(endpointStart).normalize();
  }
  return updateWireMeshGeometry(wireMesh, endpointStart, endpointEnd, {
    startTangent: tangentStart,
    endTangent: tangentEnd,
    settings,
  });
}

export function getWireSocketTangent(
  target,
  ownerRoot,
  endpoint,
  output = new THREE.Vector3(),
  arriving = false,
) {
  const socketOutward = target?.userData?.wireSocketOutward;
  if (socketOutward && target?.parent) {
    target.parent.updateWorldMatrix?.(true, false);
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

export { disposeWireMesh };
