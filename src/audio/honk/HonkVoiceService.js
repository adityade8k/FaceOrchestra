import { HonkVoice } from "./HonkVoice.js";
import { HONK_RELEASE_SETTINGS } from "../../config/audio.js";

/**
 * Owns exactly one persistent renderer for each physical Honk ID. Callers may
 * retain any number of logical performance layers; those layers never create
 * additional oscillator/formant graphs.
 */
export class HonkVoiceService {
  constructor({
    ensureAudio,
    getDestination,
    createVoice = (options) => new HonkVoice(options),
  }) {
    this.ensureAudio = ensureAudio;
    this.getDestination = getDestination;
    this.createVoice = createVoice;
    this.voices = new Map();
    this.startingVoices = new Set();
    this.startTokens = new Map();
    this.startPromises = new Map();
    this.pendingUpdates = new Map();
    this.pendingVowels = new Map();
    this.performanceCounters = {
      createdRenderers: 0,
      disposedRenderers: 0,
      rendererUpdates: 0,
      silentTransitions: 0,
    };
  }

  startVoice(rendererId = "main") {
    if (this.voices.has(rendererId)) return this.voices.get(rendererId);
    if (this.startPromises.has(rendererId)) return this.startPromises.get(rendererId);
    const startToken = {};
    this.startingVoices.add(rendererId);
    this.startTokens.set(rendererId, startToken);
    const starting = Promise.resolve(this.ensureAudio()).then((context) => {
      if (this.startTokens.get(rendererId) !== startToken) return null;
      const voice = this.createVoice({
        context,
        destination: this.getDestination(context),
        vowel: this.pendingVowels.get(rendererId) || "A",
      });
      this.voices.set(rendererId, voice);
      this.performanceCounters.createdRenderers += 1;
      voice.start();
      const pending = this.pendingUpdates.get(rendererId);
      if (pending) voice.update(pending);
      return voice;
    }).finally(() => {
      if (this.startTokens.get(rendererId) === startToken) {
        this.startTokens.delete(rendererId);
        this.startingVoices.delete(rendererId);
        this.startPromises.delete(rendererId);
        this.pendingUpdates.delete(rendererId);
      }
    });
    this.startPromises.set(rendererId, starting);
    return starting;
  }

  setVoiceVowel(rendererId, vowel) {
    this.pendingVowels.set(rendererId, vowel || "A");
    this.voices.get(rendererId)?.setVowel(vowel || "A");
  }

  setVoicePitchBend(rendererId, semitones) {
    this.voices.get(rendererId)?.setPitchBend(semitones);
  }

  updateVoice(rendererId, performance) {
    this.performanceCounters.rendererUpdates += 1;
    this.setVoiceVowel(rendererId, performance.vowel);
    const voice = this.voices.get(rendererId);
    if (voice) {
      voice.update(performance);
      return true;
    }
    this.pendingUpdates.set(rendererId, copyPerformanceParameters(
      this.pendingUpdates.get(rendererId),
      performance,
    ));
    if (!this.startingVoices.has(rendererId) && (performance.hornAmount || 0) > 0) {
      this.startVoice(rendererId);
    }
    return false;
  }

  releaseVoice(rendererId = "main", options = HONK_RELEASE_SETTINGS.liveFadeSeconds) {
    const requestedFade = typeof options === "number" ? options : options?.fadeSeconds;
    const fadeSeconds = Number.isFinite(requestedFade)
      ? Math.max(requestedFade, 0)
      : HONK_RELEASE_SETTINGS.liveFadeSeconds;
    const pending = this.pendingUpdates.get(rendererId);
    if (pending) pending.hornAmount = 0;
    const voice = this.voices.get(rendererId);
    if (!voice) return false;
    this.performanceCounters.silentTransitions += 1;
    voice.silence(fadeSeconds);
    return true;
  }

  disposeVoice(rendererId = "main") {
    this.startTokens.delete(rendererId);
    this.startingVoices.delete(rendererId);
    this.startPromises.delete(rendererId);
    this.pendingUpdates.delete(rendererId);
    this.pendingVowels.delete(rendererId);
    const voice = this.voices.get(rendererId);
    if (!voice) return false;
    this.voices.delete(rendererId);
    voice.dispose?.();
    this.performanceCounters.disposedRenderers += 1;
    return true;
  }

  releaseAll() {
    for (const rendererId of this.startingVoices) {
      const pending = this.pendingUpdates.get(rendererId);
      if (pending) pending.hornAmount = 0;
    }
    for (const voice of this.voices.values()) {
      voice.silence(HONK_RELEASE_SETTINGS.liveFadeSeconds);
      this.performanceCounters.silentTransitions += 1;
    }
  }

  disposeAll() {
    for (const rendererId of this.voices.keys()) this.disposeVoice(rendererId);
    this.startTokens.clear();
    this.startingVoices.clear();
    this.startPromises.clear();
    this.pendingUpdates.clear();
    this.pendingVowels.clear();
  }

  getRendererStats() {
    let trackedAudioNodes = 0;
    let retiringFormantBanks = 0;
    for (const voice of this.voices.values()) {
      trackedAudioNodes += voice.getTrackedAudioNodeCount?.() || 0;
      retiringFormantBanks += voice.retiringBanks?.size || 0;
    }
    return {
      ...this.performanceCounters,
      activeRenderers: this.voices.size,
      startingRenderers: this.startingVoices.size,
      totalRenderers: this.voices.size + this.startingVoices.size,
      carrierOscillators: this.voices.size,
      modulationOscillators: this.voices.size,
      retiringFormantBanks,
      trackedAudioNodes,
    };
  }
}

function copyPerformanceParameters(target = {}, source = {}) {
  target.hornAmount = source.hornAmount ?? 0;
  target.masterGain = source.masterGain ?? 1;
  target.leftEar = source.leftEar ?? 0;
  target.rightEar = source.rightEar ?? 0;
  target.noteGain = source.noteGain ?? 1;
  target.vowel = source.vowel || "A";
  target.pitchBendSemitones = source.pitchBendSemitones ?? 0;
  target.pitchSnap = source.pitchSnap || null;
  target.retriggerToken = source.retriggerToken || 0;
  return target;
}
