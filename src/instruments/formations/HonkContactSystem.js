import { ContactSweep } from "./contactCandidates.js";
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
    broadPhase = measurePair === measureSphereOverlap,
  } = {}) {
    this.broadPhase = broadPhase;
    this.graph = graph;
    this.instrumentRegistry = instrumentRegistry;
    this.getHonks = getHonks;
    this.getColliderSphere = getColliderSphere;
    this.measurePair = measurePair;
    this.settings = { ...HONK_CONTACT_SETTINGS, ...settings };
    this.pairStates = new Map();
    this.candidates = [];
    this.spheres = [];
    this.spherePool = [];
    this.activeIds = new Set();
    this.indices = new Map();
    this.observedPairs = new Set();
    this.removedIds = [];
    this.sweep = new ContactSweep();
    this.observe = (i, j) => {
      const first = this.candidates[i],
        second = this.candidates[j];
      const key = canonicalPairKey(first.id, second.id);
      if (this.observedPairs.has(key)) return;
      this.observedPairs.add(key);
      this.measurements++;
      this.updatePair(key, first, second, this.spheres[i], this.spheres[j]);
    };
  }

  update(honks = null) {
    const { candidates, spheres, spherePool, activeIds, indices, observedPairs, removedIds } = this;
    candidates.length = 0;
    spheres.length = 0;
    activeIds.clear();
    indices.clear();
    observedPairs.clear();
    removedIds.length = 0;
    const source =
      honks ||
      this.getHonks?.() ||
      this.instrumentRegistry?.getByKind?.(INSTRUMENT_KINDS.honk) ||
      [];
    for (const honk of source) {
      if (!isContactCandidate(honk)) continue;
      indices.set(honk.id, candidates.length);
      candidates.push(honk);
      activeIds.add(honk.id);
      this.graph.addHonk(honk.id);
    }
    for (const honkId of this.graph.adjacency.keys())
      if (!activeIds.has(honkId)) removedIds.push(honkId);
    for (const honkId of removedIds) this.removeHonk(honkId);

    // Some resolvers reuse one mutable sphere. Copy its numeric values into an
    // independent pooled slot before calling the next resolver.
    for (let i = 0; i < candidates.length; i++) {
      const sphere = this.getColliderSphere(candidates[i]);
      const snapshot = (spherePool[i] ||= { radius: 0, center: [0, 0, 0] });
      if (!sphere || !readPoint(sphere.center, snapshot.center)) {
        spheres.push(null);
        continue;
      }
      snapshot.radius = sphere.radius;
      spheres.push(snapshot);
    }
    this.measurements = 0;
    if (this.broadPhase) this.sweep.forEach(spheres, this.observe);
    else
      for (let i = 0; i < candidates.length; i++)
        for (let j = i + 1; j < candidates.length; j++) this.observe(i, j);
    // Existing/pending contacts must see separation frames even after leaving
    // the sweep. Deleting a current Map entry does not invalidate its iterator.
    for (const state of this.pairStates.values()) {
      const i = indices.get(state.firstId),
        j = indices.get(state.secondId);
      if (i !== undefined && j !== undefined) this.observe(i, j);
    }
    return this.graph;
  }

  updatePair(
    pairKey,
    first,
    second,
    firstSphere = this.getColliderSphere(first),
    secondSphere = this.getColliderSphere(second),
  ) {
    const measurement = normalizeMeasurement(
      this.measurePair(first, second, firstSphere, secondSphere),
    );
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
      const qualifies =
        measurement.touching && measurement.overlapRatio >= this.settings.entryOverlapRatio;
      state.contactFrames = qualifies ? state.contactFrames + 1 : 0;
      state.separationFrames = 0;
      if (state.contactFrames >= Math.max(this.settings.consecutiveEntryFrames, 1)) {
        state.touching = true;
        state.contactFrames = 0;
        this.graph.setContact(first.id, second.id, true);
      }
    } else {
      const remainsInContact =
        measurement.touching && measurement.overlapRatio >= this.settings.exitOverlapRatio;
      state.separationFrames = remainsInContact ? 0 : state.separationFrames + 1;
      state.contactFrames = 0;
      if (state.separationFrames >= Math.max(this.settings.consecutiveExitFrames, 1)) {
        state.touching = false;
        state.separationFrames = 0;
        this.graph.setContact(first.id, second.id, false);
      }
    }
    if (state.touching || state.contactFrames) this.pairStates.set(pairKey, state);
    else this.pairStates.delete(pairKey);
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
    this.candidates.length = 0;
    this.spheres.length = 0;
    this.spherePool.length = 0;
    this.activeIds.clear();
    this.indices.clear();
    this.observedPairs.clear();
    this.removedIds.length = 0;
    this.sweep.clear();
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
    return {
      touching: measurement > 0,
      overlapRatio: Math.max(measurement, 0),
    };
  }
  return {
    touching: Boolean(measurement?.touching),
    overlapRatio: Number.isFinite(measurement?.overlapRatio) ? measurement.overlapRatio : 0,
  };
}

function readPoint(point, target = [0, 0, 0]) {
  if (Array.isArray(point) || ArrayBuffer.isView(point)) {
    if (point.length < 3) return null;
    target[0] = point[0];
    target[1] = point[1];
    target[2] = point[2];
    return target;
  }
  if (typeof point?.toArray === "function") {
    const values = point.toArray(target);
    if (values !== target) {
      target[0] = values[0];
      target[1] = values[1];
      target[2] = values[2];
    }
    return target;
  }
  if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y) || !Number.isFinite(point?.z))
    return null;
  target[0] = point.x;
  target[1] = point.y;
  target[2] = point.z;
  return target;
}

function isContactCandidate(honk) {
  return Boolean(
    honk?.id && honk.kind === INSTRUMENT_KINDS.honk && !honk.disposed && honk.visible !== false,
  );
}
