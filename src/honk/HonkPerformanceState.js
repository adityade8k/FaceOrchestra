import * as THREE from "three";
import { ACTION_FIELDS, createActionState, resetActionState } from "../looper/LooperTimeline.js";

const MORPH_ACTION_FIELDS = ["earLeft", "earRight", "nose", "vowel"];

export function createLiveHonkState(values = {}) {
  return {
    squeeze: THREE.MathUtils.clamp(values.squeeze ?? 0, 0, 1),
    bend: THREE.MathUtils.clamp(values.bend ?? 0, -1, 1),
    earLeft: THREE.MathUtils.clamp(values.earLeft ?? 0, -1, 1),
    earRight: THREE.MathUtils.clamp(values.earRight ?? 0, -1, 1),
    nose: THREE.MathUtils.clamp(values.nose ?? 0, 0, 1),
    vowel: values.vowel || "neutral",
  };
}

function copyDefinedAction(target, source) {
  resetActionState(target);
  if (!source) {
    return target;
  }
  for (const field of ACTION_FIELDS) {
    if (source[field] !== undefined) {
      target[field] = source[field];
    }
  }
  return target;
}

function layerHasAnyAction(layer) {
  for (const field of ACTION_FIELDS) {
    if (layer.action[field] !== undefined) {
      return true;
    }
  }
  return false;
}

export class HonkPerformanceState {
  constructor(initialState = {}) {
    this.live = createLiveHonkState(initialState);
    this.resolved = createLiveHonkState(initialState);
    this.automationLayers = new Map();
    this.sequence = 0;
  }

  setLiveState(values = {}) {
    if (values.squeeze !== undefined) {
      this.live.squeeze = THREE.MathUtils.clamp(values.squeeze, 0, 1);
    }
    if (values.bend !== undefined) {
      this.live.bend = THREE.MathUtils.clamp(values.bend, -1, 1);
    }
    if (values.earLeft !== undefined) {
      this.live.earLeft = THREE.MathUtils.clamp(values.earLeft, -1, 1);
    }
    if (values.earRight !== undefined) {
      this.live.earRight = THREE.MathUtils.clamp(values.earRight, -1, 1);
    }
    if (values.nose !== undefined) {
      this.live.nose = THREE.MathUtils.clamp(values.nose, 0, 1);
    }
    if (values.vowel !== undefined) {
      this.live.vowel = values.vowel || "neutral";
    }
  }

  setAutomationLayer(layerId, actionState) {
    if (!layerId) {
      return null;
    }

    let layer = this.automationLayers.get(layerId);
    if (!layer) {
      layer = {
        id: layerId,
        action: createActionState(),
        updatedAt: 0,
      };
      this.automationLayers.set(layerId, layer);
    }

    copyDefinedAction(layer.action, actionState);
    layer.updatedAt = ++this.sequence;
    if (!layerHasAnyAction(layer)) {
      this.automationLayers.delete(layerId);
      return null;
    }
    return layer;
  }

  clearAutomationLayer(layerId) {
    if (!layerId) {
      return;
    }
    this.automationLayers.delete(layerId);
  }

  clearAutomationLayers(predicate = null) {
    for (const [layerId, layer] of [...this.automationLayers.entries()]) {
      if (!predicate || predicate(layer)) {
        this.automationLayers.delete(layerId);
      }
    }
  }

  hasAutomation() {
    return this.automationLayers.size > 0;
  }

  resolve() {
    const resolved = this.resolved;
    resolved.squeeze = THREE.MathUtils.clamp(this.live.squeeze, 0, 1);
    resolved.bend = THREE.MathUtils.clamp(this.live.bend, -1, 1);
    resolved.earLeft = this.live.earLeft;
    resolved.earRight = this.live.earRight;
    resolved.nose = this.live.nose;
    resolved.vowel = this.live.vowel || "neutral";

    const bestMorphLayers = {
      earLeft: null,
      earRight: null,
      nose: null,
      vowel: null,
    };

    for (const layer of this.automationLayers.values()) {
      const action = layer.action;
      if (action.squeeze !== undefined) {
        resolved.squeeze = Math.max(resolved.squeeze, THREE.MathUtils.clamp(action.squeeze, 0, 1));
      }
      if (action.bend !== undefined) {
        resolved.bend += THREE.MathUtils.clamp(action.bend, -1, 1);
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

    resolved.bend = THREE.MathUtils.clamp(resolved.bend, -1, 1);

    if (bestMorphLayers.earLeft) {
      resolved.earLeft = THREE.MathUtils.clamp(bestMorphLayers.earLeft.action.earLeft, -1, 1);
    }
    if (bestMorphLayers.earRight) {
      resolved.earRight = THREE.MathUtils.clamp(bestMorphLayers.earRight.action.earRight, -1, 1);
    }
    if (bestMorphLayers.nose) {
      resolved.nose = THREE.MathUtils.clamp(bestMorphLayers.nose.action.nose, 0, 1);
    }
    if (bestMorphLayers.vowel) {
      resolved.vowel = bestMorphLayers.vowel.action.vowel || "neutral";
    }

    return resolved;
  }
}
