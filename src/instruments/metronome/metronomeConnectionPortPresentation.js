import { METRONOME_SETTINGS } from "../../config/metronome.js";

export function createMetronomeConnectionPortMaterial({ THREE, color, showDebug = false } = {}) {
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: METRONOME_SETTINGS.connectionPortOpacity,
    depthTest: !showDebug,
    depthWrite: false,
    wireframe: showDebug,
  });
  material.userData.disposeWithOwner = true;
  return material;
}
