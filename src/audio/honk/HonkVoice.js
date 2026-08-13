import {
  HONK_NOTE_GAIN_SETTINGS,
  HONK_RELEASE_SETTINGS,
  VOICE_GAIN_SETTINGS,
} from "../../config/audio.js";
import { clamp } from "../audioMath.js";
import { FORMANTS, VOWEL_ROUNDNESS } from "./formantData.js";
import {
  CONTROLLER_HONK_RELEASE_SETTINGS,
  HONK_RELEASE_ORIGINS,
} from "./HonkReleaseProfile.js";
import { F4_FREQUENCY, getHonkFrequency } from "./pitch.js";

export class HonkVoice {
  constructor({ context, destination, vowel = "A" }) {
    this.context = context;
    this.destination = destination || context.destination;
    this.formantNodes = [];
    this.roundnessNode = null;
    this.vowel = null;
    this.pitchBendSemitones = 0;
    this.disconnected = false;
    this.releaseState = null;

    this.createNodes();
    this.rebuildFormants(vowel);
  }

  createNodes() {
    const now = this.context.currentTime;
    this.source = this.context.createOscillator();
    this.toneFilter = this.context.createBiquadFilter();
    this.vibrato = this.context.createOscillator();
    this.vibratoGain = this.context.createGain();
    this.master = this.context.createGain();
    this.output = this.context.createGain();

    this.source.type = "sawtooth";
    this.source.frequency.setValueAtTime(F4_FREQUENCY, now);
    this.toneFilter.type = "lowpass";
    this.toneFilter.frequency.setValueAtTime(VOICE_GAIN_SETTINGS.toneLowpassFrequency, now);
    this.toneFilter.Q.setValueAtTime(VOICE_GAIN_SETTINGS.toneLowpassQ, now);
    this.source.connect(this.toneFilter);

    this.vibrato.type = "sine";
    this.vibrato.frequency.setValueAtTime(5.2, now);
    this.vibratoGain.gain.setValueAtTime(7, now);
    this.vibrato.connect(this.vibratoGain);
    this.vibratoGain.connect(this.source.detune);

    this.master.gain.setValueAtTime(0.0001, now);
    this.output.gain.setValueAtTime(VOICE_GAIN_SETTINGS.outputGain, now);

    this.master.connect(this.output);
    this.output.connect(this.destination);
  }

  start() {
    const now = this.context.currentTime;
    this.source.start(now);
    this.vibrato.start(now);
  }

  rebuildFormants(vowel) {
    const oldNodes = [...this.formantNodes];
    if (this.roundnessNode) {
      oldNodes.push(this.roundnessNode);
    }

    for (const nodeSet of oldNodes) {
      disconnectNode(this.toneFilter, nodeSet.filter);
      disconnectNode(nodeSet.filter);
      disconnectNode(nodeSet.gain);
    }

    const formants = FORMANTS[vowel] || FORMANTS.A;
    this.formantNodes = formants.freq.map((frequency, index) => {
      const filter = this.context.createBiquadFilter();
      const gain = this.context.createGain();
      filter.type = "bandpass";
      filter.frequency.value = frequency;
      filter.Q.value = formants.q[index];
      gain.gain.value = formants.gain[index];
      this.toneFilter.connect(filter);
      filter.connect(gain);
      gain.connect(this.master);
      return { filter, gain };
    });

    this.roundnessNode = null;
    const roundness = VOWEL_ROUNDNESS[vowel];
    if (roundness) {
      const filter = this.context.createBiquadFilter();
      const gain = this.context.createGain();
      filter.type = "bandpass";
      filter.frequency.value = roundness.freq;
      filter.Q.value = roundness.q;
      gain.gain.value = roundness.gain;
      this.toneFilter.connect(filter);
      filter.connect(gain);
      gain.connect(this.master);
      this.roundnessNode = { filter, gain };
    }

    this.vowel = vowel;
  }

  setVowel(vowel) {
    if (this.vowel !== vowel) {
      this.rebuildFormants(vowel);
    }
  }

  setPitchBend(semitones) {
    this.pitchBendSemitones = semitones;
  }

  update({
    hornAmount,
    masterGain = 1,
    leftEar,
    rightEar,
    noteGain = 1,
    pitchBendSemitones = null,
    pitchSnap = null,
    activeVoiceCount = 1,
  }) {
    const now = this.context.currentTime;
    const frequency = getHonkFrequency({ leftEar, rightEar, pitchSnap });
    if (pitchBendSemitones !== null) {
      this.pitchBendSemitones = pitchBendSemitones;
    }
    const detune = this.pitchBendSemitones * 100;
    const polyphonyScale = 1 / Math.sqrt(Math.max(activeVoiceCount, 1));
    const gain = Math.max(
      0.0001,
      hornAmount *
        VOICE_GAIN_SETTINGS.baseGain *
        Math.max(masterGain, 0) *
        clamp(noteGain, 0, 1) *
        polyphonyScale,
    );

    this.source.frequency.setTargetAtTime(frequency, now, 0.035);
    this.source.detune.setTargetAtTime(detune, now, 0.045);
    this.vibrato.frequency.setTargetAtTime(5.2, now, 0.06);
    this.master.gain.setTargetAtTime(gain, now, HONK_NOTE_GAIN_SETTINGS.smoothingSeconds);
  }

  release(fadeSeconds = HONK_RELEASE_SETTINGS.liveFadeSeconds, onEnded, options = {}) {
    if (this.releaseState) {
      return this.releaseState;
    }

    const now = this.context.currentTime;
    const requestedFade = Number.isFinite(fadeSeconds)
      ? fadeSeconds
      : HONK_RELEASE_SETTINGS.liveFadeSeconds;
    const safeFadeSeconds = Math.max(
      requestedFade,
      HONK_RELEASE_SETTINGS.minimumFadeSeconds,
    );
    const silentAt = now + safeFadeSeconds;
    const stopAt = silentAt + HONK_RELEASE_SETTINGS.stopPaddingSeconds;
    let completed = false;
    let fallbackTimer = null;
    const completeRelease = () => {
      if (completed) {
        return;
      }
      completed = true;
      if (fallbackTimer !== null) {
        globalThis.clearTimeout?.(fallbackTimer);
        fallbackTimer = null;
      }
      this.disconnect();
      onEnded?.();
    };
    const handleSourceEnded = () => {
      completeRelease();
    };

    this.releaseState = {
      releaseStart: now,
      silentAt,
      stopAt,
    };
    this.pitchBendSemitones = 0;
    if (options?.origin === HONK_RELEASE_ORIGINS.controller) {
      this.scheduleControllerRelease(now, silentAt);
    } else {
      this.scheduleDefaultRelease(now, silentAt);
    }
    this.source.onended = handleSourceEnded;

    try {
      this.source.stop(stopAt);
    } catch {
      const delayMilliseconds = Math.max(
        0,
        Math.ceil((stopAt - this.context.currentTime) * 1000),
      );
      fallbackTimer = globalThis.setTimeout?.(handleSourceEnded, delayMilliseconds) ?? null;
      fallbackTimer?.unref?.();
    }
    try {
      this.vibrato.stop(stopAt);
    } catch {
      // Source cleanup is enough if vibrato was already stopped.
    }

    return this.releaseState;
  }

  scheduleControllerRelease(now, silentAt) {
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(
      CONTROLLER_HONK_RELEASE_SETTINGS.silentFloor,
      now,
      CONTROLLER_HONK_RELEASE_SETTINGS.targetTimeConstantSeconds,
    );

    const outputGain = Number.isFinite(this.output.gain.value)
      ? Math.max(this.output.gain.value, 0)
      : VOICE_GAIN_SETTINGS.outputGain;
    const zeroRampStart = Math.max(
      now,
      silentAt - CONTROLLER_HONK_RELEASE_SETTINGS.finalZeroRampSeconds,
    );
    this.output.gain.setValueAtTime(outputGain, zeroRampStart);
    this.output.gain.linearRampToValueAtTime(0, silentAt);
  }

  scheduleDefaultRelease(now, silentAt) {
    if (typeof this.master.gain.cancelAndHoldAtTime === "function") {
      this.master.gain.cancelAndHoldAtTime(now);
    } else {
      const currentGain = Number.isFinite(this.master.gain.value)
        ? Math.max(this.master.gain.value, 0)
        : 0.0001;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setValueAtTime(currentGain, now);
    }
    this.master.gain.linearRampToValueAtTime(0, silentAt);
  }

  disconnect() {
    if (this.disconnected) {
      return;
    }
    this.disconnected = true;

    const formantNodes = [...this.formantNodes];
    if (this.roundnessNode) {
      formantNodes.push(this.roundnessNode);
    }
    for (const nodeSet of formantNodes) {
      disconnectNode(nodeSet.filter);
      disconnectNode(nodeSet.gain);
    }

    disconnectNode(this.source);
    disconnectNode(this.toneFilter);
    disconnectNode(this.vibrato);
    disconnectNode(this.vibratoGain);
    disconnectNode(this.master);
    disconnectNode(this.output);
    this.formantNodes.length = 0;
    this.roundnessNode = null;
  }
}

function disconnectNode(node, destination = undefined) {
  try {
    if (destination) {
      node?.disconnect?.(destination);
    } else {
      node?.disconnect?.();
    }
  } catch {
    // Already disconnected.
  }
}
