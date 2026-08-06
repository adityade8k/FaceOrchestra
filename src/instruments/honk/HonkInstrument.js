import { HONK_MASTER_GAIN } from "../../config/audio.js";
import { INSTRUMENT_KINDS } from "../core/capabilities.js";
import { InstrumentEntity } from "../core/InstrumentEntity.js";
import { HonkPerformanceState } from "./HonkPerformanceState.js";
import { createHonkTuning } from "./HonkTuning.js";
import { MorphTargetController } from "./MorphTargetController.js";

export const HONK_INTERACTION_ROLES = Object.freeze({
  body: "honk.body",
  mouth: "honk.mouth",
  squeeze: "honk.squeeze",
  leftEar: "honk.ear.left",
  rightEar: "honk.ear.right",
  nose: "honk.nose",
  looperConnector: "honk.looper-connector",
});

const VOWELS = Object.freeze(["A", "E", "I", "O", "U"]);

export class HonkInstrument extends InstrumentEntity {
  constructor({
    id,
    root,
    interactionTargetRegistry = null,
    performanceState = null,
    morphController = null,
    voiceService = null,
    tuning = {},
    noteLabelView = null,
    targets = null,
    componentId = "honk",
    warnMissingExpectedMorphs = true,
    metadata = {},
  } = {}) {
    super({
      id,
      kind: INSTRUMENT_KINDS.honk,
      root,
      interactionTargetRegistry,
      metadata,
    });
    this.componentId = componentId;
    this.performance = performanceState || new HonkPerformanceState();
    this.morphs = morphController || new MorphTargetController(root, { warnMissingExpectedMorphs });
    this.voiceService = voiceService;
    this.tuning = createHonkTuning(tuning);
    this.noteLabelView = noteLabelView;
    this.activeVoiceIds = new Set();
    this.audioRendererId = `honk-${this.id}`;
    this.audioPerformanceState = createAudioPerformanceState();
    this.audioTuning = { ...this.tuning, pitchSnap: this.tuning.pitchSnap || null };
    this.audioRetriggerToken = 0;
    this.targetsByRole = new Map();
    this.lastResolvedPerformance = this.performance.getResolvedSnapshot();
    this.squeezeCollider = null;
    if (targets) {
      this.adoptHonkTargets(targets);
    }
  }

  initialize() {
    super.initialize();
    this.morphs.resetAll();
    this.applyTuning(this.tuning);
    this.resolvePerformance();
    this.noteLabelView?.attach?.(this);
    return this;
  }

  isPlayable() {
    return !this.disposed && this.visible;
  }

  registerHonkTarget(role, object3D, options = {}) {
    const target = this.registerInteractionTarget(role, object3D, options);
    this.targetsByRole.set(role, object3D);
    if (role === HONK_INTERACTION_ROLES.squeeze) {
      this.squeezeCollider = object3D;
    }
    return target;
  }

  registerHonkTargets(targets = {}, optionsByRole = {}) {
    for (const [role, object3D] of Object.entries(targets)) {
      if (object3D) {
        this.registerHonkTarget(role, object3D, optionsByRole[role] || {});
      }
    }
    return this;
  }

  adoptHonkTargets(targets = {}, optionsByRole = {}) {
    for (const [role, object3D] of Object.entries(targets)) {
      if (!object3D) continue;
      if (this.interactionTargetRegistry) {
        this.registerHonkTarget(role, object3D, optionsByRole[role] || {});
      } else {
        this.targetsByRole.set(role, object3D);
        if (role === HONK_INTERACTION_ROLES.squeeze) this.squeezeCollider = object3D;
      }
    }
    return this;
  }

  getTarget(role) {
    return this.targetsByRole.get(role) || null;
  }

  beginSqueeze(sourceId, value = 1) {
    this.performance.beginSqueeze(sourceId, value);
    return this.startVoice(sourceId);
  }

  updateSqueeze(sourceId, value) {
    this.performance.updateSqueeze(sourceId, value);
  }

  endSqueeze(sourceId) {
    this.performance.endSqueeze(sourceId);
    this.clearLiveBend(sourceId);
    this.releaseVoice(sourceId);
  }

  setLiveBend(sourceId, value) {
    this.performance.setLiveBend(sourceId, value);
  }

  clearLiveBend(sourceId) {
    this.performance.clearLiveBend(sourceId);
  }

  setLivePerformance(values) {
    return this.performance.setLiveState(values);
  }

  setLiveGateAndBend(squeeze, bend) {
    return this.performance.setLiveGateAndBend(squeeze, bend);
  }

  getLivePerformanceState() {
    return this.performance.getLiveSnapshot();
  }

  readLivePerformanceState() {
    return this.performance.live;
  }

  getResolvedPerformanceState() {
    return this.performance.getResolvedSnapshot();
  }

  resolvePerformanceState() {
    return this.performance.resolve();
  }

  clearLiveInteractions() {
    this.performance.clearLiveInteractions();
  }

  resetLivePerformance() {
    this.clearLiveInteractions();
    this.setLivePerformance({ squeeze: 0, bend: 0 });
  }

  setEar(side, value) {
    const field = side === "left" ? "earLeft" : "earRight";
    this.performance.setLiveState({ [field]: value });
    this.tuning = createHonkTuning({
      ...this.tuning,
      pitchControl: side === "left" ? value : this.tuning.pitchControl,
      octaveControl: side === "right" ? value : this.tuning.octaveControl,
      note: null,
    });
    copyTuning(this.audioTuning, this.tuning, this.pitchSnap);
    this.noteLabelView?.update?.(this);
  }

  setNose(value) {
    this.performance.setLiveState({ nose: value });
  }

  getEarAmount(side) {
    return this.morphs.getEarAmount(side);
  }

  getMorphValue(morphName) {
    return this.morphs.getValue(morphName);
  }

  setMorphValue(morphName, value) {
    return this.morphs.setMorph(morphName, value);
  }

  applyVowelMorph(vowel) {
    return this.morphs.setVowel(vowel && vowel !== "neutral" ? vowel : null);
  }

  applyMorphPerformanceState(snapshot) {
    this.morphs.applyPerformanceState(snapshot);
  }

  resetMorphs() {
    this.morphs.resetAll();
  }

  setVowel(vowel) {
    const normalized = VOWELS.includes(vowel) ? vowel : "neutral";
    this.performance.setLiveState({ vowel: normalized });
    return normalized;
  }

  cycleVowel() {
    const currentIndex = VOWELS.indexOf(this.performance.live.vowel);
    return this.setVowel(VOWELS[(currentIndex + 1) % VOWELS.length]);
  }

  setAutomationLayer(layerId, snapshot, options = {}) {
    return this.performance.setAutomationLayer(layerId, snapshot, options);
  }

  clearAutomationLayer(layerId) {
    this.performance.clearAutomationLayer(layerId);
  }

  applyTuning(tuning) {
    this.tuning = createHonkTuning(tuning);
    copyTuning(this.audioTuning, this.tuning, this.pitchSnap);
    this.performance.setLiveState({
      earLeft: this.tuning.pitchControl,
      earRight: this.tuning.octaveControl,
    });
    this.noteLabelView?.update?.(this);
    return this.tuning;
  }

  resolvePerformance({ applyMorphs = true } = {}) {
    const resolved = this.performance.resolve();
    this.lastResolvedPerformance = { ...resolved };
    if (applyMorphs) {
      this.morphs.applyPerformanceState(resolved);
      this.noteLabelView?.update?.(this, resolved);
    }
    return resolved;
  }

  updatePerformance() {
    const resolved = this.resolvePerformance();
    this.updateResolvedAudioRenderer(resolved);
    return resolved;
  }

  getVoiceId(sourceId = "main") {
    return `${this.id}:source-${sourceId}`;
  }

  startVoice(sourceId = "main") {
    const voiceId = this.getVoiceId(sourceId);
    return this.startAudioVoice(voiceId);
  }

  startAudioVoice(voiceId) {
    if (!voiceId || this.activeVoiceIds.has(voiceId)) return null;
    this.activeVoiceIds.add(voiceId);
    return this.ensureAudioRenderer();
  }

  releaseVoice(sourceId = "main") {
    const isFullVoiceId = typeof sourceId === "string" && (
      this.activeVoiceIds.has(sourceId) || sourceId.startsWith(`${this.id}:source-`)
    );
    const voiceId = isFullVoiceId
      ? sourceId
      : this.getVoiceId(sourceId);
    this.releaseAudioVoice(voiceId);
  }

  updateAudioVoice(voiceId, performanceState, options = HONK_MASTER_GAIN) {
    if (!voiceId || !this.activeVoiceIds.has(voiceId)) return;
    return this.updateAudioRenderer(performanceState, options);
  }

  ensureAudioRenderer() {
    return this.voiceService?.startVoice?.(this.audioRendererId, this.tuning, this);
  }

  updateResolvedAudioRenderer(
    performanceState = this.getResolvedPerformanceState(),
    options = HONK_MASTER_GAIN,
  ) {
    const gain = typeof options === "number" ? options : options?.gain ?? HONK_MASTER_GAIN;
    const audioMix = this.performance.resolveAudioMix();
    const audioState = this.audioPerformanceState;
    copyAudioPerformanceState(audioState, performanceState);
    audioState.squeeze = audioMix.gate;
    audioState.retriggerToken = this.audioRetriggerToken;
    return this.updateAudioRenderer(audioState, gain);
  }

  updateAudioRenderer(performanceState, options = HONK_MASTER_GAIN) {
    const gain = typeof options === "number" ? options : options?.gain ?? HONK_MASTER_GAIN;
    this.audioTuning.pitchSnap = this.pitchSnap || this.tuning.pitchSnap || null;
    return this.voiceService?.updateVoice?.(
      this.audioRendererId,
      performanceState,
      this.audioTuning,
      gain,
      this,
    );
  }

  requestAudioRetrigger() {
    if ((this.performance.live.squeeze || 0) > 0.025) return false;
    this.audioRetriggerToken += 1;
    return true;
  }

  releaseAudioVoice(voiceId, _options = {}) {
    if (!voiceId) return;
    this.activeVoiceIds.delete(voiceId);
  }

  releaseAllAudioVoices() {
    this.activeVoiceIds.clear();
    this.voiceService?.releaseVoice?.(this.audioRendererId);
  }

  setAudioVowel(vowel) {
    const normalized = vowel && vowel !== "neutral" ? vowel : "A";
    this.voiceService?.setVoiceVowel?.(this.audioRendererId, normalized);
  }

  getSqueezeColliderSphere() {
    if (!this.squeezeCollider) {
      return null;
    }
    if (typeof this.squeezeCollider.userData?.getWorldSphere === "function") {
      return this.squeezeCollider.userData.getWorldSphere();
    }
    return this.squeezeCollider.userData?.worldSphere || null;
  }

  serialize() {
    return {
      ...super.serialize(),
      componentId: this.componentId,
      tuning: { ...this.tuning },
      performanceDefaults: {
        earLeft: this.performance.liveBase.earLeft,
        earRight: this.performance.liveBase.earRight,
        nose: this.performance.liveBase.nose,
        vowel: this.performance.liveBase.vowel,
      },
    };
  }

  restore(serialized = {}) {
    this.restoreTransform(serialized.transform);
    this.applyTuning(serialized.tuning || this.tuning);
    this.setLivePerformance(serialized.performanceDefaults || {});
    if (serialized.performanceDefaults?.vowel !== undefined) {
      this.setVowel(serialized.performanceDefaults.vowel);
    }
    this.resolvePerformance();
    return this;
  }

  dispose() {
    if (this.disposed) {
      return;
    }
    this.releaseAllAudioVoices();
    this.voiceService?.disposeVoice?.(this.audioRendererId);
    this.performance.clearAutomationLayers();
    this.performance.clearLiveInteractions();
    this.noteLabelView?.dispose?.();
    disposeOwnedResources(this.root);
    this.squeezeCollider = null;
    this.targetsByRole.clear();
    super.dispose();
  }
}

function createAudioPerformanceState() {
  return {
    squeeze: 0,
    bend: 0,
    earLeft: 0,
    earRight: 0,
    nose: 0,
    vowel: "neutral",
    retriggerToken: 0,
  };
}

function copyAudioPerformanceState(target, source = {}) {
  target.squeeze = source.squeeze ?? 0;
  target.bend = source.bend ?? 0;
  target.earLeft = source.earLeft ?? 0;
  target.earRight = source.earRight ?? 0;
  target.nose = source.nose ?? 0;
  target.vowel = source.vowel ?? "neutral";
  target.retriggerToken = source.retriggerToken ?? target.retriggerToken ?? 0;
  return target;
}

function copyTuning(target, source, pitchSnapOverride = null) {
  for (const key of Object.keys(target)) {
    if (!(key in source) && key !== "pitchSnap") delete target[key];
  }
  for (const key of Object.keys(source)) target[key] = source[key];
  target.pitchSnap = pitchSnapOverride || source.pitchSnap || null;
  return target;
}

function disposeOwnedResources(root) {
  const disposedGeometries = new Set();
  const disposedMaterials = new Set();
  root?.traverse?.((object) => {
    const geometry = object.geometry;
    if (
      geometry &&
      (geometry.userData?.disposeWithOwner || geometry.userData?.disposeOnInstrumentDelete) &&
      !disposedGeometries.has(geometry)
    ) {
      geometry.dispose?.();
      disposedGeometries.add(geometry);
    }
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (
        material &&
        (material.userData?.disposeWithOwner || material.userData?.disposeOnInstrumentDelete) &&
        !disposedMaterials.has(material)
      ) {
        material.dispose?.();
        disposedMaterials.add(material);
      }
    }
  });
}
