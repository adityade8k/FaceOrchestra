import { AudioContextService } from "./AudioContextService.js";
import { MasterBus } from "./MasterBus.js";
import { HONK_MASTER_GAIN } from "../config/audio.js";
import { MAX_PITCH_BEND_SEMITONES } from "../config/honk.js";
import { HonkVoiceService } from "./honk/HonkVoiceService.js";
import { PercussionVoiceService } from "./percussion/PercussionVoiceService.js";
import { METRONOME_SETTINGS } from "../config/metronome.js";

export class AudioSystem {
  constructor({ audioContextService = new AudioContextService(), masterBus = new MasterBus() } = {}) {
    this.audioContextService = audioContextService;
    this.masterBus = masterBus;

    const dependencies = {
      ensureAudio: () => this.ensureContext(),
      getDestination: (context) => this.masterBus.input || context.destination,
    };
    this.honkVoices = new HonkVoiceService(dependencies);
    this.percussionVoices = new PercussionVoiceService(dependencies);
  }

  async ensureContext() {
    const context = await this.audioContextService.ensureContext();
    this.masterBus.initialize(context);
    return context;
  }

  async ensureAudio() {
    await this.ensureContext();
  }

  startVoice(voiceId = "main") {
    return this.honkVoices.startVoice(voiceId);
  }

  updateVoice(voiceId, performanceState = {}, tuning = {}, { gain = HONK_MASTER_GAIN } = {}) {
    this.honkVoices.updateVoice(voiceId, {
      hornAmount: performanceState.squeeze ?? 0,
      masterGain: gain,
      leftEar: performanceState.earLeft ?? tuning.pitchControl ?? 0,
      rightEar: performanceState.earRight ?? tuning.octaveControl ?? 0,
      nose: performanceState.nose ?? 0,
      vowel: performanceState.vowel && performanceState.vowel !== "neutral"
        ? performanceState.vowel
        : "A",
      pitchBendSemitones: (performanceState.bend ?? 0) * MAX_PITCH_BEND_SEMITONES,
      pitchSnap: tuning.pitchSnap || null,
    });
  }

  setVoiceVowel(voiceId, vowel) {
    this.honkVoices.setVoiceVowel(voiceId, vowel);
  }

  releaseVoice(voiceId = "main", options = {}) {
    this.honkVoices.setVoicePitchBend(voiceId, 0);
    this.honkVoices.releaseVoice(voiceId, options.fadeSeconds);
  }

  releaseAll() {
    this.honkVoices.releaseAll();
  }

  suspend() {
    const context = this.audioContextService.context;
    if (!context || context.state === "closed" || context.state === "suspended") return Promise.resolve();
    return context.suspend?.() || Promise.resolve();
  }

  triggerStickPercussion(type, options) {
    return this.percussionVoices.trigger(type, options);
  }

  async triggerMetronomeClick({ volume = 1 } = {}) {
    const context = await this.ensureContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;
    const duration = METRONOME_SETTINGS.clickDurationSeconds;
    oscillator.type = METRONOME_SETTINGS.clickOscillatorType;
    oscillator.frequency.setValueAtTime(METRONOME_SETTINGS.clickFrequency, now);
    gain.gain.setValueAtTime(Math.max(0.0001, volume * METRONOME_SETTINGS.clickGain), now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain);
    gain.connect(this.masterBus.input || context.destination);
    oscillator.start(now);
    oscillator.stop(now + duration);
    oscillator.addEventListener?.("ended", () => {
      oscillator.disconnect();
      gain.disconnect();
    }, { once: true });
  }
}
