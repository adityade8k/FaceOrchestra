import * as THREE from "three";

export function createFallbackEnvironment() {
  const grid = new THREE.GridHelper(8, 16, 0x5b6470, 0x353b42);
  grid.name = "FallbackWorld";
  grid.position.y = 0;
  return grid;
}
