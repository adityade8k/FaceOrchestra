import * as THREE from "three";

const tempLift = new THREE.Vector3();
const tempMidA = new THREE.Vector3();
const tempMidB = new THREE.Vector3();
const tempMid = new THREE.Vector3();

export function createWireMaterial(color, textures = {}) {
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.92,
    metalness: 0.01,
    normalMap: textures.normalMap || null,
    roughnessMap: textures.roughnessMap || null,
  });
  material.userData.disposeOnInstrumentDelete = true;
  return material;
}

export function updateWireMeshGeometry(wireMesh, start, end, { segments, radius }) {
  if (!wireMesh || start.distanceToSquared(end) < 0.00001) {
    return;
  }

  const lastStart = wireMesh.userData.lastWireStart || new THREE.Vector3();
  const lastEnd = wireMesh.userData.lastWireEnd || new THREE.Vector3();
  if (wireMesh.userData.lastWireStart && lastStart.distanceToSquared(start) < 0.0000001 && lastEnd.distanceToSquared(end) < 0.0000001) {
    return;
  }

  const curve = createWireCurve(start, end);
  const geometry = new THREE.TubeGeometry(curve, segments, radius, 8, false);
  geometry.userData.disposeOnInstrumentDelete = true;
  wireMesh.geometry?.dispose?.();
  wireMesh.geometry = geometry;
  lastStart.copy(start);
  lastEnd.copy(end);
  wireMesh.userData.lastWireStart = lastStart;
  wireMesh.userData.lastWireEnd = lastEnd;
}

export function createWireCurve(start, end) {
  const distance = start.distanceTo(end);
  tempLift.set(0, Math.min(Math.max(distance * 0.28, 0.045), 0.22), 0);
  tempMid.copy(start).lerp(end, 0.5).addScaledVector(tempLift, 1.15);
  tempMidA.copy(start).lerp(end, 0.25).addScaledVector(tempLift, 0.75);
  tempMidB.copy(start).lerp(end, 0.75).addScaledVector(tempLift, 0.75);

  return new THREE.CatmullRomCurve3(
    [start.clone(), tempMidA.clone(), tempMid.clone(), tempMidB.clone(), end.clone()],
    false,
    "catmullrom",
    0.35,
  );
}

export function disposeWireMesh(wireMesh) {
  if (!wireMesh) {
    return;
  }

  wireMesh.removeFromParent();
  wireMesh.geometry?.dispose?.();
  const materials = Array.isArray(wireMesh.material) ? wireMesh.material : [wireMesh.material];
  for (const material of materials) {
    material?.dispose?.();
  }
}
