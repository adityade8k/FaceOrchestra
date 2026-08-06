export const HONK_ACTION_FIELDS = Object.freeze([
  "squeeze",
  "bend",
  "earLeft",
  "earRight",
  "nose",
  "vowel",
]);

const MORPH_ACTION_FIELDS = Object.freeze(["earLeft", "earRight", "nose", "vowel"]);

export function createHonkActionState(values = null) {
  const state = {};
  for (const field of HONK_ACTION_FIELDS) {
    state[field] = values?.[field] !== undefined ? values[field] : undefined;
  }
  return state;
}

export function createLiveHonkState(values = {}) {
  return {
    squeeze: clamp(values.squeeze ?? 0, 0, 1),
    bend: clamp(values.bend ?? 0, -1, 1),
    earLeft: clamp(values.earLeft ?? 0, -1, 1),
    earRight: clamp(values.earRight ?? 0, -1, 1),
    nose: clamp(values.nose ?? 0, 0, 1),
    vowel: values.vowel || "neutral",
  };
}

export class HonkPerformanceState {
  constructor(initialState = {}) {
    this.liveBase = createLiveHonkState(initialState);
    this.live = createLiveHonkState(initialState);
    this.resolved = createLiveHonkState(initialState);
    this.squeezeSources = new Map();
    this.bendSources = new Map();
    this.automationLayers = new Map();
    this.audioMix = { gate: 0, sourceGain: 0 };
    this.bestMorphLayers = {
      earLeft: null,
      earRight: null,
      nose: null,
      vowel: null,
    };
    this.sequence = 0;
  }

  setLiveState(values = {}) {
    applyLiveValues(this.liveBase, values);
    this.refreshLiveInteractionState();
    return this.live;
  }

  setLiveGateAndBend(squeeze, bend) {
    this.liveBase.squeeze = clamp(squeeze, 0, 1);
    this.liveBase.bend = clamp(bend, -1, 1);
    this.refreshLiveInteractionState();
    return this.live;
  }

  beginSqueeze(sourceId, value = 1) {
    return this.updateSqueeze(sourceId, value);
  }

  updateSqueeze(sourceId, value) {
    if (!sourceId) {
      return this.live.squeeze;
    }
    this.squeezeSources.set(sourceId, clamp(value, 0, 1));
    this.refreshLiveInteractionState();
    return this.live.squeeze;
  }

  endSqueeze(sourceId) {
    this.squeezeSources.delete(sourceId);
    this.refreshLiveInteractionState();
    return this.live.squeeze;
  }

  setLiveBend(sourceId, value) {
    if (!sourceId) {
      return this.live.bend;
    }
    this.bendSources.set(sourceId, clamp(value, -1, 1));
    this.refreshLiveInteractionState();
    return this.live.bend;
  }

  clearLiveBend(sourceId) {
    this.bendSources.delete(sourceId);
    this.refreshLiveInteractionState();
    return this.live.bend;
  }

  clearLiveSource(sourceId) {
    this.squeezeSources.delete(sourceId);
    this.bendSources.delete(sourceId);
    this.refreshLiveInteractionState();
  }

  clearLiveInteractions() {
    this.squeezeSources.clear();
    this.bendSources.clear();
    this.liveBase.squeeze = 0;
    this.liveBase.bend = 0;
    this.refreshLiveInteractionState();
  }

  refreshLiveInteractionState() {
    copyLiveState(this.live, this.liveBase);
    for (const value of this.squeezeSources.values()) {
      this.live.squeeze = Math.max(this.live.squeeze, clamp(value, 0, 1));
    }
    for (const value of this.bendSources.values()) {
      this.live.bend += clamp(value, -1, 1);
    }
    this.live.bend = clamp(this.live.bend, -1, 1);
    return this.live;
  }

  setAutomationLayer(layerId, actionState, options = undefined) {
    if (!layerId) {
      return null;
    }

    if (!hasAnyDefinedAction(actionState)) {
      this.automationLayers.delete(layerId);
      return null;
    }

    const layer = this.automationLayers.get(layerId) || {
      id: layerId,
      action: createHonkActionState(),
      updatedAt: 0,
      gain: 1,
    };
    copyDefinedAction(layer.action, actionState);
    const gain = typeof options === "number"
      ? options
      : options?.gain ?? actionState?.gain ?? 1;
    layer.gain = clamp(gain, 0, 1);
    layer.updatedAt = ++this.sequence;
    this.automationLayers.set(layerId, layer);
    return layer;
  }

  clearAutomationLayer(layerId) {
    if (layerId) {
      this.automationLayers.delete(layerId);
    }
  }

  clearAutomationLayers(predicate = null) {
    for (const [layerId, layer] of this.automationLayers) {
      if (!predicate || predicate(layer)) {
        this.automationLayers.delete(layerId);
      }
    }
  }

  hasAutomation() {
    return this.automationLayers.size > 0;
  }

  hasAutomationLayer(layerId) {
    return this.automationLayers.has(layerId);
  }

  resolve() {
    const resolved = this.resolved;
    copyLiveState(resolved, this.live);

    const bestMorphLayers = this.bestMorphLayers;
    bestMorphLayers.earLeft = null;
    bestMorphLayers.earRight = null;
    bestMorphLayers.nose = null;
    bestMorphLayers.vowel = null;

    for (const layer of this.automationLayers.values()) {
      const action = layer.action;
      if (action.squeeze !== undefined) {
        resolved.squeeze = Math.max(resolved.squeeze, clamp(action.squeeze, 0, 1));
      }
      if (action.bend !== undefined) {
        resolved.bend += clamp(action.bend, -1, 1);
      }
      for (const field of MORPH_ACTION_FIELDS) {
        if (
          action[field] !== undefined &&
          (!bestMorphLayers[field] || layer.updatedAt > bestMorphLayers[field].updatedAt)
        ) {
          bestMorphLayers[field] = layer;
        }
      }
    }

    resolved.squeeze = clamp(resolved.squeeze, 0, 1);
    resolved.bend = clamp(resolved.bend, -1, 1);
    if (bestMorphLayers.earLeft) {
      resolved.earLeft = clamp(bestMorphLayers.earLeft.action.earLeft, -1, 1);
    }
    if (bestMorphLayers.earRight) {
      resolved.earRight = clamp(bestMorphLayers.earRight.action.earRight, -1, 1);
    }
    if (bestMorphLayers.nose) {
      resolved.nose = clamp(bestMorphLayers.nose.action.nose, 0, 1);
    }
    if (bestMorphLayers.vowel) {
      resolved.vowel = bestMorphLayers.vowel.action.vowel || "neutral";
    }
    return resolved;
  }

  getLiveSnapshot() {
    return { ...this.live };
  }

  getResolvedSnapshot() {
    return { ...this.resolve() };
  }

  resolveAudioMix() {
    const mix = this.audioMix;
    let effectiveGate = clamp(this.live.squeeze, 0, 1);
    for (const layer of this.automationLayers.values()) {
      if (layer.action.squeeze === undefined) continue;
      effectiveGate = Math.max(
        effectiveGate,
        clamp(layer.action.squeeze, 0, 1) * clamp(layer.gain, 0, 1),
      );
    }
    mix.gate = clamp(effectiveGate, 0, 1);
    mix.sourceGain = mix.gate;
    return mix;
  }

  reset(initialState = {}) {
    this.liveBase = createLiveHonkState(initialState);
    this.live = createLiveHonkState(initialState);
    this.resolved = createLiveHonkState(initialState);
    this.squeezeSources.clear();
    this.bendSources.clear();
    this.automationLayers.clear();
    this.audioMix.gate = 0;
    this.audioMix.sourceGain = 0;
    this.bestMorphLayers.earLeft = null;
    this.bestMorphLayers.earRight = null;
    this.bestMorphLayers.nose = null;
    this.bestMorphLayers.vowel = null;
    this.sequence = 0;
  }
}

function applyLiveValues(target, values) {
  if (values.squeeze !== undefined) target.squeeze = clamp(values.squeeze, 0, 1);
  if (values.bend !== undefined) target.bend = clamp(values.bend, -1, 1);
  if (values.earLeft !== undefined) target.earLeft = clamp(values.earLeft, -1, 1);
  if (values.earRight !== undefined) target.earRight = clamp(values.earRight, -1, 1);
  if (values.nose !== undefined) target.nose = clamp(values.nose, 0, 1);
  if (values.vowel !== undefined) target.vowel = values.vowel || "neutral";
}

function copyLiveState(target, source) {
  for (const field of HONK_ACTION_FIELDS) {
    target[field] = source[field];
  }
  return target;
}

function copyDefinedAction(target, source) {
  for (const field of HONK_ACTION_FIELDS) {
    target[field] = source?.[field] !== undefined ? source[field] : undefined;
  }
  return target;
}

function hasAnyDefinedAction(action) {
  if (!action) return false;
  for (const field of HONK_ACTION_FIELDS) {
    if (action[field] !== undefined) return true;
  }
  return false;
}

function clamp(value, min, max) {
  const number = Number.isFinite(value) ? value : 0;
  return Math.min(Math.max(number, min), max);
}
