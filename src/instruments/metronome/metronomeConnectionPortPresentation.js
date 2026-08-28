import { METRONOME_SETTINGS } from "../../config/metronome.js";

export function createMetronomeConnectionPortMaterial({ THREE, color, showDebug = false } = {}) {
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: showDebug ? METRONOME_SETTINGS.connectionPortOpacity : 0,
    depthTest: !showDebug,
    depthWrite: false,
    wireframe: showDebug,
  });
  material.userData.disposeWithOwner = true;
  return material;
}
