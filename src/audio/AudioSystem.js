import { AudioContextService } from "./AudioContextService.js";
import { MasterBus } from "./MasterBus.js";
import { getHonkNoteGainFromNose, HONK_MASTER_GAIN } from "../config/audio.js";
import { MAX_PITCH_BEND_SEMITONES } from "../config/honk.js";
import { HonkVoiceService } from "./honk/HonkVoiceService.js";
import { PercussionVoiceService } from "./percussion/PercussionVoiceService.js";
import { METRONOME_SETTINGS } from "../config/metronome.js";

export class AudioSystem {
  constructor({ audioContextService = new AudioContextService(), masterBus = new MasterBus() } = {}) {
    this.audioContextService = audioContextService;
    this.masterBus = masterBus;
    this.honkRendererParameters = new Map();
    this.metronomeMonitor = null;
    this.honkVoices = new HonkVoiceService({
      ensureAudio: () => this.ensureContext(),
      getDestination: (context) => this.masterBus.getInput("honk") || context.destination,
    });
    this.percussionVoices = new PercussionVoiceService({
      ensureAudio: () => this.ensureContext(),
      getDestination: (context) => this.masterBus.getInput("percussion") || context.destination,
    });
  }

  async ensureContext() {
    const context = await this.audioContextService.ensureContext();
    this.masterBus.initialize(context);
    return context;
  }

  async ensureAudio() {
    await this.ensureContext();
  }

  startVoice(rendererId = "main") {
    return this.honkVoices.startVoice(rendererId);
  }

  updateVoice(rendererId, performanceState = {}, tuning = {}, options = HONK_MASTER_GAIN) {
    const gain = typeof options === "number" ? options : options?.gain ?? HONK_MASTER_GAIN;
    let parameters = this.honkRendererParameters.get(rendererId);
    if (!parameters) {
      parameters = {};
      this.honkRendererParameters.set(rendererId, parameters);
    }
    parameters.hornAmount = performanceState.squeeze ?? 0;
    parameters.masterGain = gain;
    parameters.leftEar = performanceState.earLeft ?? tuning.pitchControl ?? 0;
    parameters.rightEar = performanceState.earRight ?? tuning.octaveControl ?? 0;
    parameters.noteGain = getHonkNoteGainFromNose(performanceState.nose ?? 0);
    parameters.vowel = performanceState.vowel && performanceState.vowel !== "neutral"
      ? performanceState.vowel
      : "A";
    parameters.pitchBendSemitones =
      (performanceState.bend ?? 0) * MAX_PITCH_BEND_SEMITONES;
    parameters.pitchSnap = tuning.pitchSnap || null;
    parameters.retriggerToken = performanceState.retriggerToken || 0;
    return this.honkVoices.updateVoice(rendererId, parameters);
  }

  setVoiceVowel(rendererId, vowel) {
    this.honkVoices.setVoiceVowel(rendererId, vowel);
  }

  releaseVoice(rendererId = "main", options = {}) {
    this.honkVoices.setVoicePitchBend(rendererId, 0);
    return this.honkVoices.releaseVoice(rendererId, options);
  }

  disposeVoice(rendererId = "main") {
    this.honkRendererParameters.delete(rendererId);
    return this.honkVoices.disposeVoice(rendererId);
  }

  releaseAll() {
    this.honkVoices.releaseAll();
  }

  suspend() {
    const context = this.audioContextService.context;
    if (!context || context.state === "closed" || context.state === "suspended") {
      return Promise.resolve();
    }
    return context.suspend?.() || Promise.resolve();
  }

  triggerStickPercussion(type, options) {
    return this.percussionVoices.trigger(type, options);
  }

  async triggerMetronomeClick({ volume = 1 } = {}) {
    const context = await this.ensureContext();
    const monitor = this.ensureMetronomeMonitor(context);
    const now = context.currentTime;
    holdAudioParam(monitor.gain.gain, now);
    monitor.gain.gain.linearRampToValueAtTime(
      Math.max(0, volume) * METRONOME_SETTINGS.clickGain,
      now + METRONOME_SETTINGS.clickAttackSeconds,
    );
    monitor.gain.gain.exponentialRampToValueAtTime(
      0.0001,
      now + METRONOME_SETTINGS.clickDurationSeconds,
    );
  }

  ensureMetronomeMonitor(context) {
    if (this.metronomeMonitor?.context === context) return this.metronomeMonitor;
    this.disposeMetronomeMonitor();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = METRONOME_SETTINGS.clickOscillatorType;
    oscillator.frequency.setValueAtTime(METRONOME_SETTINGS.clickFrequency, context.currentTime);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    oscillator.connect(gain);
    gain.connect(this.masterBus.getInput("metronome") || context.destination);
    oscillator.start(context.currentTime);
    this.metronomeMonitor = { context, oscillator, gain };
    return this.metronomeMonitor;
  }

  disposeMetronomeMonitor() {
    const monitor = this.metronomeMonitor;
    if (!monitor) return;
    try { monitor.oscillator.stop(); } catch { /* already stopped */ }
    monitor.oscillator.disconnect?.();
    monitor.gain.disconnect?.();
    this.metronomeMonitor = null;
  }

  getPerformanceStats() {
    return { honk: this.honkVoices.getRendererStats() };
  }

  dispose() {
    this.honkVoices.disposeAll();
    this.honkRendererParameters.clear();
    this.disposeMetronomeMonitor();
    this.masterBus.disconnect();
  }
}

function holdAudioParam(parameter, now) {
  if (typeof parameter.cancelAndHoldAtTime === "function") {
    parameter.cancelAndHoldAtTime(now);
  } else {
    const current = Number.isFinite(parameter.value) ? Math.max(parameter.value, 0.0001) : 0.0001;
    parameter.cancelScheduledValues?.(now);
    parameter.setValueAtTime(current, now);
  }
}
