import * as THREE from "three";

export const BASICS_TARGET_COLORS = Object.freeze({ action: 0xffcf20, source: 0x42ff96 });
const scale = new THREE.Vector3();

export function createBasicsTargetCue(name) {
  const cue = new THREE.Mesh(
    new THREE.RingGeometry(0.67, 1, 48),
    new THREE.MeshBasicMaterial({
      color: BASICS_TARGET_COLORS.action,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  cue.name = name;
  cue.raycast = () => {};
  cue.renderOrder = 31;
  cue.visible = false;
  return cue;
}

export function basicsTargetRadius(target) {
  if (!target.geometry?.boundingSphere) target.geometry?.computeBoundingSphere();
  target.getWorldScale(scale);
  return THREE.MathUtils.clamp(
    (target.geometry?.boundingSphere?.radius || 0.03) * Math.max(scale.x, scale.y, scale.z) * 1.35,
    0.045,
    0.075,
  );
}

export function updateBasicsTargetCue(
  cue,
  target,
  rotation,
  now,
  { radius = basicsTargetRadius(target), color = BASICS_TARGET_COLORS.action } = {},
) {
  target.getWorldPosition(cue.position);
  cue.quaternion.copy(rotation);
  cue.scale.setScalar(radius);
  cue.material.color.setHex(color);
  cue.material.opacity = 0.92 + Math.sin(now / 220) * 0.08;
}
