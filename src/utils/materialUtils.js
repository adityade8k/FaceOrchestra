import * as THREE from "three";

export function applyStandardInstrumentMaterials(root, textures = {}) {
  root.traverse((object) => {
    if (!object.isMesh || object.userData.isHitTarget) {
      return;
    }

    object.material = makeStandardInstrumentMaterial(object.material, textures);
    object.castShadow = true;
    object.receiveShadow = true;
  });
}

export function makeStandardInstrumentMaterial(sourceMaterial, textures = {}) {
  return new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.baseMap ?? sourceMaterial?.map ?? null,
    normalMap: textures.normalMap ?? sourceMaterial?.normalMap ?? null,
    roughnessMap: textures.roughnessMap ?? sourceMaterial?.roughnessMap ?? null,
    metalnessMap: textures.metalnessMap ?? sourceMaterial?.metalnessMap ?? null,
    roughness: textures.roughnessMap ? 1 : sourceMaterial?.roughness ?? 0.48,
    metalness: textures.metalnessMap ? 1 : sourceMaterial?.metalness ?? 0.02,
    side: THREE.DoubleSide,
  });
}

export async function loadMaterialTextureSet(textureLoader, texturePaths) {
  const entries = Object.entries(texturePaths);
  const loaded = await Promise.all(entries.map(([, path]) => textureLoader.loadAsync(path)));
  const textures = {};

  entries.forEach(([key], index) => {
    textures[key] = loaded[index];
  });

  entries.forEach(([key], index) => {
    if (key.toLowerCase().endsWith("basemap")) {
      loaded[index].colorSpace = THREE.SRGBColorSpace;
    }
  });

  for (const texture of loaded) {
    texture.flipY = false;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
  }

  return textures;
}
