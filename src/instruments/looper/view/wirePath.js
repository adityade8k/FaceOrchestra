import { LOOPER_WIRE_SETTINGS } from "../../../config/looper.js";

const EPSILON = 1e-8;
const WORLD_GRAVITY = { x: 0, y: -1, z: 0 };

export function createWirePathPlan(
  start,
  end,
  { startTangent = null, endTangent = null, settings = LOOPER_WIRE_SETTINGS } = {},
) {
  const resolvedSettings = { ...LOOPER_WIRE_SETTINGS, ...(settings || {}) };
  const startPoint = copyPoint(start);
  const endPoint = copyPoint(end);
  const delta = subtract(endPoint, startPoint);
  const distance = length(delta);
  const minimumLength = positiveNumber(resolvedSettings.minimumLength, 0.004);

  if (distance < minimumLength) {
    return {
      distance,
      spanCount: 0,
      sag: 0,
      maxDeflectionRadians: 0,
      startTangent: { x: 0, y: 0, z: 0 },
      endTangent: { x: 0, y: 0, z: 0 },
      tubularSegments: selectWireTubularSegments(0, 0, resolvedSettings),
      segments: [],
    };
  }

  const direct = normalize(delta);
  const resolvedStartTangent = normalize(startTangent, direct);
  const resolvedEndTangent = normalize(endTangent, direct);
  const startDeflection = angleBetween(resolvedStartTangent, direct);
  const endDeflection = angleBetween(resolvedEndTangent, direct);
  const maxDeflectionRadians = Math.max(startDeflection, endDeflection);
  const spanCount = selectSplineSpanCount(distance, maxDeflectionRadians, resolvedSettings);
  const angleRatio = maxDeflectionRadians / Math.PI;
  const endpointLead = Math.min(
    distance * positiveNumber(resolvedSettings.endpointLeadRatio, 0.22) * (1 + angleRatio * 0.35),
    positiveNumber(resolvedSettings.maxEndpointLead, 0.24),
    distance * 0.42,
  );

  const firstGuide = add(startPoint, scale(resolvedStartTangent, endpointLead));
  const secondGuide = subtract(endPoint, scale(resolvedEndTangent, endpointLead));
  const gravityPerpendicular = subtract(
    WORLD_GRAVITY,
    scale(direct, dot(WORLD_GRAVITY, direct)),
  );
  const gravityInfluence = length(gravityPerpendicular);
  const sagDirection = normalize(gravityPerpendicular, { x: 0, y: 0, z: 0 });
  const requestedSag = distance * (
    positiveNumber(resolvedSettings.sagRatio, 0.11) +
    angleRatio * positiveNumber(resolvedSettings.angleSagRatio, 0.025)
  );
  const sag = gravityInfluence > EPSILON
    ? Math.min(
      Math.max(requestedSag, positiveNumber(resolvedSettings.minSag, 0.012)),
      positiveNumber(resolvedSettings.maxSag, 0.24),
      distance * 0.35,
    ) * gravityInfluence
    : 0;

  const knots = [];
  for (let index = 0; index <= spanCount; index += 1) {
    const t = index / spanCount;
    const basePoint = cubicPoint(startPoint, firstGuide, secondGuide, endPoint, t);
    const sagOffset = sag * Math.sin(Math.PI * t);
    knots.push(add(basePoint, scale(sagDirection, sagOffset)));
  }
  knots[0] = copyPoint(startPoint);
  knots[knots.length - 1] = copyPoint(endPoint);

  const tangents = knots.map((point, index) => {
    if (index === 0) {
      return scale(resolvedStartTangent, endpointLead * 3);
    }
    if (index === knots.length - 1) {
      return scale(resolvedEndTangent, endpointLead * 3);
    }
    return scale(subtract(knots[index + 1], knots[index - 1]), 0.5);
  });

  const segments = [];
  for (let index = 0; index < spanCount; index += 1) {
    const segmentStart = knots[index];
    const segmentEnd = knots[index + 1];
    segments.push({
      start: copyPoint(segmentStart),
      control1: add(segmentStart, scale(tangents[index], 1 / 3)),
      control2: subtract(segmentEnd, scale(tangents[index + 1], 1 / 3)),
      end: copyPoint(segmentEnd),
    });
  }

  return {
    distance,
    spanCount,
    sag,
    maxDeflectionRadians,
    startTangent: copyPoint(resolvedStartTangent),
    endTangent: copyPoint(resolvedEndTangent),
    tubularSegments: selectWireTubularSegments(distance, spanCount, resolvedSettings),
    segments,
  };
}

export function selectWireTubularSegments(
  distance,
  spanCount,
  settings = LOOPER_WIRE_SETTINGS,
) {
  const resolvedSettings = { ...LOOPER_WIRE_SETTINGS, ...(settings || {}) };
  const minimum = Math.max(1, Math.round(
    positiveNumber(resolvedSettings.minTubularSegments, 20),
  ));
  const maximum = Math.max(minimum, Math.round(
    positiveNumber(resolvedSettings.maxTubularSegments, 64),
  ));
  const requested = Math.round(
    Math.max(finiteNumber(distance, 0), 0) *
      positiveNumber(resolvedSettings.tubularSegmentsPerMeter, 28) +
    Math.max(finiteNumber(spanCount, 0), 0) *
      positiveNumber(resolvedSettings.tubularSegmentsPerSpan, 5),
  );
  return clamp(requested, minimum, maximum);
}

function selectSplineSpanCount(distance, maxDeflectionRadians, settings) {
  const minimum = Math.max(1, Math.round(positiveNumber(settings.minSplineSpans, 2)));
  const maximum = Math.max(minimum, Math.round(positiveNumber(settings.maxSplineSpans, 5)));
  const distanceSpans = Math.max(1, Math.ceil(
    distance / positiveNumber(settings.distancePerSplineSpan, 0.5),
  ));
  const angleStepRadians = (
    positiveNumber(settings.anglePerSplineSpanDegrees, 70) * Math.PI
  ) / 180;
  const angleSpans = Math.floor(maxDeflectionRadians / angleStepRadians);
  return clamp(distanceSpans + angleSpans, minimum, maximum);
}

function cubicPoint(start, control1, control2, end, t) {
  const inverse = 1 - t;
  const startWeight = inverse * inverse * inverse;
  const control1Weight = 3 * inverse * inverse * t;
  const control2Weight = 3 * inverse * t * t;
  const endWeight = t * t * t;
  return {
    x:
      start.x * startWeight +
      control1.x * control1Weight +
      control2.x * control2Weight +
      end.x * endWeight,
    y:
      start.y * startWeight +
      control1.y * control1Weight +
      control2.y * control2Weight +
      end.y * endWeight,
    z:
      start.z * startWeight +
      control1.z * control1Weight +
      control2.z * control2Weight +
      end.z * endWeight,
  };
}

function copyPoint(point) {
  return {
    x: finiteNumber(point?.x, 0),
    y: finiteNumber(point?.y, 0),
    z: finiteNumber(point?.z, 0),
  };
}

function add(a, b) {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function subtract(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function scale(vector, amount) {
  return { x: vector.x * amount, y: vector.y * amount, z: vector.z * amount };
}

function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function length(vector) {
  return Math.sqrt(dot(vector, vector));
}

function normalize(vector, fallback = { x: 0, y: 0, z: 0 }) {
  const value = copyPoint(vector);
  const magnitude = length(value);
  if (magnitude <= EPSILON) {
    return copyPoint(fallback);
  }
  return scale(value, 1 / magnitude);
}

function angleBetween(a, b) {
  return Math.acos(clamp(dot(a, b), -1, 1));
}

function finiteNumber(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function positiveNumber(value, fallback) {
  const number = finiteNumber(value, fallback);
  return number > 0 ? number : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}
