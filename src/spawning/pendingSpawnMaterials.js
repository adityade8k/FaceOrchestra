import * as THREE from "three";

export const PENDING_SPAWN_RENDER_ORDER = 60;

export function createPendingSpawnGlassMaterial(sourceMaterial = null) {
  const normalScale = sourceMaterial?.normalScale?.clone?.() || new THREE.Vector2(0.18, 0.18);
  normalScale.multiplyScalar(0.45);

  const material = new THREE.MeshPhysicalMaterial({
    name: "PendingSpawnGlass",
    color: 0xd8f8ff,
    metalness: 0,
    roughness: 0.035,
    transmission: 0.82,
    thickness: 0.12,
    ior: 1.48,
    attenuationColor: new THREE.Color(0xc6f5ff),
    attenuationDistance: 0.7,
    clearcoat: 1,
    clearcoatRoughness: 0.03,
    transparent: true,
    opacity: 0.34,
    side: sourceMaterial?.side ?? THREE.DoubleSide,
    depthWrite: false,
    depthTest: true,
    normalMap: sourceMaterial?.normalMap || null,
    normalScale,
    envMapIntensity: 1.25,
    toneMapped: sourceMaterial?.toneMapped ?? true,
  });
  material.userData.disposeOnPendingSpawnRestore = true;
  material.userData.disposeOnInstrumentDelete = true;
  return material;
}

export function disposePendingSpawnMaterials(materialOrMaterials) {
  const materials = Array.isArray(materialOrMaterials) ? materialOrMaterials : [materialOrMaterials];
  for (const material of materials) {
    if (material?.userData.disposeOnPendingSpawnRestore) material.dispose();
  }
}
