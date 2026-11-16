import * as THREE from "three";
import { LOOPER_WIRE_SETTINGS } from "../../../config/looper.js";
import { createWirePathPlan } from "./wirePath.js";

const wireSettingKeys = Object.keys(LOOPER_WIRE_SETTINGS);
const point = new THREE.Vector3();
const normal = new THREE.Vector3();

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
  { startTangent = null, endTangent = null, settings = LOOPER_WIRE_SETTINGS } = {},
) {
  if (!wireMesh) {
    return false;
  }

  // Compare input snapshots before allocating a path. Settings are compared by
  // value because callers may mutate/reuse the same settings object.
  if (hasMatchingWireInputs(wireMesh, start, end, startTangent, endTangent, settings)) {
    wireMesh.visible = wireMesh.userData.wirePathPlan.spanCount > 0;
    return false;
  }
  const resolvedSettings = { ...LOOPER_WIRE_SETTINGS, ...(settings || {}) };
  const plan = createWirePathPlan(start, end, {
    startTangent,
    endTangent,
    settings: resolvedSettings,
  });
  cacheWireInputs(wireMesh, start, end, resolvedSettings);

  if (plan.spanCount === 0) {
    wireMesh.visible = false;
    cacheWireState(wireMesh, start, end, plan);
    return false;
  }

  const curve = createWireCurveFromPlan(plan);
  const previous = wireMesh.geometry;
  const sameTopology =
    previous?.type === "TubeGeometry" &&
    previous.parameters.tubularSegments === plan.tubularSegments &&
    previous.parameters.radialSegments === resolvedSettings.radialSegments;
  const geometry = sameTopology
    ? updateTubeGeometry(previous, curve, resolvedSettings.radius)
    : new THREE.TubeGeometry(
        curve,
        plan.tubularSegments,
        resolvedSettings.radius,
        resolvedSettings.radialSegments,
        false,
      );
  geometry.userData.disposeOnInstrumentDelete = true;
  geometry.userData.wireSpanCount = plan.spanCount;
  if (!sameTopology) previous?.dispose?.();
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
    curve.add(
      new THREE.CubicBezierCurve3(
        toVector3(segment.start),
        toVector3(segment.control1),
        toVector3(segment.control2),
        toVector3(segment.end),
      ),
    );
  }
  curve.userData = { wirePathPlan: plan };
  return curve;
}

function hasMatchingWireInputs(wireMesh, start, end, startTangent, endTangent, settings) {
  const cache = wireMesh.userData.wireInputs;
  if (!cache || !wireMesh.userData.wirePathPlan || cache.geometryId !== wireMesh.geometry?.uuid)
    return false;
  for (const key of wireSettingKeys) {
    const value =
      settings && Object.hasOwn(settings, key) ? settings[key] : LOOPER_WIRE_SETTINGS[key];
    if (!Object.is(cache.settings[key], value)) return false;
  }
  const positionEpsilon = cache.settings.positionEpsilon || 0.00035;
  const directionEpsilon = cache.settings.directionEpsilon || 0.002;
  const plan = wireMesh.userData.wirePathPlan;
  const length = Math.hypot(
    finite(end?.x) - finite(start?.x),
    finite(end?.y) - finite(start?.y),
    finite(end?.z) - finite(start?.z),
  );
  const minimumLength =
    Number.isFinite(cache.settings.minimumLength) && cache.settings.minimumLength > 0
      ? cache.settings.minimumLength
      : 0.004;
  if (length < minimumLength !== (plan.spanCount === 0)) return false;
  return (
    pointMatches(cache.start, start, positionEpsilon) &&
    pointMatches(cache.end, end, positionEpsilon) &&
    (plan.spanCount === 0 ||
      (tangentMatches(plan.startTangent, startTangent, start, end, directionEpsilon) &&
        tangentMatches(plan.endTangent, endTangent, start, end, directionEpsilon)))
  );
}

function cacheWireInputs(wireMesh, start, end, settings) {
  const cache = (wireMesh.userData.wireInputs ||= {});
  cache.start = copyCachedVector(cache.start, start);
  cache.end = copyCachedVector(cache.end, end);
  cache.settings = settings;
}

function pointMatches(cached, value, epsilon) {
  return (
    Math.hypot(
      cached.x - finite(value?.x),
      cached.y - finite(value?.y),
      cached.z - finite(value?.z),
    ) <= epsilon
  );
}

function tangentMatches(cached, value, start, end, epsilon) {
  let x = finite(value?.x),
    y = finite(value?.y),
    z = finite(value?.z);
  let length = Math.hypot(x, y, z);
  if (length <= 1e-8) {
    x = finite(end?.x) - finite(start?.x);
    y = finite(end?.y) - finite(start?.y);
    z = finite(end?.z) - finite(start?.z);
    length = Math.hypot(x, y, z);
  }
  return (
    length > 0 &&
    Math.hypot(cached.x - x / length, cached.y - y / length, cached.z - z / length) <= epsilon
  );
}

function finite(value) {
  return Number.isFinite(value) ? value : 0;
}

// Preserve GPU buffers while topology is unchanged. Capture records each wire's
// current path plan/radius, so retaining geometry identity does not freeze replay.
function updateTubeGeometry(geometry, curve, radius) {
  const { tubularSegments, radialSegments } = geometry.parameters;
  const frames = curve.computeFrenetFrames(tubularSegments, false);
  geometry.parameters.path = curve;
  geometry.parameters.radius = radius;
  geometry.tangents = frames.tangents;
  geometry.normals = frames.normals;
  geometry.binormals = frames.binormals;
  const positions = geometry.attributes.position;
  const normals = geometry.attributes.normal;
  let index = 0;
  for (let i = 0; i <= tubularSegments; i++) {
    curve.getPointAt(i / tubularSegments, point);
    const n = frames.normals[i],
      b = frames.binormals[i];
    for (let j = 0; j <= radialSegments; j++) {
      const angle = (j / radialSegments) * Math.PI * 2;
      const sin = Math.sin(angle),
        cos = -Math.cos(angle);
      normal.set(cos * n.x + sin * b.x, cos * n.y + sin * b.y, cos * n.z + sin * b.z).normalize();
      normals.setXYZ(index, normal.x, normal.y, normal.z);
      positions.setXYZ(
        index++,
        point.x + radius * normal.x,
        point.y + radius * normal.y,
        point.z + radius * normal.z,
      );
    }
  }
  positions.needsUpdate = true;
  normals.needsUpdate = true;
  // Bounds must reflect movement before the next culling or ray query.
  geometry.boundingBox = null;
  geometry.boundingSphere = null;
  return geometry;
}

function cacheWireState(wireMesh, start, end, plan) {
  const data = wireMesh.userData;
  data.lastWireStart = copyCachedVector(data.lastWireStart, start);
  data.lastWireEnd = copyCachedVector(data.lastWireEnd, end);
  data.lastWireStartTangent = copyCachedVector(data.lastWireStartTangent, plan.startTangent);
  data.lastWireEndTangent = copyCachedVector(data.lastWireEndTangent, plan.endTangent);
  data.wirePathPlan = plan;
  data.wireInputs.geometryId = wireMesh.geometry?.uuid;
}

function copyCachedVector(target, value) {
  const vector = target || new THREE.Vector3();
  vector.set(finite(value?.x), finite(value?.y), finite(value?.z));
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
