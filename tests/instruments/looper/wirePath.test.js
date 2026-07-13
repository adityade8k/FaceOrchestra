import test from "node:test";
import assert from "node:assert/strict";

import {
  createWirePathPlan,
  selectWireTubularSegments,
} from "../../../src/instruments/looper/view/wirePath.js";

const TEST_SETTINGS = Object.freeze({
  minSplineSpans: 1,
  maxSplineSpans: 5,
  distancePerSplineSpan: 0.5,
  anglePerSplineSpanDegrees: 30,
  minTubularSegments: 8,
  maxTubularSegments: 64,
  tubularSegmentsPerMeter: 12,
  tubularSegmentsPerSpan: 4,
  endpointLeadRatio: 0.25,
  maxEndpointLead: 0.5,
  minSag: 0.04,
  maxSag: 0.3,
  sagRatio: 0.12,
  angleSagRatio: 0.04,
});

const HORIZONTAL_START = Object.freeze({ x: 0, y: 1, z: 0 });
const HORIZONTAL_END = Object.freeze({ x: 1, y: 1, z: 0 });
const FORWARD = Object.freeze({ x: 1, y: 0, z: 0 });

function createPlan(start, end, overrides = {}) {
  return createWirePathPlan(start, end, {
    startTangent: FORWARD,
    endTangent: FORWARD,
    settings: TEST_SETTINGS,
    ...overrides,
  });
}

function assertFinitePoint(point, message = "point") {
  assert.equal(typeof point, "object", `${message} should be an object`);
  for (const axis of ["x", "y", "z"]) {
    assert.equal(
      Number.isFinite(point[axis]),
      true,
      `${message}.${axis} should be finite`,
    );
  }
}

function assertPointApproximatelyEqual(actual, expected, message) {
  for (const axis of ["x", "y", "z"]) {
    assert.equal(
      Math.abs(actual[axis] - expected[axis]) < 1e-12,
      true,
      `${message}.${axis}`,
    );
  }
}

function subtract(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function assertFinitePlan(plan) {
  assert.equal(Number.isFinite(plan.distance), true);
  assert.equal(Number.isFinite(plan.spanCount), true);
  assert.equal(Number.isFinite(plan.sag), true);
  assert.equal(Number.isFinite(plan.tubularSegments), true);
  assertFinitePoint(plan.startTangent, "start tangent");
  assertFinitePoint(plan.endTangent, "end tangent");

  for (const [index, segment] of plan.segments.entries()) {
    assertFinitePoint(segment.start, `segment ${index} start`);
    assertFinitePoint(segment.control1, `segment ${index} control 1`);
    assertFinitePoint(segment.control2, `segment ${index} control 2`);
    assertFinitePoint(segment.end, `segment ${index} end`);
  }
}

test("wire path preserves exact endpoints and joins adjacent spline spans", () => {
  const start = { x: -0.35, y: 1.15, z: 0.2 };
  const end = { x: 1.4, y: 0.8, z: -0.6 };
  const plan = createPlan(start, end);

  assert.equal(plan.segments.length, plan.spanCount);
  assert.deepEqual(plan.segments[0].start, start);
  assert.deepEqual(plan.segments.at(-1).end, end);

  for (let index = 1; index < plan.segments.length; index += 1) {
    const previous = plan.segments[index - 1];
    const current = plan.segments[index];
    assert.deepEqual(previous.end, current.start);
    assertPointApproximatelyEqual(
      subtract(previous.end, previous.control2),
      subtract(current.control1, current.start),
      `span ${index} tangent continuity`,
    );
  }
});

test("wire path uses more spline spans as endpoint distance increases", () => {
  const near = createPlan(HORIZONTAL_START, { x: 0.2, y: 1, z: 0 });
  const far = createPlan(HORIZONTAL_START, { x: 2.2, y: 1, z: 0 });

  assert.equal(near.spanCount >= TEST_SETTINGS.minSplineSpans, true);
  assert.equal(far.spanCount <= TEST_SETTINGS.maxSplineSpans, true);
  assert.equal(far.spanCount > near.spanCount, true);
  assert.equal(far.segments.length, far.spanCount);
});

test("wire path allocates more spline spans for a sharper socket angle", () => {
  const distanceOnlySettings = {
    ...TEST_SETTINGS,
    distancePerSplineSpan: 10,
  };
  const aligned = createWirePathPlan(HORIZONTAL_START, HORIZONTAL_END, {
    startTangent: FORWARD,
    endTangent: FORWARD,
    settings: distanceOnlySettings,
  });
  const sharplyBent = createWirePathPlan(HORIZONTAL_START, HORIZONTAL_END, {
    startTangent: { x: 0, y: 0, z: 1 },
    endTangent: { x: 0, y: 0, z: -1 },
    settings: distanceOnlySettings,
  });

  assert.equal(sharplyBent.spanCount > aligned.spanCount, true);
  assert.equal(sharplyBent.spanCount <= TEST_SETTINGS.maxSplineSpans, true);
});

test("horizontal wires sag downward instead of arching upward", () => {
  const plan = createPlan(HORIZONTAL_START, { x: 2, y: 1, z: 0 });
  const pathPoints = plan.segments.flatMap((segment) => [
    segment.start,
    segment.control1,
    segment.control2,
    segment.end,
  ]);

  assert.equal(plan.sag > 0, true);
  assert.equal(Math.min(...pathPoints.map(({ y }) => y)) < HORIZONTAL_START.y, true);
});

test("degenerate and extreme wire orientations always produce finite plans", () => {
  const cases = [
    {
      name: "coincident",
      start: { x: 0.25, y: 0.75, z: -0.5 },
      end: { x: 0.25, y: 0.75, z: -0.5 },
      startTangent: { x: 0, y: 0, z: 0 },
      endTangent: { x: 0, y: 0, z: 0 },
    },
    {
      name: "vertical",
      start: { x: 0, y: -1, z: 0 },
      end: { x: 0, y: 2, z: 0 },
      startTangent: { x: 0, y: 1, z: 0 },
      endTangent: { x: 0, y: 1, z: 0 },
    },
    {
      name: "antiparallel tangents",
      start: HORIZONTAL_START,
      end: HORIZONTAL_END,
      startTangent: { x: -1, y: 0, z: 0 },
      endTangent: { x: -1, y: 0, z: 0 },
    },
  ];

  for (const entry of cases) {
    const plan = createWirePathPlan(entry.start, entry.end, {
      startTangent: entry.startTangent,
      endTangent: entry.endTangent,
      settings: TEST_SETTINGS,
    });
    assert.doesNotThrow(() => assertFinitePlan(plan), entry.name);

    if (entry.name === "coincident") {
      assert.equal(plan.spanCount, 0);
      assert.deepEqual(plan.segments, []);
    }
  }
});

test("wire path plans do not share mutable points with inputs or later plans", () => {
  const start = { x: 0, y: 1, z: 0 };
  const end = { x: 1, y: 1, z: 0 };
  const first = createPlan(start, end);
  const second = createPlan(start, end);

  assert.notStrictEqual(first, second);
  assert.notStrictEqual(first.segments, second.segments);
  assert.notStrictEqual(first.segments[0], second.segments[0]);
  assert.notStrictEqual(first.segments[0].start, second.segments[0].start);
  assert.notStrictEqual(first.startTangent, second.startTangent);

  first.segments[0].start.x = 99;
  first.startTangent.x = 99;

  assert.equal(second.segments[0].start.x, start.x);
  assert.equal(second.startTangent.x, FORWARD.x);
  assert.equal(start.x, 0);
});

test("tube subdivisions are integer, bounded, and monotonic with path complexity", () => {
  const byDistance = [0, 0.25, 1, 2, 20].map((distance) => (
    selectWireTubularSegments(distance, 1, TEST_SETTINGS)
  ));
  const bySpanCount = [0, 1, 2, 4, 20].map((spanCount) => (
    selectWireTubularSegments(1, spanCount, TEST_SETTINGS)
  ));

  for (const count of [...byDistance, ...bySpanCount]) {
    assert.equal(Number.isInteger(count), true);
    assert.equal(count >= TEST_SETTINGS.minTubularSegments, true);
    assert.equal(count <= TEST_SETTINGS.maxTubularSegments, true);
  }

  for (const counts of [byDistance, bySpanCount]) {
    for (let index = 1; index < counts.length; index += 1) {
      assert.equal(counts[index] >= counts[index - 1], true);
    }
  }

  assert.equal(byDistance.at(-1), TEST_SETTINGS.maxTubularSegments);
  assert.equal(bySpanCount.at(-1), TEST_SETTINGS.maxTubularSegments);

  const plan = createPlan(HORIZONTAL_START, { x: 2, y: 1, z: 0 });
  assert.equal(
    plan.tubularSegments,
    selectWireTubularSegments(plan.distance, plan.spanCount, TEST_SETTINGS),
  );
});
