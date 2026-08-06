import test from "node:test";
import assert from "node:assert/strict";

import {
  WIRE_PERFORMANCE_COUNTERS,
  resetWirePerformanceCounters,
  updateWireGeometryIfDirty,
} from "../../../src/instruments/looper/view/wireDirtyCache.js";

test("unchanged stationary wires create no new plans or geometries", () => {
  resetWirePerformanceCounters();
  let plannerCalls = 0;
  let geometryCalls = 0;
  let disposalCalls = 0;
  const wireMesh = { userData: {}, geometry: null, visible: true };
  const start = point(0, 0, 0);
  const end = point(1, -0.2, 0.3);
  const startTangent = point(0, 0, 1);
  const endTangent = point(0, 0, -1);
  const options = {
    wireMesh,
    start,
    end,
    startTangent,
    endTangent,
    settings: { radius: 0.01, radialSegments: 8 },
    fallbackSettings: { positionEpsilon: 0.001, directionEpsilon: 0.001 },
    planner: () => {
      plannerCalls += 1;
      return { spanCount: 2 };
    },
    geometryFactory: () => {
      geometryCalls += 1;
      return { dispose() { disposalCalls += 1; } };
    },
  };

  assert.equal(updateWireGeometryIfDirty(options), true);
  const firstGeometry = wireMesh.geometry;
  for (let frame = 0; frame < 600; frame += 1) {
    assert.equal(updateWireGeometryIfDirty(options), false);
  }
  assert.equal(plannerCalls, 1);
  assert.equal(geometryCalls, 1);
  assert.equal(disposalCalls, 0);
  assert.strictEqual(wireMesh.geometry, firstGeometry);
  assert.deepEqual(WIRE_PERFORMANCE_COUNTERS, {
    dirtyChecks: 601,
    steadyStateSkips: 600,
    pathPlans: 1,
    geometryBuilds: 1,
    geometryDisposals: 0,
  });
});

test("endpoint and path-affecting setting changes rebuild once beyond epsilon", () => {
  let plans = 0;
  let geometries = 0;
  let disposals = 0;
  const settings = { radius: 0.01, radialSegments: 8 };
  const wireMesh = { userData: {}, geometry: null, visible: true };
  const options = {
    wireMesh,
    start: point(0, 0, 0),
    end: point(1, 0, 0),
    startTangent: point(1, 0, 0),
    endTangent: point(1, 0, 0),
    settings,
    fallbackSettings: { positionEpsilon: 0.001, directionEpsilon: 0.001 },
    planner: () => { plans += 1; return { spanCount: 1 }; },
    geometryFactory: () => ({ dispose() { disposals += 1; }, id: ++geometries }),
  };
  updateWireGeometryIfDirty(options);
  options.end.x += 0.0005;
  updateWireGeometryIfDirty(options);
  assert.equal(plans, 1);
  options.end.x += 0.002;
  updateWireGeometryIfDirty(options);
  assert.equal(plans, 2);
  settings.radius = 0.012;
  updateWireGeometryIfDirty(options);
  assert.equal(plans, 3);
  assert.equal(geometries, 3);
  assert.equal(disposals, 2);
});

function point(x, y, z) {
  return { x, y, z };
}
