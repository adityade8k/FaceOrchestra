import * as THREE from "three";

// Shared material helpers for runtime asset loading.

export function applyStandardInstrumentMaterials(root, textures = {}, options = {}) {
  root.traverse((object) => {
    if (!object.isMesh || object.userData.isHitTarget) {
      return;
    }

    object.material = makeStandardInstrumentMaterial(object.material, textures, options);
    object.castShadow = true;
    object.receiveShadow = true;
  });
}

export function makeStandardInstrumentMaterial(
  sourceMaterial,
  textures = {},
  {
    useSourceMaterialMaps = true,
    textureTransforms = {},
    bumpScale = 0.035,
  } = {},
) {
  const map = applyTextureTransform(
    getMaterialTexture(textures.baseMap, sourceMaterial?.map, useSourceMaterialMaps),
    textureTransforms.baseMap,
  );
  const normalMap = getMaterialTexture(textures.normalMap, sourceMaterial?.normalMap, useSourceMaterialMaps);
  const roughnessMap = getMaterialTexture(textures.roughnessMap, sourceMaterial?.roughnessMap, useSourceMaterialMaps);
  const metalnessMap = getMaterialTexture(textures.metalnessMap, sourceMaterial?.metalnessMap, useSourceMaterialMaps);
  const bumpMap = getMaterialTexture(textures.heightMap, sourceMaterial?.bumpMap, useSourceMaterialMaps);

  return new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map,
    normalMap,
    roughnessMap,
    metalnessMap,
    bumpMap,
    bumpScale: bumpMap ? bumpScale : 1,
    roughness: textures.roughnessMap ? 1 : useSourceMaterialMaps ? sourceMaterial?.roughness ?? 0.48 : 0.48,
    metalness: textures.metalnessMap ? 1 : useSourceMaterialMaps ? sourceMaterial?.metalness ?? 0.02 : 0.02,
    side: THREE.DoubleSide,
  });
}

function applyTextureTransform(texture, transform) {
  if (!texture || !transform) {
    return texture;
  }

  const transformedTexture = texture.clone();
  if (transform.center) {
    transformedTexture.center.set(transform.center.x ?? 0.5, transform.center.y ?? 0.5);
  } else {
    transformedTexture.center.set(0.5, 0.5);
  }
  if (Number.isFinite(transform.rotationDegrees)) {
    transformedTexture.rotation += THREE.MathUtils.degToRad(transform.rotationDegrees);
  }
  transformedTexture.matrixAutoUpdate = true;
  transformedTexture.needsUpdate = true;
  return transformedTexture;
}

function getMaterialTexture(replacementTexture, sourceTexture, useSourceMaterialMaps) {
  if (!replacementTexture) {
    return useSourceMaterialMaps ? sourceTexture ?? null : null;
  }

  return sourceTexture ? copyTextureMapping(replacementTexture, sourceTexture) : replacementTexture;
}

function copyTextureMapping(texture, sourceTexture) {
  const mappedTexture = texture.clone();
  mappedTexture.offset.copy(sourceTexture.offset);
  mappedTexture.repeat.copy(sourceTexture.repeat);
  mappedTexture.center.copy(sourceTexture.center);
  mappedTexture.rotation = sourceTexture.rotation;
  mappedTexture.wrapS = sourceTexture.wrapS;
  mappedTexture.wrapT = sourceTexture.wrapT;
  mappedTexture.flipY = sourceTexture.flipY;
  mappedTexture.matrixAutoUpdate = sourceTexture.matrixAutoUpdate;
  mappedTexture.matrix.copy(sourceTexture.matrix);
  if (typeof sourceTexture.channel === "number") {
    mappedTexture.channel = sourceTexture.channel;
  }
  mappedTexture.needsUpdate = true;
  return mappedTexture;
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
