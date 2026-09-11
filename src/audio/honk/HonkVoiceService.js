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

  async startVoice(voiceId = "main", options = {}) {
    if (this.voices.has(voiceId) || this.startingVoices.has(voiceId)) {
      return;
    }

    const startToken = { options, updates: [], release: null };
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
      voice.start(options.scheduledTime);
      for (const update of startToken.updates) {
        if (update.performance.vowel) {
          this.scheduleVoiceVowel(voice, update.performance.vowel, update.options.scheduledTime);
        }
        voice.update({
          ...update.performance,
          activeVoiceCount: Math.max(this.voices.size + this.startingVoices.size, 1),
        }, update.options);
      }
      if (startToken.release) this.stopVoice(voiceId, startToken.release);
    } finally {
      if (this.startTokens.get(voiceId) === startToken) {
        this.startTokens.delete(voiceId);
        this.startingVoices.delete(voiceId);
      }
    }
  }

  setVoiceVowel(voiceId, vowel, options = {}) {
    this.currentVowel = vowel;
    const voice = this.voices.get(voiceId);
    if (voice) this.scheduleVoiceVowel(voice, vowel, options.scheduledTime);
  }

  scheduleVoiceVowel(voice, vowel, scheduledTime) {
    const delayMs = Number.isFinite(scheduledTime) && voice?.context
      ? Math.max((scheduledTime - voice.context.currentTime) * 1000, 0)
      : 0;
    if (delayMs <= 1) {
      voice?.setVowel?.(vowel);
      return;
    }
    const timer = globalThis.setTimeout?.(() => voice?.setVowel?.(vowel), delayMs);
    timer?.unref?.();
  }

  setVoicePitchBend(voiceId, semitones) {
    this.voices.get(voiceId)?.setPitchBend(semitones);
  }

  updateVoice(voiceId, { vowel, ...performance }, options = {}) {
    this.setVoiceVowel(voiceId, vowel, options);

    const voice = this.voices.get(voiceId);
    if (!voice) {
      const pending = this.startTokens.get(voiceId);
      if (pending) pending.updates.push({ performance: { vowel, ...performance }, options });
      return;
    }

    voice.update({
      ...performance,
      activeVoiceCount: Math.max(this.voices.size + this.startingVoices.size, 1),
    }, options);
  }

  releaseVoice(voiceId = "main", options = HONK_RELEASE_SETTINGS.liveFadeSeconds) {
    const requestedFade = typeof options === "number" ? options : options?.fadeSeconds;
    const fadeSeconds = Number.isFinite(requestedFade)
      ? Math.max(requestedFade, 0)
      : HONK_RELEASE_SETTINGS.liveFadeSeconds;
    const releaseOptions = typeof options === "object" && options !== null
      ? { ...options, fadeSeconds }
      : { fadeSeconds };
    const pending = this.startTokens.get(voiceId);
    if (pending && Number.isFinite(releaseOptions.scheduledTime)) {
      pending.release = releaseOptions;
      return;
    }
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

  cancelVoice(voiceId = "main") {
    this.startTokens.delete(voiceId);
    this.startingVoices.delete(voiceId);
    const active = this.voices.get(voiceId);
    active?.cancel?.();
    active?.disconnect?.();
    this.voices.delete(voiceId);
    for (const voice of this.releasingVoices.get(voiceId) || []) {
      voice.cancel?.();
      voice.disconnect?.();
    }
    this.releasingVoices.delete(voiceId);
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
