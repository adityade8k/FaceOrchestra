import { HonkVoice } from "./HonkVoice.js";
import { HONK_RELEASE_SETTINGS } from "../../config/audio.js";

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
    this.releasingVoices = new Map();
    this.startingVoices = new Set();
    this.startTokens = new Map();
    this.currentVowel = "A";
  }

  async startVoice(voiceId = "main") {
    if (this.voices.has(voiceId) || this.startingVoices.has(voiceId)) {
      return;
    }

    const startToken = {};
    this.startingVoices.add(voiceId);
    this.startTokens.set(voiceId, startToken);
    try {
      const context = await this.ensureAudio();
      if (this.startTokens.get(voiceId) !== startToken) return;
      const voice = this.createVoice({
        context,
        destination: this.getDestination(context),
        vowel: this.currentVowel,
      });
      this.voices.set(voiceId, voice);
      voice.start();
    } finally {
      if (this.startTokens.get(voiceId) === startToken) {
        this.startTokens.delete(voiceId);
        this.startingVoices.delete(voiceId);
      }
    }
  }

  setVoiceVowel(voiceId, vowel) {
    this.currentVowel = vowel;
    this.voices.get(voiceId)?.setVowel(vowel);
  }

  setVoicePitchBend(voiceId, semitones) {
    this.voices.get(voiceId)?.setPitchBend(semitones);
  }

  updateVoice(voiceId, { vowel, ...performance }) {
    this.setVoiceVowel(voiceId, vowel);

    const voice = this.voices.get(voiceId);
    if (!voice) {
      return;
    }

    voice.update({
      ...performance,
      activeVoiceCount: Math.max(this.voices.size + this.startingVoices.size, 1),
    });
  }

  releaseVoice(voiceId = "main", options = HONK_RELEASE_SETTINGS.liveFadeSeconds) {
    const requestedFade = typeof options === "number" ? options : options?.fadeSeconds;
    const fadeSeconds = Number.isFinite(requestedFade)
      ? Math.max(requestedFade, 0)
      : HONK_RELEASE_SETTINGS.liveFadeSeconds;
    const releaseOptions = typeof options === "object" && options !== null
      ? { ...options, fadeSeconds }
      : { fadeSeconds };
    this.startTokens.delete(voiceId);
    this.startingVoices.delete(voiceId);
    this.stopVoice(voiceId, releaseOptions);
  }

  releaseAll() {
    const voiceIds = new Set([...this.voices.keys(), ...this.startingVoices]);
    for (const voiceId of voiceIds) {
      this.releaseVoice(voiceId);
    }
  }

  stopVoice(voiceId, options = {}) {
    const voice = this.voices.get(voiceId);
    if (!voice) {
      return;
    }

    const fadeSeconds = Number.isFinite(options.fadeSeconds)
      ? options.fadeSeconds
      : HONK_RELEASE_SETTINGS.liveFadeSeconds;

    this.voices.delete(voiceId);
    this.startTokens.delete(voiceId);
    this.startingVoices.delete(voiceId);
    let releaseGenerations = this.releasingVoices.get(voiceId);
    if (!releaseGenerations) {
      releaseGenerations = new Set();
      this.releasingVoices.set(voiceId, releaseGenerations);
    }
    releaseGenerations.add(voice);
    voice.release(fadeSeconds, () => {
      const currentGenerations = this.releasingVoices.get(voiceId);
      if (!currentGenerations) {
        return;
      }
      currentGenerations.delete(voice);
      if (currentGenerations.size === 0 && this.releasingVoices.get(voiceId) === currentGenerations) {
        this.releasingVoices.delete(voiceId);
      }
    }, options);
  }
}
