import { HonkVoice } from "./HonkVoice.js";

const RELEASE_FADE_SECONDS = 0.12;

export class HonkVoiceService {
  constructor({ ensureAudio, getDestination }) {
    this.ensureAudio = ensureAudio;
    this.getDestination = getDestination;
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

    // A release tail may still be sounding after the active voice leaves the map.
    // Silence that tail before retriggering the same voice ID to prevent doubling.
    const releasingVoice = this.releasingVoices.get(voiceId);
    if (releasingVoice) {
      releasingVoice.disconnect?.();
      this.releasingVoices.delete(voiceId);
    }

    const startToken = {};
    this.startingVoices.add(voiceId);
    this.startTokens.set(voiceId, startToken);
    try {
      const context = await this.ensureAudio();
      if (this.startTokens.get(voiceId) !== startToken) return;
      const voice = new HonkVoice({
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

  releaseVoice(voiceId = "main", options = RELEASE_FADE_SECONDS) {
    const requestedFade = typeof options === "number" ? options : options?.fadeSeconds;
    const fadeSeconds = Number.isFinite(requestedFade)
      ? Math.max(requestedFade, 0)
      : RELEASE_FADE_SECONDS;
    this.startTokens.delete(voiceId);
    this.startingVoices.delete(voiceId);
    this.stopVoice(voiceId, fadeSeconds);
  }

  releaseAll() {
    const voiceIds = new Set([...this.voices.keys(), ...this.startingVoices]);
    for (const voiceId of voiceIds) {
      this.releaseVoice(voiceId);
    }
    for (const voice of this.releasingVoices.values()) {
      voice.disconnect?.();
    }
    this.releasingVoices.clear();
  }

  stopVoice(voiceId, fadeSeconds = RELEASE_FADE_SECONDS) {
    const voice = this.voices.get(voiceId);
    if (!voice) {
      return;
    }

    this.voices.delete(voiceId);
    this.startTokens.delete(voiceId);
    this.startingVoices.delete(voiceId);
    this.releasingVoices.set(voiceId, voice);
    voice.release(fadeSeconds, () => {
      if (this.releasingVoices.get(voiceId) === voice) {
        this.releasingVoices.delete(voiceId);
      }
    });
  }
}
