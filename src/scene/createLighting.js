import * as THREE from "three";

export function createLighting() {
  const group = new THREE.Group();
  group.name = "SceneLighting";

  const hemisphere = new THREE.HemisphereLight(0xffffff, 0x2d3436, 1.15);
  group.add(hemisphere);

  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.name = "KeyLight";
  key.position.set(2.5, 4.2, 2.8);
  key.castShadow = true;
  group.add(key);

  const fill = new THREE.DirectionalLight(0x8fc7ff, 0.75);
  fill.name = "CoolFillLight";
  fill.position.set(-2.2, 2.2, 1.6);
  group.add(fill);

  const rim = new THREE.DirectionalLight(0xffd49a, 1.4);
  rim.name = "WarmRimLight";
  rim.position.set(-1.4, 2.8, -3.2);
  group.add(rim);
  return group;
}
