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

  getLivePerformanceState() {
    return this.performance.getLiveSnapshot();
  }

  getResolvedPerformanceState() {
    return this.performance.getResolvedSnapshot();
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

  setAutomationLayer(layerId, snapshot) {
    return this.performance.setAutomationLayer(layerId, snapshot);
  }

  clearAutomationLayer(layerId) {
    this.performance.clearAutomationLayer(layerId);
  }

  applyTuning(tuning) {
    this.tuning = createHonkTuning(tuning);
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
    for (const voiceId of this.activeVoiceIds) {
      this.updateAudioVoice(voiceId, resolved);
    }
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
    this.activeVoiceIds.add(voiceId);
    return this.voiceService?.startVoice?.(voiceId, this.tuning, this);
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

  updateAudioVoice(voiceId, performanceState, { gain = HONK_MASTER_GAIN } = {}) {
    if (!voiceId || !this.activeVoiceIds.has(voiceId)) return;
    const tuning = {
      ...this.tuning,
      pitchSnap: this.pitchSnap || this.tuning.pitchSnap || null,
    };
    this.voiceService?.updateVoice?.(voiceId, performanceState, tuning, { gain }, this);
  }

  releaseAudioVoice(voiceId, options = {}) {
    if (!voiceId) return;
    this.activeVoiceIds.delete(voiceId);
    this.voiceService?.releaseVoice?.(voiceId, options);
  }

  releaseAllAudioVoices() {
    for (const voiceId of [...this.activeVoiceIds]) this.releaseAudioVoice(voiceId);
  }

  setAudioVowel(vowel) {
    const normalized = vowel && vowel !== "neutral" ? vowel : "A";
    for (const voiceId of this.activeVoiceIds) this.voiceService?.setVoiceVowel?.(voiceId, normalized);
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
    this.performance.clearAutomationLayers();
    this.performance.clearLiveInteractions();
    this.noteLabelView?.dispose?.();
    disposeOwnedResources(this.root);
    this.squeezeCollider = null;
    this.targetsByRole.clear();
    super.dispose();
  }
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
