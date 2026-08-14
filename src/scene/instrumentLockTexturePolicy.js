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
  instrumentState.root.traverse((object) => {
    if (
      !object.isMesh ||
      object.userData.isHitTarget ||
      object.userData.isNoteLabel ||
      object.name.startsWith("DEBUG_") ||
      !object.material
    ) {
      return;
    }

    object.material = Array.isArray(object.material)
      ? object.material.map((material) => swapMaterial(material, targetMap))
      : swapMaterial(object.material, targetMap);
  });
  instrumentState.lockedTextureApplied = useLockedTexture;
  return true;
}
