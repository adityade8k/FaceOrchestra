import { INTERACTION_TARGET_NAMES } from "../../config/honk.js";

// Grip detection uses imported visible mesh geometry. No procedural box is
// created, and authored geometry/materials are not modified.
export function createBodyGripTarget(
  root,
  hitTargets,
  { interactionRole = null } = {},
) {
  const meshes = [];
  root?.traverse?.((object) => {
    if (
      object.isMesh &&
      object.visible !== false &&
      !object.userData?.isHitTarget &&
      !object.userData?.isBodyGripTarget &&
      !object.name?.startsWith("DEBUG_") &&
      !object.name?.startsWith("EDITOR_")
    ) meshes.push(object);
  });
  if (!meshes.length) return null;

  for (const mesh of meshes) {
    mesh.userData ||= {};
    mesh.userData.isHitTarget = true;
    mesh.userData.isBodyGripTarget = true;
    mesh.userData.usesVisibleMeshForGrip = true;
    if (interactionRole) mesh.userData.interactionRole = interactionRole;
  }

  const primary = meshes[0];
  hitTargets[INTERACTION_TARGET_NAMES.body] = primary;
  return primary;
}
