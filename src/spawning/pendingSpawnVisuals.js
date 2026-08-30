export function applyPendingSpawnVisualsToState(
  state,
  { createPreviewMaterial, renderOrder },
) {
  state.root.traverse((object) => {
    const isVisibleGripMesh =
      object.isMesh && object.userData.usesVisibleMeshForGrip === true;
    if (!isVisibleGripMesh && isPendingSpawnInteractionGeometry(object, state.root)) {
      preservePendingSpawnVisibility(object);
      object.visible = false;
      return;
    }

    if (!object.isMesh || !object.material) return;
    if (Object.prototype.hasOwnProperty.call(object.userData, "pendingSpawnOriginalMaterial")) {
      return;
    }

    preservePendingSpawnVisibility(object);
    object.userData.pendingSpawnOriginalMaterial = object.material;
    object.userData.pendingSpawnOriginalCastShadow = object.castShadow;
    object.userData.pendingSpawnOriginalReceiveShadow = object.receiveShadow;
    object.userData.pendingSpawnOriginalRenderOrder = object.renderOrder;
    object.material = Array.isArray(object.material)
      ? object.material.map((material) => createPreviewMaterial(material))
      : createPreviewMaterial(object.material);
    object.castShadow = false;
    object.receiveShadow = false;
    object.renderOrder = Math.max(object.renderOrder || 0, renderOrder);
  });

  state.raycastTargetsDirty = true;
}

export function restorePendingSpawnVisualsToState(state, { disposePreviewMaterials }) {
  state.root.traverse((object) => {
    if (Object.prototype.hasOwnProperty.call(object.userData, "pendingSpawnPreviousVisible")) {
      object.visible = object.userData.pendingSpawnPreviousVisible;
      delete object.userData.pendingSpawnPreviousVisible;
    }

    if (!object.isMesh || !Object.prototype.hasOwnProperty.call(object.userData, "pendingSpawnOriginalMaterial")) {
      return;
    }

    const previewMaterial = object.material;
    object.material = object.userData.pendingSpawnOriginalMaterial;
    disposePreviewMaterials(previewMaterial);

    object.castShadow = object.userData.pendingSpawnOriginalCastShadow;
    object.receiveShadow = object.userData.pendingSpawnOriginalReceiveShadow;
    object.renderOrder = object.userData.pendingSpawnOriginalRenderOrder;
    delete object.userData.pendingSpawnOriginalMaterial;
    delete object.userData.pendingSpawnOriginalCastShadow;
    delete object.userData.pendingSpawnOriginalReceiveShadow;
    delete object.userData.pendingSpawnOriginalRenderOrder;
  });

  state.raycastTargetsDirty = true;
}

function preservePendingSpawnVisibility(object) {
  if (!Object.prototype.hasOwnProperty.call(object.userData, "pendingSpawnPreviousVisible")) {
    object.userData.pendingSpawnPreviousVisible = object.visible;
  }
}

function isPendingSpawnInteractionGeometry(object, root) {
  for (let current = object; current && current !== root; current = current.parent) {
    if (
      current.userData?.isHitTarget === true ||
      current.userData?.isMetronomeDebug === true ||
      current.name?.startsWith("DEBUG_")
    ) {
      return true;
    }
  }
  return false;
}
