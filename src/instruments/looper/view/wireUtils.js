import * as THREE from "three";
import { LOOPER_WIRE_SETTINGS } from "../../../config/looper.js";
import { createWirePathPlan } from "./wirePath.js";
import {
  WIRE_PERFORMANCE_COUNTERS,
  readSetting,
  resetWirePerformanceCounters,
  updateWireGeometryIfDirtyValues,
} from "./wireDirtyCache.js";

function createCachedWireVector() {
  return new THREE.Vector3();
}

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
    planner = createWirePathPlan,
    geometryFactory = createTubeGeometryFromPlan,
  } = {},
) {
  return updateWireGeometryIfDirtyValues(
    wireMesh,
    start,
    end,
    startTangent,
    endTangent,
    settings,
    LOOPER_WIRE_SETTINGS,
    planner,
    geometryFactory,
    createCachedWireVector,
  );
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

function createTubeGeometryFromPlan(plan, settings, fallbackSettings) {
  const curve = createWireCurveFromPlan(plan);
  const geometry = new THREE.TubeGeometry(
    curve,
    plan.tubularSegments,
    readSetting(settings, fallbackSettings, "radius", 0.004),
    readSetting(settings, fallbackSettings, "radialSegments", 8),
    false,
  );
  geometry.userData.disposeOnInstrumentDelete = true;
  geometry.userData.wireSpanCount = plan.spanCount;
  return geometry;
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

export { WIRE_PERFORMANCE_COUNTERS, resetWirePerformanceCounters };
