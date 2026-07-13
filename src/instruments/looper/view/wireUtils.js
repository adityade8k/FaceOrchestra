import * as THREE from "three";
import { LOOPER_WIRE_SETTINGS } from "../../../config/looper.js";
import { createWirePathPlan } from "./wirePath.js";

export function createWireMaterial(color, textures = {}) {
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.92,
    metalness: 0.01,
    normalMap: textures.normalMap || null,
    roughnessMap: textures.roughnessMap || null,
  });
  material.userData.disposeOnInstrumentDelete = true;
  return material;
}

export function updateWireMeshGeometry(
  wireMesh,
  start,
  end,
  {
    startTangent = null,
    endTangent = null,
    settings = LOOPER_WIRE_SETTINGS,
  } = {},
) {
  if (!wireMesh) {
    return false;
  }

  const resolvedSettings = { ...LOOPER_WIRE_SETTINGS, ...(settings || {}) };
  const plan = createWirePathPlan(start, end, {
    startTangent,
    endTangent,
    settings: resolvedSettings,
  });
  const positionEpsilonSquared = Math.pow(resolvedSettings.positionEpsilon || 0.00035, 2);
  const directionEpsilonSquared = Math.pow(resolvedSettings.directionEpsilon || 0.002, 2);
  const unchanged = hasMatchingWireCache(
    wireMesh,
    start,
    end,
    plan.startTangent,
    plan.endTangent,
    positionEpsilonSquared,
    directionEpsilonSquared,
  );

  if (plan.spanCount === 0) {
    wireMesh.visible = false;
    cacheWireState(wireMesh, start, end, plan);
    return false;
  }

  if (unchanged && wireMesh.visible) {
    return false;
  }

  const curve = createWireCurveFromPlan(plan);
  const geometry = new THREE.TubeGeometry(
    curve,
    plan.tubularSegments,
    resolvedSettings.radius,
    resolvedSettings.radialSegments,
    false,
  );
  geometry.userData.disposeOnInstrumentDelete = true;
  geometry.userData.wireSpanCount = plan.spanCount;
  wireMesh.geometry?.dispose?.();
  wireMesh.geometry = geometry;
  wireMesh.visible = true;
  cacheWireState(wireMesh, start, end, plan);
  return true;
}

export function createWireCurve(start, end, options = {}) {
  return createWireCurveFromPlan(createWirePathPlan(start, end, options));
}

function createWireCurveFromPlan(plan) {
  const curve = new THREE.CurvePath();
  for (const segment of plan.segments) {
    curve.add(new THREE.CubicBezierCurve3(
      toVector3(segment.start),
      toVector3(segment.control1),
      toVector3(segment.control2),
      toVector3(segment.end),
    ));
  }
  curve.userData = { wirePathPlan: plan };
  return curve;
}

function hasMatchingWireCache(
  wireMesh,
  start,
  end,
  startTangent,
  endTangent,
  positionEpsilonSquared,
  directionEpsilonSquared,
) {
  const data = wireMesh.userData;
  return Boolean(
    data.lastWireStart &&
    data.lastWireEnd &&
    data.lastWireStartTangent &&
    data.lastWireEndTangent &&
    data.lastWireStart.distanceToSquared(start) <= positionEpsilonSquared &&
    data.lastWireEnd.distanceToSquared(end) <= positionEpsilonSquared &&
    data.lastWireStartTangent.distanceToSquared(startTangent) <= directionEpsilonSquared &&
    data.lastWireEndTangent.distanceToSquared(endTangent) <= directionEpsilonSquared
  );
}

function cacheWireState(wireMesh, start, end, plan) {
  const data = wireMesh.userData;
  data.lastWireStart = copyCachedVector(data.lastWireStart, start);
  data.lastWireEnd = copyCachedVector(data.lastWireEnd, end);
  data.lastWireStartTangent = copyCachedVector(
    data.lastWireStartTangent,
    plan.startTangent,
  );
  data.lastWireEndTangent = copyCachedVector(data.lastWireEndTangent, plan.endTangent);
  data.wirePathPlan = plan;
}

function copyCachedVector(target, value) {
  const vector = target || new THREE.Vector3();
  vector.set(value?.x || 0, value?.y || 0, value?.z || 0);
  return vector;
}

function toVector3(point) {
  return new THREE.Vector3(point.x, point.y, point.z);
}

export function disposeWireMesh(wireMesh) {
  if (!wireMesh) {
    return;
  }

  wireMesh.removeFromParent();
  wireMesh.geometry?.dispose?.();
  const materials = Array.isArray(wireMesh.material) ? wireMesh.material : [wireMesh.material];
  for (const material of materials) {
    material?.dispose?.();
  }
}
