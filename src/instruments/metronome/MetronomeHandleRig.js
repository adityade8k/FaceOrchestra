import {
  METRONOME_HANDLE_CONTROLS,
  METRONOME_SETTINGS,
} from "../../config/metronome.js";
import { METRONOME_INTERACTION_ROLES } from "./MetronomeInstrument.js";
import {
  clamp,
  mapAngleToValue,
  mapValueToAngle,
  projectOntoPlane,
  signedAngleOnPlane,
  unwrapAngleDelta,
  vectorLength,
} from "./metronomeArcMath.js";

const PLANE_TOLERANCE = 1e-4;
const RAY_EPSILON = 1e-5;

export class MetronomeHandleRig {
  constructor({ THREE, root, configs = METRONOME_HANDLE_CONTROLS, showDebug = true } = {}) {
    this.THREE = THREE;
    this.root = root;
    this.controls = new Map();
    this.targets = {};
    this.disposables = new Set();
    for (const config of configs) this.createControl(config, showDebug);
  }

  createControl(config, showDebug) {
    const handle = this.root.getObjectByName(config.nodeName);
    if (!handle) {
      console.warn(`Metronome handle node "${config.nodeName}" was not found; ${config.parameter} control disabled.`);
      return;
    }
    const axis = vector(this.THREE, config.axis);
    if (axis.lengthSq() < 1e-12) {
      console.warn(`Metronome handle "${config.nodeName}" has a zero-length rotation axis; control disabled.`);
      return;
    }
    axis.normalize();
    const rawOffset = vector(this.THREE, config.colliderOffset);
    const normalDistance = rawOffset.dot(axis);
    const projectedOffset = rawOffset.clone().addScaledVector(axis, -normalDistance);
    const radius = projectedOffset.length();
    if (radius < 1e-6) {
      console.warn(`Metronome handle "${config.nodeName}" collider offset produces a zero arc radius; control disabled.`);
      return;
    }
    if (Math.abs(normalDistance) > Math.max(radius * 0.01, PLANE_TOLERANCE)) {
      console.warn(`Metronome handle "${config.nodeName}" collider offset is outside its movement plane; projecting it onto the plane.`);
    }

    const restFrame = new this.THREE.Group();
    restFrame.name = `METRONOME_${config.parameter}_rest_frame`;
    restFrame.position.copy(handle.position);
    restFrame.quaternion.copy(handle.quaternion);
    restFrame.scale.copy(handle.scale);
    handle.parent.add(restFrame);

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
    collider.position.copy(projectedOffset);
    collider.renderOrder = METRONOME_SETTINGS.renderOrder;
    Object.assign(collider.userData, {
      isHitTarget: true,
      isBodyGripTarget: false,
      isMetronomeTarget: true,
      metronomeControl: config.parameter,
      interactionRole: METRONOME_INTERACTION_ROLES[config.parameter],
      baseHitOpacity: showDebug ? METRONOME_SETTINGS.debug.colliderOpacity : 0,
    });
    handle.add(collider);

    const control = {
      config,
      handle,
      collider,
      restFrame,
      axis,
      neutralDirection: projectedOffset.clone().normalize(),
      radius,
      restPosition: handle.position.clone(),
      restQuaternion: handle.quaternion.clone(),
      restScale: handle.scale.clone(),
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
    control.handle.position.copy(control.restPosition);
    control.handle.quaternion.copy(control.restQuaternion).multiply(delta);
    control.handle.scale.copy(control.restScale);
    control.collider.position.copy(control.neutralDirection).multiplyScalar(control.radius);
    control.handle.updateMatrixWorld(true);
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
    control.restFrame.updateMatrixWorld(true);
    const pivot = control.restFrame.getWorldPosition(new this.THREE.Vector3());
    const normal = control.axis.clone().transformDirection(control.restFrame.matrixWorld).normalize();
    const denominator = rayDirection.dot(normal);
    if (Math.abs(denominator) < RAY_EPSILON) return null;
    const distance = pivot.clone().sub(rayOrigin).dot(normal) / denominator;
    if (!Number.isFinite(distance)) return null;
    const intersection = rayOrigin.clone().addScaledVector(rayDirection, distance);
    const local = control.restFrame.worldToLocal(intersection.clone());
    const projected = projectOntoPlane(local, control.axis);
    if (!projected || vectorLength(projected) < 1e-6) return null;
    return signedAngleOnPlane(control.neutralDirection, projected, control.axis);
  }

  createDebugGeometry(control) {
    const settings = METRONOME_SETTINGS.debug;
    const group = control.restFrame;
    group.userData.isMetronomeDebug = true;
    const basis = createPlaneBasis(this.THREE, control.axis, control.neutralDirection);

    const pivot = new this.THREE.Mesh(
      owned(new this.THREE.SphereGeometry(settings.pivotRadius, 12, 8)),
      owned(new this.THREE.MeshBasicMaterial({ color: control.config.pivotColor, depthTest: false })),
    );
    group.add(pivot);

    const circlePoints = arcPoints(this.THREE, basis, control.radius, 0, Math.PI * 2, settings.circleSegments);
    group.add(line(this.THREE, circlePoints, control.config.planeColor, settings.ringOpacity, this.disposables, true));

    const arc = arcPoints(
      this.THREE, basis, control.radius,
      control.minAngle, control.maxAngle, settings.circleSegments,
    );
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
        const endpoint = rotateAroundAxis(this.THREE, control.neutralDirection, control.axis, angle)
          .multiplyScalar(control.radius);
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
      control.restFrame.removeFromParent();
    }
    for (const disposable of this.disposables) disposable.dispose?.();
    this.disposables.clear();
    this.controls.clear();
  }
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

function createPlaneBasis(THREE, axis, neutral) {
  return { axis, first: neutral, second: new THREE.Vector3().crossVectors(axis, neutral).normalize() };
}

function arcPoints(THREE, basis, radius, start, end, segments) {
  const points = [];
  for (let index = 0; index <= segments; index += 1) {
    const angle = start + (end - start) * (index / segments);
    points.push(
      basis.first.clone().multiplyScalar(Math.cos(angle) * radius)
        .addScaledVector(basis.second, Math.sin(angle) * radius),
    );
  }
  return points;
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

function rotateAroundAxis(THREE, vectorValue, axis, angle) {
  return vectorValue.clone().applyAxisAngle(axis, angle);
}
