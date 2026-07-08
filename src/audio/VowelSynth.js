import * as THREE from "three";
import {
  AUDIO_MASTER_BUS_SETTINGS,
  NASALITY_SETTINGS,
  STICK_PERCUSSION_SETTINGS,
  STICK_PERCUSSION_TYPES,
  VOICE_GAIN_SETTINGS,
} from "../config/audio.js";

export const FORMANTS = {
  A: { freq: [800, 1300, 2500], gain: [0.72, 0.44, 0.16], q: [6, 10, 11] },
  E: { freq: [460, 1900, 2600], gain: [0.62, 0.65, 0.16], q: [7, 11, 12] },
  I: { freq: [300, 2300, 3000], gain: [0.52, 0.68, 0.18], q: [8, 12, 12] },
  O: { freq: [500, 820, 2350], gain: [0.78, 0.68, 0.1], q: [8, 11, 12] },
  U: { freq: [310, 720, 2050], gain: [0.7, 0.64, 0.08], q: [8, 11, 12] },
};

export const VOWEL_ROUNDNESS = {
  O: { freq: 610, gain: 0.2, q: 7 },
  U: { freq: 420, gain: 0.24, q: 8 },
};

const F4_FREQUENCY = 349.23;
const C_MAJOR_PITCH_STEPS_FROM_F = [-5, -3, -1, 0, 2, 4, 6, 7];
const F_NATURAL_MINOR_PITCH_STEPS_FROM_F = [-5, -4, -2, 0, 2, 3, 5, 7];
const PITCH_SNAP_STEPS = {
  cMajor: C_MAJOR_PITCH_STEPS_FROM_F,
  fNaturalMinor: F_NATURAL_MINOR_PITCH_STEPS_FROM_F,
};
const RELEASE_FADE_SECONDS = 0.12;

export class VowelSynth {
  constructor() {
    this.audioCtx = null;
    this.voices = new Map();
    this.startingVoices = new Set();
    this.currentVowel = "A";
    this.masterInput = null;
    this.masterCompressor = null;
    this.masterOutput = null;
  }

  async ensureAudio() {
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AudioContextClass();
      this.setupMasterBus();
    }

    if (this.audioCtx.state === "suspended") {
      await this.audioCtx.resume();
    }
  }

  setupMasterBus() {
    if (!this.audioCtx || this.masterInput) {
      return;
    }

    const settings = AUDIO_MASTER_BUS_SETTINGS;
    const compressorSettings = settings.compressor || {};
    this.masterInput = this.audioCtx.createGain();
    this.masterCompressor = this.audioCtx.createDynamicsCompressor();
    this.masterOutput = this.audioCtx.createGain();

    this.masterInput.gain.value = settings.inputGain ?? 1;
    this.masterCompressor.threshold.value = compressorSettings.threshold ?? -18;
    this.masterCompressor.knee.value = compressorSettings.knee ?? 18;
    this.masterCompressor.ratio.value = compressorSettings.ratio ?? 8;
    this.masterCompressor.attack.value = compressorSettings.attack ?? 0.004;
    this.masterCompressor.release.value = compressorSettings.release ?? 0.18;
    this.masterOutput.gain.value = settings.outputGain ?? 0.82;

    this.masterInput.connect(this.masterCompressor);
    this.masterCompressor.connect(this.masterOutput);
    this.masterOutput.connect(this.audioCtx.destination);
  }

  async start(voiceId = "main") {
    await this.ensureAudio();

    if (this.voices.has(voiceId) || this.startingVoices.has(voiceId)) {
      return;
    }

    this.startingVoices.add(voiceId);
    const now = this.audioCtx.currentTime;
    const source = this.audioCtx.createOscillator();
    const toneFilter = this.audioCtx.createBiquadFilter();
    const vibrato = this.audioCtx.createOscillator();
    const vibratoGain = this.audioCtx.createGain();
    const master = this.audioCtx.createGain();
    const output = this.audioCtx.createGain();
    const oralMix = this.audioCtx.createGain();
    const nasalLow = this.audioCtx.createBiquadFilter();
    const nasalLowGain = this.audioCtx.createGain();
    const nasalHigh = this.audioCtx.createBiquadFilter();
    const nasalHighGain = this.audioCtx.createGain();

    source.type = "sawtooth";
    source.frequency.setValueAtTime(F4_FREQUENCY, now);
    toneFilter.type = "lowpass";
    toneFilter.frequency.setValueAtTime(VOICE_GAIN_SETTINGS.toneLowpassFrequency, now);
    toneFilter.Q.setValueAtTime(VOICE_GAIN_SETTINGS.toneLowpassQ, now);
    source.connect(toneFilter);

    vibrato.type = "sine";
    vibrato.frequency.setValueAtTime(5.2, now);
    vibratoGain.gain.setValueAtTime(7, now);
    vibrato.connect(vibratoGain);
    vibratoGain.connect(source.detune);

    master.gain.setValueAtTime(0.0001, now);
    output.gain.setValueAtTime(VOICE_GAIN_SETTINGS.outputGain, now);
    oralMix.gain.setValueAtTime(1, now);

    oralMix.connect(master);
    master.connect(output);
    output.connect(this.masterInput || this.audioCtx.destination);

    nasalLow.type = "bandpass";
    nasalLow.frequency.setValueAtTime(260, now);
    nasalLow.Q.setValueAtTime(7, now);
    nasalLowGain.gain.setValueAtTime(0.0001, now);

    nasalHigh.type = "bandpass";
    nasalHigh.frequency.setValueAtTime(1150, now);
    nasalHigh.Q.setValueAtTime(13, now);
    nasalHighGain.gain.setValueAtTime(0.0001, now);

    toneFilter.connect(nasalLow);
    nasalLow.connect(nasalLowGain);
    nasalLowGain.connect(master);

    toneFilter.connect(nasalHigh);
    nasalHigh.connect(nasalHighGain);
    nasalHighGain.connect(master);

    const voice = {
      source,
      toneFilter,
      vibrato,
      vibratoGain,
      master,
      output,
      oralMix,
      nasalLow,
      nasalLowGain,
      nasalHigh,
      nasalHighGain,
      formantNodes: [],
      roundnessNode: null,
      vowel: null,
      pitchBendSemitones: 0,
    };

    this.voices.set(voiceId, voice);
    this.rebuildFormants(this.currentVowel, voiceId);
    source.start(now);
    vibrato.start(now);
    this.startingVoices.delete(voiceId);
  }

  rebuildFormants(vowel, voiceId = "main") {
    const voice = this.voices.get(voiceId);
    if (!voice || !this.audioCtx) {
      return;
    }

    const oldNodes = [...voice.formantNodes];
    if (voice.roundnessNode) {
      oldNodes.push(voice.roundnessNode);
    }

    for (const nodeSet of oldNodes) {
      this.disconnectNode(voice.toneFilter, nodeSet.filter);
      this.disconnectNode(nodeSet.filter);
      this.disconnectNode(nodeSet.gain);
    }

    const formants = FORMANTS[vowel] || FORMANTS.A;
    voice.formantNodes = formants.freq.map((frequency, index) => {
      const filter = this.audioCtx.createBiquadFilter();
      const gain = this.audioCtx.createGain();
      filter.type = "bandpass";
      filter.frequency.value = frequency;
      filter.Q.value = formants.q[index];
      gain.gain.value = formants.gain[index];
      voice.toneFilter.connect(filter);
      filter.connect(gain);
      gain.connect(voice.oralMix);
      return { filter, gain };
    });

    voice.roundnessNode = null;
    const roundness = VOWEL_ROUNDNESS[vowel];
    if (roundness) {
      const filter = this.audioCtx.createBiquadFilter();
      const gain = this.audioCtx.createGain();
      filter.type = "bandpass";
      filter.frequency.value = roundness.freq;
      filter.Q.value = roundness.q;
      gain.gain.value = roundness.gain;
      voice.toneFilter.connect(filter);
      filter.connect(gain);
      gain.connect(voice.oralMix);
      voice.roundnessNode = { filter, gain };
    }

    voice.vowel = vowel;
  }

  setVowel(vowel, voiceId = "main") {
    this.currentVowel = vowel;
    const voice = this.voices.get(voiceId);
    if (voice && voice.vowel !== vowel) {
      this.rebuildFormants(vowel, voiceId);
    }
  }

  setPitchBend(semitones, voiceId = "main") {
    const voice = this.voices.get(voiceId);
    if (voice) {
      voice.pitchBendSemitones = semitones;
    }
  }

  resetPitchBend(voiceId = "main") {
    this.setPitchBend(0, voiceId);
  }

  update({
    voiceId = "main",
    hornAmount,
    masterGain = 1,
    leftEar,
    rightEar,
    nose,
    vowel,
    pitchBendSemitones = null,
    pitchSnap = null,
  }) {
    this.setVowel(vowel, voiceId);

    const voice = this.voices.get(voiceId);
    if (!voice || !this.audioCtx) {
      return;
    }

    const now = this.audioCtx.currentTime;
    const pitchControl = THREE.MathUtils.clamp(leftEar, -1, 1);
    const octaveControl = THREE.MathUtils.clamp(rightEar, -1, 1);
    const nasalAmount = THREE.MathUtils.clamp(nose, 0, 1);
    const octave = THREE.MathUtils.mapLinear(octaveControl, -1, 1, 2, 6);
    const rawPitchSemitones =
      pitchControl < 0
        ? THREE.MathUtils.mapLinear(pitchControl, -1, 0, -5, 0)
        : THREE.MathUtils.mapLinear(pitchControl, 0, 1, 0, 7);
    const snapSteps = PITCH_SNAP_STEPS[pitchSnap];
    const pitchSemitones = snapSteps ? this.snapToPitchSteps(rawPitchSemitones, snapSteps) : rawPitchSemitones;
    const frequency = F4_FREQUENCY * 2 ** (pitchSemitones / 12) * 2 ** (octave - 4);
    if (pitchBendSemitones !== null) {
      voice.pitchBendSemitones = pitchBendSemitones;
    }
    const detune = voice.pitchBendSemitones * 100;
    const activeVoiceCount = Math.max(this.voices.size + this.startingVoices.size, 1);
    const polyphonyScale = 1 / Math.sqrt(activeVoiceCount);
    const gain = Math.max(
      0.0001,
      hornAmount * VOICE_GAIN_SETTINGS.baseGain * Math.max(masterGain, 0) * polyphonyScale,
    );

    voice.source.frequency.setTargetAtTime(frequency, now, 0.035);
    voice.source.detune.setTargetAtTime(detune, now, 0.045);
    voice.vibrato.frequency.setTargetAtTime(5.2, now, 0.06);
    voice.master.gain.setTargetAtTime(gain, now, 0.035);
    voice.oralMix.gain.setTargetAtTime(1 - nasalAmount * NASALITY_SETTINGS.oralReductionAtMax, now, 0.05);
    voice.nasalLowGain.gain.setTargetAtTime(0.0001 + nasalAmount * NASALITY_SETTINGS.lowGainAtMax, now, 0.05);
    voice.nasalHigh.frequency.setTargetAtTime(1150 + nasalAmount * NASALITY_SETTINGS.highFrequencyLiftAtMax, now, 0.05);
    voice.nasalHighGain.gain.setTargetAtTime(0.0001 + nasalAmount * NASALITY_SETTINGS.highGainAtMax, now, 0.05);
  }

  snapToPitchSteps(value, steps) {
    return steps.reduce((closest, step) =>
      Math.abs(step - value) < Math.abs(closest - value) ? step : closest,
    steps[0]);
  }

  release(voiceId = "main") {
    const voice = this.voices.get(voiceId);
    if (!voice || !this.audioCtx) {
      return;
    }

    const now = this.audioCtx.currentTime;
    voice.pitchBendSemitones = 0;
    voice.master.gain.cancelScheduledValues(now);
    voice.master.gain.setTargetAtTime(0.0001, now, 0.04);
    this.stopVoice(voiceId, RELEASE_FADE_SECONDS);
  }

  releaseMatchingVoiceIds(predicate) {
    for (const voiceId of [...this.voices.keys()]) {
      if (predicate(voiceId)) {
        this.release(voiceId);
      }
    }
  }

  releaseAll() {
    for (const voiceId of [...this.voices.keys()]) {
      this.release(voiceId);
    }
  }

  async triggerStickPercussion(type, { volume = 1 } = {}) {
    await this.ensureAudio();

    if (type === STICK_PERCUSSION_TYPES.hihat) {
      this.triggerStickHihat(volume);
      return;
    }

    this.triggerStickBoink(volume);
  }

  triggerStickBoink(volume = 1) {
    if (!this.audioCtx) {
      return;
    }

    const settings = STICK_PERCUSSION_SETTINGS.boink;
    const now = this.audioCtx.currentTime;
    const output = this.audioCtx.createGain();
    const body = this.audioCtx.createOscillator();
    const bodyGain = this.audioCtx.createGain();
    const click = this.audioCtx.createOscillator();
    const clickGain = this.audioCtx.createGain();
    const stopAt = now + settings.bodySeconds + 0.04;

    output.gain.setValueAtTime(Math.max(volume, 0) * settings.gain, now);
    output.connect(this.masterInput || this.audioCtx.destination);

    body.type = "sine";
    body.frequency.setValueAtTime(settings.startFrequency, now);
    body.frequency.exponentialRampToValueAtTime(settings.endFrequency, now + settings.pitchDropSeconds);
    bodyGain.gain.setValueAtTime(0.0001, now);
    bodyGain.gain.exponentialRampToValueAtTime(1, now + 0.004);
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + settings.bodySeconds);
    body.connect(bodyGain);
    bodyGain.connect(output);

    click.type = "triangle";
    click.frequency.setValueAtTime(settings.clickFrequency, now);
    clickGain.gain.setValueAtTime(settings.clickGain, now);
    clickGain.gain.exponentialRampToValueAtTime(0.0001, now + settings.clickSeconds);
    click.connect(clickGain);
    clickGain.connect(output);

    body.start(now);
    click.start(now);
    body.stop(stopAt);
    click.stop(now + settings.clickSeconds + 0.02);
    body.onended = () => {
      this.disconnectNode(body);
      this.disconnectNode(bodyGain);
      this.disconnectNode(click);
      this.disconnectNode(clickGain);
      this.disconnectNode(output);
    };
  }

  triggerStickHihat(volume = 1) {
    if (!this.audioCtx) {
      return;
    }

    const settings = STICK_PERCUSSION_SETTINGS.hihat;
    const now = this.audioCtx.currentTime;
    const sampleCount = Math.max(Math.floor(this.audioCtx.sampleRate * settings.noiseSeconds), 1);
    const noiseBuffer = this.audioCtx.createBuffer(1, sampleCount, this.audioCtx.sampleRate);
    const samples = noiseBuffer.getChannelData(0);
    for (let index = 0; index < sampleCount; index += 1) {
      samples[index] = Math.random() * 2 - 1;
    }

    const output = this.audioCtx.createGain();
    const source = this.audioCtx.createBufferSource();
    const highpass = this.audioCtx.createBiquadFilter();
    const bandpass = this.audioCtx.createBiquadFilter();
    const noiseGain = this.audioCtx.createGain();
    const stopAt = now + settings.noiseSeconds + 0.04;

    output.gain.setValueAtTime(Math.max(volume, 0) * settings.gain, now);
    output.connect(this.masterInput || this.audioCtx.destination);

    source.buffer = noiseBuffer;
    highpass.type = "highpass";
    highpass.frequency.setValueAtTime(settings.highpassFrequency, now);
    bandpass.type = "bandpass";
    bandpass.frequency.setValueAtTime(settings.bandpassFrequency, now);
    bandpass.Q.setValueAtTime(settings.bandpassQ, now);
    noiseGain.gain.setValueAtTime(1, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + settings.noiseSeconds);

    source.connect(highpass);
    highpass.connect(bandpass);
    bandpass.connect(noiseGain);
    noiseGain.connect(output);

    const metallicOscillators = settings.metallicFrequencies.map((frequency) => {
      const oscillator = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      oscillator.type = "square";
      oscillator.frequency.setValueAtTime(frequency, now);
      gain.gain.setValueAtTime(settings.metallicGain, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + settings.noiseSeconds * 0.72);
      oscillator.connect(gain);
      gain.connect(output);
      oscillator.start(now);
      oscillator.stop(stopAt);
      return { oscillator, gain };
    });

    source.start(now);
    source.stop(stopAt);
    source.onended = () => {
      this.disconnectNode(source);
      this.disconnectNode(highpass);
      this.disconnectNode(bandpass);
      this.disconnectNode(noiseGain);
      for (const { oscillator, gain } of metallicOscillators) {
        this.disconnectNode(oscillator);
        this.disconnectNode(gain);
      }
      this.disconnectNode(output);
    };
  }

  stopVoice(voiceId, fadeSeconds = RELEASE_FADE_SECONDS) {
    const voice = this.voices.get(voiceId);
    if (!voice || !this.audioCtx) {
      return;
    }

    const stopAt = this.audioCtx.currentTime + Math.max(fadeSeconds, 0.01);
    voice.source.onended = () => {
      this.disconnectVoice(voice);
    };
    this.voices.delete(voiceId);
    this.startingVoices.delete(voiceId);

    try {
      voice.source.stop(stopAt);
    } catch {
      this.disconnectVoice(voice);
    }
    try {
      voice.vibrato.stop(stopAt);
    } catch {
      // Source cleanup above is enough if vibrato was already stopped.
    }
  }

  disconnectVoice(voice) {
    const formantNodes = [...voice.formantNodes];
    if (voice.roundnessNode) {
      formantNodes.push(voice.roundnessNode);
    }

    for (const nodeSet of formantNodes) {
      this.disconnectNode(voice.source, nodeSet.filter);
      this.disconnectNode(nodeSet.filter);
      this.disconnectNode(nodeSet.gain);
    }

    this.disconnectNode(voice.source);
    this.disconnectNode(voice.toneFilter);
    this.disconnectNode(voice.vibrato);
    this.disconnectNode(voice.vibratoGain);
    this.disconnectNode(voice.nasalLow);
    this.disconnectNode(voice.nasalLowGain);
    this.disconnectNode(voice.nasalHigh);
    this.disconnectNode(voice.nasalHighGain);
    this.disconnectNode(voice.oralMix);
    this.disconnectNode(voice.master);
    this.disconnectNode(voice.output);
    voice.formantNodes.length = 0;
    voice.roundnessNode = null;
  }

  disconnectNode(node, destination = undefined) {
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
}
