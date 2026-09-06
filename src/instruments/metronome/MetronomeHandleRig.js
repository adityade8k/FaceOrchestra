import {
  METRONOME_HANDLE_CONTROLS,
  METRONOME_SETTINGS,
} from "../../config/metronome.js";
import { METRONOME_INTERACTION_ROLES } from "./MetronomeInstrument.js";
import {
  clamp,
  generateArcPoints,
  mapAngleToValue,
  mapValueToAngle,
  projectOntoPlane,
  rotateOffsetAroundAxis,
  signedAngleOnPlane,
  unwrapAngleDelta,
  vectorLength,
} from "../core/arcMotionMath.js";

const RAY_EPSILON = 1e-5;
const PLANE_TOLERANCE = 1e-4;

export class MetronomeHandleRig {
  constructor({ THREE, root, configs = METRONOME_HANDLE_CONTROLS, showDebug = true } = {}) {
    this.THREE = THREE;
    this.root = root;
    this.controls = new Map();
    this.targets = {};
    this.disposables = new Set();
    this.originalChildIndices = new Map();
    for (const config of configs) {
      const handle = this.root.getObjectByName(config.nodeName);
      if (handle?.parent) this.originalChildIndices.set(handle, handle.parent.children.indexOf(handle));
    }
    for (const config of configs) this.createControl(config, showDebug);
  }

  createControl(config, showDebug) {
    const handle = this.root.getObjectByName(config.nodeName);
    if (!handle) {
      console.warn(`Metronome handle node "${config.nodeName}" was not found; ${config.parameter} control disabled.`);
      return;
    }
    if (!handle.geometry) {
      console.warn(`Metronome handle node "${config.nodeName}" has no geometry; ${config.parameter} control disabled.`);
      return;
    }
    const axis = vector(this.THREE, config.axis);
    if (axis.lengthSq() < 1e-12) {
      console.warn(`Metronome handle "${config.nodeName}" has a zero-length rotation axis; control disabled.`);
      return;
    }
    axis.normalize();

    const colliderOffset = vector(this.THREE, config.colliderOffset);
    const axialDistance = colliderOffset.dot(axis);
    const radialOffset = colliderOffset.clone().addScaledVector(axis, -axialDistance);
    const radius = radialOffset.length();
    if (radius < 1e-6) {
      console.warn(`Metronome handle "${config.nodeName}" collider offset produces a zero arc radius; control disabled.`);
      return;
    }
    if (Math.abs(axialDistance) > Math.max(radius * 0.01, PLANE_TOLERANCE)) {
      console.warn(`Metronome handle "${config.nodeName}" collider offset is outside its movement plane; projecting it onto the plane.`);
      colliderOffset.copy(radialOffset);
    }

    const originalParent = handle.parent;
    const originalChildIndex = this.originalChildIndices.get(handle);
    const importedPosition = handle.position.clone();
    const importedQuaternion = handle.quaternion.clone();
    const importedScale = handle.scale.clone();

    const pivotGroup = new this.THREE.Group();
    pivotGroup.name = `METRONOME_${config.parameter}_pivot`;
    pivotGroup.position.copy(vector(this.THREE, config.pivot));
    originalParent.add(pivotGroup);
    const restPivotPosition = pivotGroup.position.clone();
    const restPivotQuaternion = pivotGroup.quaternion.clone();
    const restPivotScale = pivotGroup.scale.clone();

    // The pivot is an identity transform apart from translation and shares the
    // handle's original parent, so this preserves the imported parent-space
    // transform exactly at rest.
    pivotGroup.add(handle);
    handle.position.copy(importedPosition).sub(restPivotPosition);
    handle.quaternion.copy(importedQuaternion);
    handle.scale.copy(importedScale);

    const rootAxis = resolveHandleAxisInRootSpace({
      THREE: this.THREE,
      root: this.root,
      handle: pivotGroup,
      localAxis: axis,
      restQuaternion: restPivotQuaternion,
    });

    const restFrame = new this.THREE.Group();
    restFrame.name = `METRONOME_${config.parameter}_rest_frame`;
    restFrame.position.copy(restPivotPosition);
    restFrame.quaternion.copy(restPivotQuaternion);
    restFrame.scale.copy(restPivotScale);
    originalParent.add(restFrame);

    const geometry = owned(new this.THREE.SphereGeometry(
      config.colliderRadius,
      METRONOME_SETTINGS.sphereSegments,
      METRONOME_SETTINGS.sphereRings,
    ));
    const material = owned(new this.THREE.MeshBasicMaterial({
      color: config.colliderColor,
      transparent: true,
      opacity: showDebug ? METRONOME_SETTINGS.debug.colliderOpacity : 0,
      depthTest: !showDebug,
      depthWrite: false,
      wireframe: showDebug,
    }));
    const collider = new this.THREE.Mesh(geometry, material);
    collider.name = `HIT_metronome_${config.parameter}`;
    collider.position.copy(colliderOffset);
    collider.renderOrder = METRONOME_SETTINGS.renderOrder;
    Object.assign(collider.userData, {
      isHitTarget: true,
      isBodyGripTarget: false,
      isMetronomeTarget: true,
      metronomeControl: config.parameter,
      interactionRole: METRONOME_INTERACTION_ROLES[config.parameter],
      baseHitOpacity: showDebug ? METRONOME_SETTINGS.debug.colliderOpacity : 0,
    });
    pivotGroup.add(collider);

    const control = {
      config,
      handle,
      collider,
      pivotGroup,
      restFrame,
      axis,
      rootAxis,
      colliderOffset,
      radialOffset,
      neutralDirection: radialOffset.clone().normalize(),
      radius,
      originalParent,
      originalChildIndex,
      importedPosition,
      importedQuaternion,
      importedScale,
      restPivotPosition,
      restPivotQuaternion,
      restPivotScale,
      minAngle: this.THREE.MathUtils.degToRad(config.minAngleDegrees),
      maxAngle: this.THREE.MathUtils.degToRad(config.maxAngleDegrees),
      referenceAngle: this.THREE.MathUtils.degToRad(config.referenceAngleDegrees || 0),
      angle: 0,
      value: null,
    };
    if (showDebug) this.createDebugGeometry(control);
    this.controls.set(config.parameter, control);
    this.targets[METRONOME_INTERACTION_ROLES[config.parameter]] = collider;
    this.disposables.add(geometry);
    this.disposables.add(material);
  }

  setValue(parameter, value) {
    const control = this.controls.get(parameter);
    if (!control) return value;
    const [minimum, maximum] = getValueRange(parameter);
    const angle = mapValueToAngle(value, minimum, maximum, control.minAngle, control.maxAngle);
    control.value = mapAngleToValue(angle, control.minAngle, control.maxAngle, minimum, maximum);
    this.applyAngle(control, angle);
    return control.value;
  }

  applyAngle(control, angle) {
    control.angle = clamp(angle, control.minAngle, control.maxAngle);
    const delta = new this.THREE.Quaternion().setFromAxisAngle(
      control.axis,
      control.angle + control.referenceAngle,
    );
    control.pivotGroup.position.copy(control.restPivotPosition);
    control.pivotGroup.quaternion.copy(control.restPivotQuaternion).multiply(delta);
    control.pivotGroup.scale.copy(control.restPivotScale);
    control.pivotGroup.updateMatrixWorld(true);
  }

  beginDrag(parameter, rayOrigin, rayDirection) {
    const control = this.controls.get(parameter);
    if (!control) return null;
    const pointerAngle = this.getPointerAngle(control, rayOrigin, rayDirection);
    return {
      control,
      startAngle: control.angle,
      previousPointerAngle: pointerAngle,
      accumulatedDelta: 0,
      lastValidAngle: control.angle,
    };
  }

  updateDrag(drag, rayOrigin, rayDirection) {
    if (!drag?.control) return null;
    const pointerAngle = this.getPointerAngle(drag.control, rayOrigin, rayDirection);
    if (pointerAngle !== null) {
      if (drag.previousPointerAngle !== null) {
        let delta = unwrapAngleDelta(pointerAngle, drag.previousPointerAngle);
        if (drag.control.config.invertDrag) delta *= -1;
        // Reject pathological one-frame jumps but preserve the last valid state.
        if (Math.abs(delta) < Math.PI * 0.75) drag.accumulatedDelta += delta;
      }
      drag.previousPointerAngle = pointerAngle;
    }
    const nextAngle = clamp(
      drag.startAngle + drag.accumulatedDelta,
      drag.control.minAngle,
      drag.control.maxAngle,
    );
    drag.lastValidAngle = nextAngle;
    const [minimum, maximum] = getValueRange(drag.control.config.parameter);
    const value = mapAngleToValue(
      nextAngle,
      drag.control.minAngle,
      drag.control.maxAngle,
      minimum,
      maximum,
    );
    drag.control.value = value;
    this.applyAngle(drag.control, nextAngle);
    return { parameter: drag.control.config.parameter, value, angle: nextAngle };
  }

  getPointerAngle(control, rayOrigin, rayDirection) {
    const { point: planePoint, normal } = this.getDragPlane(control);
    const denominator = rayDirection.dot(normal);
    if (Math.abs(denominator) < RAY_EPSILON) return null;
    const distance = planePoint.clone().sub(rayOrigin).dot(normal) / denominator;
    if (!Number.isFinite(distance)) return null;
    const intersection = rayOrigin.clone().addScaledVector(rayDirection, distance);
    const local = control.restFrame.worldToLocal(intersection.clone());
    const projected = projectOntoPlane(local, control.axis);
    if (!projected || vectorLength(projected) < 1e-6) return null;
    return signedAngleOnPlane(control.neutralDirection, projected, control.axis);
  }

  getDragPlane(control) {
    control.restFrame.updateMatrixWorld(true);
    return {
      point: control.restFrame.localToWorld(new this.THREE.Vector3()),
      normal: control.axis.clone().transformDirection(control.restFrame.matrixWorld).normalize(),
    };
  }

  createDebugGeometry(control) {
    const settings = METRONOME_SETTINGS.debug;
    const group = control.restFrame;
    group.userData.isMetronomeDebug = true;
    const arcConfig = {
      center: { x: 0, y: 0, z: 0 },
      axis: vectorObject(control.axis),
      colliderOffset: vectorObject(control.colliderOffset),
      minAngleDegrees: control.config.minAngleDegrees,
      maxAngleDegrees: control.config.maxAngleDegrees,
      referenceAngleDegrees: control.config.referenceAngleDegrees || 0,
    };

    const pivot = new this.THREE.Mesh(
      owned(new this.THREE.SphereGeometry(settings.pivotRadius, 12, 8)),
      owned(new this.THREE.MeshBasicMaterial({ color: control.config.pivotColor, depthTest: false })),
    );
    group.add(pivot);
    this.disposables.add(pivot.geometry);
    this.disposables.add(pivot.material);

    const axisExtent = control.axis.clone().multiplyScalar(control.radius);
    group.add(line(
      this.THREE,
      [axisExtent.clone().multiplyScalar(-1), axisExtent],
      control.config.pivotColor,
      settings.arcOpacity,
      this.disposables,
      false,
    ));

    const circlePoints = toThreePoints(this.THREE, generateArcPoints(arcConfig, {
      startAngleDegrees: -180 - arcConfig.referenceAngleDegrees,
      endAngleDegrees: 180 - arcConfig.referenceAngleDegrees,
      segments: settings.circleSegments,
    }));
    group.add(line(this.THREE, circlePoints, control.config.planeColor, settings.ringOpacity, this.disposables, true));

    const arc = toThreePoints(this.THREE, generateArcPoints(arcConfig, {
      segments: settings.circleSegments,
    }));
    group.add(line(this.THREE, arc, control.config.arcColor, settings.arcOpacity, this.disposables, false));

    const plane = new this.THREE.Mesh(
      owned(new this.THREE.CircleGeometry(control.radius * settings.planeSizeMultiplier, settings.circleSegments)),
      owned(new this.THREE.MeshBasicMaterial({
        color: control.config.planeColor,
        transparent: true,
        opacity: settings.planeOpacity,
        side: this.THREE.DoubleSide,
        depthWrite: false,
      })),
    );
    plane.quaternion.setFromUnitVectors(new this.THREE.Vector3(0, 0, 1), control.axis);
    plane.userData.isMetronomeDebug = true;
    group.add(plane);
    this.disposables.add(plane.geometry);
    this.disposables.add(plane.material);

    if (settings.radialLimits) {
      for (const angle of [control.minAngle, control.maxAngle]) {
        const rotated = rotateOffsetAroundAxis(
          arcConfig.colliderOffset,
          arcConfig.axis,
          angle + control.referenceAngle,
        );
        const endpoint = vector(this.THREE, rotated);
        group.add(line(
          this.THREE,
          [new this.THREE.Vector3(), endpoint],
          control.config.arcColor,
          settings.arcOpacity,
          this.disposables,
          false,
        ));
      }
    }
    group.traverse((object) => {
      object.userData.isMetronomeDebug = true;
      object.raycast = () => {};
    });
  }

  dispose() {
    for (const control of this.controls.values()) {
      control.collider.removeFromParent();
      control.originalParent.add(control.handle);
      control.handle.position.copy(control.importedPosition);
      control.handle.quaternion.copy(control.importedQuaternion);
      control.handle.scale.copy(control.importedScale);
      restoreChildIndex(control.originalParent, control.handle, control.originalChildIndex);
      control.pivotGroup.removeFromParent();
      control.restFrame.removeFromParent();
      delete this.targets[METRONOME_INTERACTION_ROLES[control.config.parameter]];
    }
    for (const disposable of this.disposables) disposable.dispose?.();
    this.disposables.clear();
    this.originalChildIndices.clear();
    this.controls.clear();
  }
}

export function resolveHandleAxisInRootSpace({
  THREE,
  root,
  handle,
  localAxis,
  restQuaternion = handle?.quaternion,
} = {}) {
  root?.updateMatrixWorld?.(true);
  handle?.parent?.updateMatrixWorld?.(true);
  const parentWorldQuaternion = handle.parent.getWorldQuaternion(new THREE.Quaternion());
  const rootWorldQuaternion = root.getWorldQuaternion(new THREE.Quaternion());
  return localAxis
    .clone()
    .applyQuaternion(restQuaternion)
    .applyQuaternion(parentWorldQuaternion)
    .applyQuaternion(rootWorldQuaternion.invert())
    .normalize();
}

function getValueRange(parameter) {
  return parameter === "bpm"
    ? [METRONOME_SETTINGS.minBpm, METRONOME_SETTINGS.maxBpm]
    : [METRONOME_SETTINGS.minVolume, METRONOME_SETTINGS.maxVolume];
}

function vector(THREE, value) {
  return new THREE.Vector3(value.x, value.y, value.z);
}

function owned(resource) {
  resource.userData ||= {};
  resource.userData.disposeWithOwner = true;
  return resource;
}

function restoreChildIndex(parent, child, index) {
  const currentIndex = parent.children.indexOf(child);
  if (currentIndex < 0 || currentIndex === index) return;
  parent.children.splice(currentIndex, 1);
  parent.children.splice(Math.min(index, parent.children.length), 0, child);
}

function line(THREE, points, color, opacity, disposables, loop) {
  const geometry = owned(new THREE.BufferGeometry().setFromPoints(points));
  const material = owned(new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthTest: false }));
  const result = loop ? new THREE.LineLoop(geometry, material) : new THREE.Line(geometry, material);
  result.userData.isMetronomeDebug = true;
  result.renderOrder = METRONOME_SETTINGS.renderOrder - 1;
  disposables.add(geometry);
  disposables.add(material);
  return result;
}

function vectorObject(value) {
  return { x: value.x, y: value.y, z: value.z };
}

function toThreePoints(THREE, points) {
  return points.map((point) => vector(THREE, point));
}
