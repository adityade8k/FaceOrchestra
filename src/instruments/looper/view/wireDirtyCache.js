const PATH_SETTING_KEYS = Object.freeze([
  "minimumLength",
  "endpointLeadRatio",
  "maxEndpointLead",
  "sagRatio",
  "angleSagRatio",
  "minSag",
  "maxSag",
  "minSplineSpans",
  "maxSplineSpans",
  "distancePerSplineSpan",
  "anglePerSplineSpanDegrees",
  "minTubularSegments",
  "maxTubularSegments",
  "tubularSegmentsPerMeter",
  "tubularSegmentsPerSpan",
  "radius",
  "radialSegments",
]);

export const WIRE_PERFORMANCE_COUNTERS = {
  dirtyChecks: 0,
  steadyStateSkips: 0,
  pathPlans: 0,
  geometryBuilds: 0,
  geometryDisposals: 0,
};
let wirePerformanceCountersEnabled = false;

export function resetWirePerformanceCounters({ enabled = true } = {}) {
  wirePerformanceCountersEnabled = enabled;
  for (const key of Object.keys(WIRE_PERFORMANCE_COUNTERS)) {
    WIRE_PERFORMANCE_COUNTERS[key] = 0;
  }
}

/**
 * Runs the allocation-heavy planner and geometry factory only after a cheap,
 * reusable endpoint/settings comparison reports a meaningful change.
 */
export function updateWireGeometryIfDirty({
  wireMesh,
  start,
  end,
  startTangent,
  endTangent,
  settings,
  fallbackSettings,
  planner,
  geometryFactory,
  createCachedVector,
} = {}) {
  return updateWireGeometryIfDirtyValues(
    wireMesh,
    start,
    end,
    startTangent,
    endTangent,
    settings,
    fallbackSettings,
    planner,
    geometryFactory,
    createCachedVector,
  );
}

export function updateWireGeometryIfDirtyValues(
  wireMesh,
  start,
  end,
  startTangent,
  endTangent,
  settings,
  fallbackSettings,
  planner,
  geometryFactory,
  createCachedVector,
) {
  if (!wireMesh || typeof planner !== "function" || typeof geometryFactory !== "function") {
    return false;
  }

  if (wirePerformanceCountersEnabled) WIRE_PERFORMANCE_COUNTERS.dirtyChecks += 1;
  const data = wireMesh.userData || (wireMesh.userData = {});
  const positionEpsilon = readSetting(settings, fallbackSettings, "positionEpsilon", 0.00035);
  const directionEpsilon = readSetting(settings, fallbackSettings, "directionEpsilon", 0.002);
  const positionEpsilonSquared = positionEpsilon * positionEpsilon;
  const directionEpsilonSquared = directionEpsilon * directionEpsilon;
  if (matchesCachedWireState(
    data,
    start,
    end,
    startTangent,
    endTangent,
    settings,
    fallbackSettings,
    positionEpsilonSquared,
    directionEpsilonSquared,
  )) {
    if (wirePerformanceCountersEnabled) WIRE_PERFORMANCE_COUNTERS.steadyStateSkips += 1;
    return false;
  }

  if (wirePerformanceCountersEnabled) WIRE_PERFORMANCE_COUNTERS.pathPlans += 1;
  const plan = planner(start, end, {
    startTangent,
    endTangent,
    settings,
  });
  cacheWireState(
    data,
    start,
    end,
    startTangent,
    endTangent,
    settings,
    fallbackSettings,
    createCachedVector,
  );
  data.wirePathPlan = plan;

  if (plan.spanCount === 0) {
    wireMesh.visible = false;
    return false;
  }

  const geometry = geometryFactory(plan, settings, fallbackSettings);
  if (!geometry) return false;
  if (wirePerformanceCountersEnabled) WIRE_PERFORMANCE_COUNTERS.geometryBuilds += 1;
  if (wireMesh.geometry) {
    wireMesh.geometry.dispose?.();
    if (wirePerformanceCountersEnabled) WIRE_PERFORMANCE_COUNTERS.geometryDisposals += 1;
  }
  wireMesh.geometry = geometry;
  wireMesh.visible = true;
  return true;
}

function matchesCachedWireState(
  data,
  start,
  end,
  startTangent,
  endTangent,
  settings,
  fallbackSettings,
  positionEpsilonSquared,
  directionEpsilonSquared,
) {
  return Boolean(
    data.lastWireStart &&
    data.lastWireEnd &&
    data.lastWireStartTangent &&
    data.lastWireEndTangent &&
    distanceSquared(data.lastWireStart, start) <= positionEpsilonSquared &&
    distanceSquared(data.lastWireEnd, end) <= positionEpsilonSquared &&
    distanceSquared(data.lastWireStartTangent, startTangent) <= directionEpsilonSquared &&
    distanceSquared(data.lastWireEndTangent, endTangent) <= directionEpsilonSquared &&
    settingsMatch(data.lastWireSettings, settings, fallbackSettings)
  );
}

function cacheWireState(
  data,
  start,
  end,
  startTangent,
  endTangent,
  settings,
  fallbackSettings,
  createCachedVector,
) {
  data.lastWireStart = copyCachedVector(data.lastWireStart, start, createCachedVector);
  data.lastWireEnd = copyCachedVector(data.lastWireEnd, end, createCachedVector);
  data.lastWireStartTangent = copyCachedVector(
    data.lastWireStartTangent,
    startTangent,
    createCachedVector,
  );
  data.lastWireEndTangent = copyCachedVector(
    data.lastWireEndTangent,
    endTangent,
    createCachedVector,
  );
  const cachedSettings = data.lastWireSettings || (data.lastWireSettings = {});
  cachedSettings.positionEpsilon = readSetting(
    settings,
    fallbackSettings,
    "positionEpsilon",
    0.00035,
  );
  cachedSettings.directionEpsilon = readSetting(
    settings,
    fallbackSettings,
    "directionEpsilon",
    0.002,
  );
  for (const key of PATH_SETTING_KEYS) {
    cachedSettings[key] = readSetting(settings, fallbackSettings, key, undefined);
  }
}

function settingsMatch(cachedSettings, settings, fallbackSettings) {
  if (!cachedSettings) return false;
  if (cachedSettings.positionEpsilon !== readSetting(
    settings,
    fallbackSettings,
    "positionEpsilon",
    0.00035,
  )) return false;
  if (cachedSettings.directionEpsilon !== readSetting(
    settings,
    fallbackSettings,
    "directionEpsilon",
    0.002,
  )) return false;
  for (const key of PATH_SETTING_KEYS) {
    if (cachedSettings[key] !== readSetting(settings, fallbackSettings, key, undefined)) {
      return false;
    }
  }
  return true;
}

export function readSetting(settings, fallbackSettings, key, defaultValue) {
  const configured = settings?.[key];
  if (configured !== undefined) return configured;
  const fallback = fallbackSettings?.[key];
  return fallback !== undefined ? fallback : defaultValue;
}

function copyCachedVector(target, value, createCachedVector) {
  const vector = target || createCachedVector?.() || { x: 0, y: 0, z: 0 };
  if (typeof vector.set === "function") {
    vector.set(
      finiteCoordinate(value?.x),
      finiteCoordinate(value?.y),
      finiteCoordinate(value?.z),
    );
  } else {
    vector.x = finiteCoordinate(value?.x);
    vector.y = finiteCoordinate(value?.y);
    vector.z = finiteCoordinate(value?.z);
  }
  return vector;
}

function distanceSquared(first, second) {
  const x = finiteCoordinate(first?.x) - finiteCoordinate(second?.x);
  const y = finiteCoordinate(first?.y) - finiteCoordinate(second?.y);
  const z = finiteCoordinate(first?.z) - finiteCoordinate(second?.z);
  return x * x + y * y + z * z;
}

function finiteCoordinate(value) {
  return Number.isFinite(value) ? value : 0;
}
