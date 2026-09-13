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
    this.vowelSchedules = new Map();
  }

  hasVoice(voiceId) {
    return this.voices.has(voiceId) || this.startingVoices.has(voiceId);
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
      this.vowelSchedules.set(voice, { audible: voice.vowel, points: [] });
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
    if (!voice || !vowel) return;
    let sequence = this.vowelSchedules.get(voice);
    if (!sequence) this.vowelSchedules.set(voice, sequence = { audible: voice.vowel, points: [] });
    const now = voice.context?.currentTime ?? 0;
    const time = voice.context && Number.isFinite(scheduledTime) ? Math.max(scheduledTime, now) : now;
    // Keep the requested sequence, including redundant points, until their time
    // passes. An out-of-order insertion may turn a former repeat into a transition.
    sequence.points = sequence.points.filter((point) => point.time > now || point.timer !== null);
    sequence.points.push({ time, vowel, timer: null });
    sequence.points.sort((a, b) => a.time - b.time);
    let projected = sequence.audible;
    for (const point of sequence.points) {
      const transition = point.vowel !== projected;
      if (!transition && point.timer !== null) {
        globalThis.clearTimeout?.(point.timer);
        point.timer = null;
      }
      if (transition && point.timer === null) {
        const delayMs = Math.max((point.time - now) * 1000, 0);
        if (delayMs <= 1) {
          voice.setVowel?.(point.vowel);
          sequence.audible = point.vowel;
        } else {
          point.timer = globalThis.setTimeout?.(() => {
            point.timer = null;
            sequence.audible = point.vowel;
            voice.setVowel?.(point.vowel);
            sequence.points = sequence.points.filter((candidate) => candidate !== point &&
              (candidate.time > point.time || candidate.timer !== null));
          }, delayMs);
          point.timer?.unref?.();
        }
      }
      projected = point.vowel;
    }
  }

  clearVoiceVowels(voice) {
    const sequence = this.vowelSchedules.get(voice);
    for (const point of sequence?.points || []) {
      if (point.timer !== null) globalThis.clearTimeout?.(point.timer);
    }
    this.vowelSchedules.delete(voice);
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

  cancelVoice(voiceId = 'main', options = {}) {
    this.startTokens.delete(voiceId);
    this.startingVoices.delete(voiceId);
    const active = this.voices.get(voiceId);
    const voices = new Set(this.releasingVoices.get(voiceId) || []);
    if (active) voices.add(active);
    this.voices.delete(voiceId);
    this.releasingVoices.delete(voiceId);
    for (const voice of voices) {
      this.clearVoiceVowels(voice);
      if (voice?.cancel) voice.cancel(options); else voice?.disconnect?.();
      // Keep future releases reachable by Stop/disconnect until they finish.
      if (Number.isFinite(options.scheduledTime) && options.scheduledTime > voice.context?.currentTime) {
        let retiring = this.releasingVoices.get(voiceId);
        if (!retiring) this.releasingVoices.set(voiceId, retiring = new Set());
        retiring.add(voice);
        const timer = globalThis.setTimeout?.(() => {
          retiring.delete(voice);
          if (!retiring.size && this.releasingVoices.get(voiceId) === retiring) this.releasingVoices.delete(voiceId);
        }, (options.scheduledTime-voice.context.currentTime+0.3)*1000);
        timer?.unref?.();
      }
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
      this.clearVoiceVowels(voice);
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
