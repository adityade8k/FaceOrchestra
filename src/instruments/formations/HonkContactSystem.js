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
    this.pairKeyCache = new Map();
    this.candidates = [];
    this.activeIds = new Set();
    this.removedIds = [];
    this.measurement = { touching: false, overlapRatio: 0, distance: 0, overlapDepth: 0 };
    this.normalizedMeasurement = { touching: false, overlapRatio: 0 };
    this.updateFrame = 0;
  }

  update(honks = null) {
    this.updateFrame += 1;
    const candidates = this.candidates;
    const activeIds = this.activeIds;
    candidates.length = 0;
    activeIds.clear();
    const source = honks || this.getHonks?.() ||
      this.instrumentRegistry?.getByKind?.(INSTRUMENT_KINDS.honk) || [];
    for (const honk of source) {
      if (!isContactCandidate(honk)) continue;
      candidates.push(honk);
      activeIds.add(honk.id);
    }

    for (const honk of candidates) {
      this.graph.addHonk(honk.id);
    }
    const removedIds = this.removedIds;
    removedIds.length = 0;
    for (const honkId of this.graph.adjacency.keys()) {
      if (!activeIds.has(honkId)) removedIds.push(honkId);
    }
    for (const honkId of removedIds) this.removeHonk(honkId);

    for (let firstIndex = 0; firstIndex < candidates.length; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < candidates.length; secondIndex += 1) {
        const first = candidates[firstIndex];
        const second = candidates[secondIndex];
        const pairKey = this.getCachedPairKey(first.id, second.id);
        this.updatePair(pairKey, first, second);
      }
    }

    for (const [pairKey, state] of this.pairStates) {
      if (state.observedFrame !== this.updateFrame) {
        this.graph.setContact(state.firstId, state.secondId, false);
        this.pairStates.delete(pairKey);
      }
    }
    return this.graph;
  }

  updatePair(pairKey, first, second) {
    const firstSphere = this.getColliderSphere(first);
    const secondSphere = this.getColliderSphere(second);
    const measured = this.measurePair(
      first,
      second,
      firstSphere,
      secondSphere,
      this.measurement,
    );
    const measurement = normalizeMeasurement(measured, this.normalizedMeasurement);
    const state = this.pairStates.get(pairKey) || {
      firstId: first.id,
      secondId: second.id,
      touching: this.graph.hasContact(first.id, second.id),
      contactFrames: 0,
      separationFrames: 0,
      overlapRatio: 0,
      observedFrame: 0,
    };
    state.observedFrame = this.updateFrame;
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

  getCachedPairKey(firstId, secondId) {
    const first = String(firstId) < String(secondId) ? firstId : secondId;
    const second = first === firstId ? secondId : firstId;
    let secondIds = this.pairKeyCache.get(first);
    if (!secondIds) {
      secondIds = new Map();
      this.pairKeyCache.set(first, secondIds);
    }
    let key = secondIds.get(second);
    if (!key) {
      key = canonicalPairKey(first, second);
      secondIds.set(second, key);
    }
    return key;
  }

  removeHonk(honkId) {
    this.graph.removeHonk(honkId);
    for (const [pairKey, state] of this.pairStates) {
      if (state.firstId === honkId || state.secondId === honkId) {
        this.pairStates.delete(pairKey);
      }
    }
    this.pairKeyCache.delete(honkId);
    for (const secondIds of this.pairKeyCache.values()) secondIds.delete(honkId);
  }

  reset() {
    this.pairStates.clear();
    this.pairKeyCache.clear();
    this.candidates.length = 0;
    this.activeIds.clear();
    this.removedIds.length = 0;
    this.graph.clear();
  }
}

export function measureSphereOverlap(_first, _second, firstSphere, secondSphere, output = {}) {
  if (!firstSphere || !secondSphere) {
    return setMeasurement(output, false, 0, Infinity, 0);
  }
  const firstRadius = Number(firstSphere.radius);
  const secondRadius = Number(secondSphere.radius);
  if (!(firstRadius > 0) || !(secondRadius > 0)) {
    return setMeasurement(output, false, 0, Infinity, 0);
  }
  const firstCenter = firstSphere.center;
  const secondCenter = secondSphere.center;
  const firstX = readCoordinate(firstCenter, 0, "x");
  const firstY = readCoordinate(firstCenter, 1, "y");
  const firstZ = readCoordinate(firstCenter, 2, "z");
  const secondX = readCoordinate(secondCenter, 0, "x");
  const secondY = readCoordinate(secondCenter, 1, "y");
  const secondZ = readCoordinate(secondCenter, 2, "z");
  if (
    !Number.isFinite(firstX) ||
    !Number.isFinite(firstY) ||
    !Number.isFinite(firstZ) ||
    !Number.isFinite(secondX) ||
    !Number.isFinite(secondY) ||
    !Number.isFinite(secondZ)
  ) {
    return setMeasurement(output, false, 0, Infinity, 0);
  }
  const distance = Math.hypot(
    firstX - secondX,
    firstY - secondY,
    firstZ - secondZ,
  );
  const overlapDepth = firstRadius + secondRadius - distance;
  const overlapRatio = overlapDepth / Math.max(Math.min(firstRadius, secondRadius) * 2, 0.0001);
  return setMeasurement(output, overlapDepth > 0, Math.max(overlapRatio, 0), distance, overlapDepth);
}

function defaultColliderSphereResolver(honk) {
  return honk?.getSqueezeColliderSphere?.() || honk?.squeezeColliderSphere || null;
}

function normalizeMeasurement(measurement, output = {}) {
  if (typeof measurement === "boolean") {
    output.touching = measurement;
    output.overlapRatio = measurement ? 1 : 0;
    return output;
  }
  if (typeof measurement === "number") {
    output.touching = measurement > 0;
    output.overlapRatio = Math.max(measurement, 0);
    return output;
  }
  output.touching = Boolean(measurement?.touching);
  output.overlapRatio = Number.isFinite(measurement?.overlapRatio)
    ? measurement.overlapRatio
    : 0;
  return output;
}

function readCoordinate(point, index, key) {
  if (Array.isArray(point) || ArrayBuffer.isView(point)) return point[index];
  return point?.[key];
}

function setMeasurement(output, touching, overlapRatio, distance, overlapDepth) {
  output.touching = touching;
  output.overlapRatio = overlapRatio;
  output.distance = distance;
  output.overlapDepth = overlapDepth;
  return output;
}

function isContactCandidate(honk) {
  return Boolean(honk?.id && honk.kind === INSTRUMENT_KINDS.honk && !honk.disposed && honk.visible !== false);
}
