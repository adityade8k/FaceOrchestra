export function resolveInstrumentLockTextureSet(
  instrumentState,
  { honk = null, looper = null, looperComponentId = null } = {},
) {
  if (
    instrumentState?.kind === "looper" ||
    (looperComponentId && instrumentState?.componentId === looperComponentId)
  ) {
    return looper;
  }
  if (instrumentState?.kind === "honk") {
    return honk;
  }
  return null;
}

export function applyInstrumentLockedTexture(
  instrumentState,
  locked,
  textureSet,
  { swapMaterial } = {},
) {
  const baseMap = textureSet?.baseMap;
  const lockedBaseMap = textureSet?.lockedBaseMap;
  if (!instrumentState?.root || !baseMap || !lockedBaseMap || typeof swapMaterial !== "function") {
    return false;
  }

  const useLockedTexture = Boolean(locked);
  if (instrumentState.lockedTextureApplied === useLockedTexture) {
    return false;
  }

  const targetMap = useLockedTexture ? lockedBaseMap : baseMap;
  let updatedMaterialCount = 0;
  instrumentState.root.traverse((object) => {
    if (
      !object.isMesh ||
      (object.userData?.isHitTarget && object.userData?.usesVisibleMeshForGrip !== true) ||
      object.userData?.isNoteLabel ||
      object.name.startsWith("DEBUG_") ||
      !object.material
    ) {
      return;
    }

    const swap = (material) => {
      if (!material) return material;
      const previousMap = material.map;
      const swappedMaterial = swapMaterial(material, targetMap);
      if (!swappedMaterial || swappedMaterial.map !== targetMap) return material;
      if (swappedMaterial !== material || swappedMaterial.map !== previousMap) {
        updatedMaterialCount += 1;
      }
      return swappedMaterial;
    };

    object.material = Array.isArray(object.material)
      ? object.material.map(swap)
      : swap(object.material);
  });

  if (updatedMaterialCount === 0) {
    return false;
  }
  instrumentState.lockedTextureApplied = useLockedTexture;
  return true;
}
