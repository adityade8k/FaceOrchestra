import { HONK_CONTACT_SETTINGS } from "../../config/formations.js";
import { INSTRUMENT_KINDS } from "../core/capabilities.js";
import { canonicalPairKey, HonkContactGraph } from "./HonkContactGraph.js";

export class HonkContactSystem {
  constructor({
    graph = new HonkContactGraph(),
    instrumentRegistry = null,
    getHonks = null,
    getColliderSphere = defaultColliderSphereResolver,
    measurePair = measureSphereOverlap,
    settings = {},
  } = {}) {
    this.graph = graph;
    this.instrumentRegistry = instrumentRegistry;
    this.getHonks = getHonks;
    this.getColliderSphere = getColliderSphere;
    this.measurePair = measurePair;
    this.settings = { ...HONK_CONTACT_SETTINGS, ...settings };
    this.pairStates = new Map();
  }

  update(honks = null) {
    const candidates = [...(honks || this.getHonks?.() || this.instrumentRegistry?.getByKind?.(INSTRUMENT_KINDS.honk) || [])]
      .filter(isContactCandidate);
    const activeIds = new Set(candidates.map((honk) => honk.id));

    for (const honk of candidates) {
      this.graph.addHonk(honk.id);
    }
    for (const honkId of [...this.graph.adjacency.keys()]) {
      if (!activeIds.has(honkId)) {
        this.removeHonk(honkId);
      }
    }

    const observedPairs = new Set();
    for (let firstIndex = 0; firstIndex < candidates.length; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < candidates.length; secondIndex += 1) {
        const first = candidates[firstIndex];
        const second = candidates[secondIndex];
        const pairKey = canonicalPairKey(first.id, second.id);
        observedPairs.add(pairKey);
        this.updatePair(pairKey, first, second);
      }
    }

    for (const [pairKey, state] of this.pairStates) {
      if (!observedPairs.has(pairKey)) {
        this.graph.setContact(state.firstId, state.secondId, false);
        this.pairStates.delete(pairKey);
      }
    }
    return this.graph;
  }

  updatePair(pairKey, first, second) {
    const firstSphere = this.getColliderSphere(first);
    const secondSphere = this.getColliderSphere(second);
    const measurement = normalizeMeasurement(this.measurePair(first, second, firstSphere, secondSphere));
    const state = this.pairStates.get(pairKey) || {
      firstId: first.id,
      secondId: second.id,
      touching: this.graph.hasContact(first.id, second.id),
      contactFrames: 0,
      separationFrames: 0,
      overlapRatio: 0,
    };
    state.overlapRatio = measurement.overlapRatio;

    if (!state.touching) {
      const qualifies = measurement.touching && measurement.overlapRatio >= this.settings.entryOverlapRatio;
      state.contactFrames = qualifies ? state.contactFrames + 1 : 0;
      state.separationFrames = 0;
      if (state.contactFrames >= Math.max(this.settings.consecutiveEntryFrames, 1)) {
        state.touching = true;
        state.contactFrames = 0;
        this.graph.setContact(first.id, second.id, true);
      }
    } else {
      const remainsInContact = measurement.touching && measurement.overlapRatio >= this.settings.exitOverlapRatio;
      state.separationFrames = remainsInContact ? 0 : state.separationFrames + 1;
      state.contactFrames = 0;
      if (state.separationFrames >= Math.max(this.settings.consecutiveExitFrames, 1)) {
        state.touching = false;
        state.separationFrames = 0;
        this.graph.setContact(first.id, second.id, false);
      }
    }
    this.pairStates.set(pairKey, state);
    return state;
  }

  removeHonk(honkId) {
    this.graph.removeHonk(honkId);
    for (const [pairKey, state] of this.pairStates) {
      if (state.firstId === honkId || state.secondId === honkId) {
        this.pairStates.delete(pairKey);
      }
    }
  }

  reset() {
    this.pairStates.clear();
    this.graph.clear();
  }
}

export function measureSphereOverlap(_first, _second, firstSphere, secondSphere) {
  if (!firstSphere || !secondSphere) {
    return { touching: false, overlapRatio: 0 };
  }
  const firstRadius = Number(firstSphere.radius);
  const secondRadius = Number(secondSphere.radius);
  if (!(firstRadius > 0) || !(secondRadius > 0)) {
    return { touching: false, overlapRatio: 0 };
  }
  const firstCenter = readPoint(firstSphere.center);
  const secondCenter = readPoint(secondSphere.center);
  if (!firstCenter || !secondCenter) {
    return { touching: false, overlapRatio: 0 };
  }
  const distance = Math.hypot(
    firstCenter[0] - secondCenter[0],
    firstCenter[1] - secondCenter[1],
    firstCenter[2] - secondCenter[2],
  );
  const overlapDepth = firstRadius + secondRadius - distance;
  const overlapRatio = overlapDepth / Math.max(Math.min(firstRadius, secondRadius) * 2, 0.0001);
  return {
    touching: overlapDepth > 0,
    overlapRatio: Math.max(overlapRatio, 0),
    distance,
    overlapDepth,
  };
}

function defaultColliderSphereResolver(honk) {
  return honk?.getSqueezeColliderSphere?.() || honk?.squeezeColliderSphere || null;
}

function normalizeMeasurement(measurement) {
  if (typeof measurement === "boolean") {
    return { touching: measurement, overlapRatio: measurement ? 1 : 0 };
  }
  if (typeof measurement === "number") {
    return { touching: measurement > 0, overlapRatio: Math.max(measurement, 0) };
  }
  return {
    touching: Boolean(measurement?.touching),
    overlapRatio: Number.isFinite(measurement?.overlapRatio) ? measurement.overlapRatio : 0,
  };
}

function readPoint(point) {
  if (Array.isArray(point) || ArrayBuffer.isView(point)) {
    return point.length >= 3 ? [point[0], point[1], point[2]] : null;
  }
  if (typeof point?.toArray === "function") {
    return point.toArray();
  }
  return [point?.x, point?.y, point?.z].every(Number.isFinite)
    ? [point.x, point.y, point.z]
    : null;
}

function isContactCandidate(honk) {
  return Boolean(honk?.id && honk.kind === INSTRUMENT_KINDS.honk && !honk.disposed && honk.visible !== false);
}
