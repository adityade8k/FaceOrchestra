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

  createSoftClipCurve(amount = 1.4) {
    const samples = 256;
    const curve = new Float32Array(samples);
    const drive = Math.max(amount, 0.01);
    const normalizer = Math.tanh(drive);

    for (let index = 0; index < samples; index += 1) {
      const x = (index / (samples - 1)) * 2 - 1;
      curve[index] = Math.tanh(x * drive) / normalizer;
    }

    return curve;
  }

  triggerStickBoink(volume = 1) {
    if (!this.audioCtx) {
      return;
    }

    const settings = STICK_PERCUSSION_SETTINGS.boink;
    const now = this.audioCtx.currentTime;
    const output = this.audioCtx.createGain();
    const bodyBus = this.audioCtx.createGain();
    const bodyDrive = this.audioCtx.createWaveShaper();
    const bodyTone = this.audioCtx.createBiquadFilter();
    const roomDelay = this.audioCtx.createDelay(0.18);
    const roomFeedback = this.audioCtx.createGain();
    const roomDamping = this.audioCtx.createBiquadFilter();
    const roomGain = this.audioCtx.createGain();
    const body = this.audioCtx.createOscillator();
    const bodyGain = this.audioCtx.createGain();
    const sub = this.audioCtx.createOscillator();
    const subGain = this.audioCtx.createGain();
    const shell = this.audioCtx.createOscillator();
    const shellGain = this.audioCtx.createGain();
    const malletSource = this.audioCtx.createBufferSource();
    const malletFilter = this.audioCtx.createBiquadFilter();
    const malletGain = this.audioCtx.createGain();
    const click = this.audioCtx.createOscillator();
    const clickGain = this.audioCtx.createGain();
    const bodySeconds = Math.max(settings.bodySeconds, 0.04);
    const subSeconds = Math.max(settings.subSeconds ?? bodySeconds, bodySeconds);
    const shellSeconds = Math.max(settings.shellSeconds ?? bodySeconds * 0.72, 0.03);
    const malletSeconds = Math.max(settings.malletSeconds ?? 0.04, 0.005);
    const roomTailSeconds = Math.max(settings.roomTailSeconds ?? 0.16, 0);
    const stopAt = now + Math.max(bodySeconds, subSeconds, shellSeconds, malletSeconds) + roomTailSeconds + 0.05;
    const malletSampleCount = Math.max(Math.floor(this.audioCtx.sampleRate * malletSeconds), 1);
    const malletBuffer = this.audioCtx.createBuffer(1, malletSampleCount, this.audioCtx.sampleRate);
    const malletSamples = malletBuffer.getChannelData(0);
    for (let index = 0; index < malletSampleCount; index += 1) {
      malletSamples[index] = Math.random() * 2 - 1;
    }

    output.gain.setValueAtTime(Math.max(volume, 0) * settings.gain, now);
    output.connect(this.masterInput || this.audioCtx.destination);
    bodyBus.gain.setValueAtTime(1, now);
    bodyDrive.curve = this.createSoftClipCurve(settings.bodyDrive ?? 1.4);
    bodyDrive.oversample = "2x";
    bodyTone.type = "lowpass";
    bodyTone.frequency.setValueAtTime(settings.bodyToneFrequency ?? 1000, now);
    bodyTone.Q.setValueAtTime(0.72, now);
    roomDelay.delayTime.setValueAtTime(settings.roomDelaySeconds ?? 0.038, now);
    roomFeedback.gain.setValueAtTime(
      THREE.MathUtils.clamp(settings.roomFeedback ?? 0.2, 0, 0.82),
      now,
    );
    roomDamping.type = "lowpass";
    roomDamping.frequency.setValueAtTime(settings.roomDampingFrequency ?? 520, now);
    roomGain.gain.setValueAtTime(settings.roomGain ?? 0.1, now);
    roomGain.gain.exponentialRampToValueAtTime(
      0.0001,
      now + Math.max(shellSeconds, bodySeconds * 0.55) + Math.max(roomTailSeconds, 0.04),
    );

    bodyBus.connect(bodyDrive);
    bodyDrive.connect(bodyTone);
    bodyTone.connect(output);
    bodyTone.connect(roomDelay);
    roomDelay.connect(roomGain);
    roomGain.connect(output);
    roomDelay.connect(roomFeedback);
    roomFeedback.connect(roomDamping);
    roomDamping.connect(roomDelay);

    body.type = "sine";
    body.frequency.setValueAtTime(settings.startFrequency, now);
    body.frequency.exponentialRampToValueAtTime(settings.endFrequency, now + settings.pitchDropSeconds);
    bodyGain.gain.setValueAtTime(0.0001, now);
    bodyGain.gain.exponentialRampToValueAtTime(1, now + (settings.bodyAttackSeconds ?? 0.006));
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + bodySeconds);
    body.connect(bodyGain);
    bodyGain.connect(bodyBus);

    sub.type = "sine";
    sub.frequency.setValueAtTime(settings.subStartFrequency ?? settings.endFrequency, now);
    sub.frequency.exponentialRampToValueAtTime(
      settings.subEndFrequency ?? settings.endFrequency,
      now + (settings.subPitchDropSeconds ?? settings.pitchDropSeconds),
    );
    subGain.gain.setValueAtTime(settings.subGain ?? 0.36, now);
    subGain.gain.exponentialRampToValueAtTime(0.0001, now + subSeconds);
    sub.connect(subGain);
    subGain.connect(bodyBus);

    shell.type = "triangle";
    shell.frequency.setValueAtTime(settings.shellStartFrequency ?? 112, now);
    shell.frequency.exponentialRampToValueAtTime(
      settings.shellEndFrequency ?? 74,
      now + (settings.shellPitchDropSeconds ?? settings.pitchDropSeconds),
    );
    shellGain.gain.setValueAtTime(0.0001, now);
    shellGain.gain.exponentialRampToValueAtTime(settings.shellGain ?? 0.3, now + 0.008);
    shellGain.gain.exponentialRampToValueAtTime(0.0001, now + shellSeconds);
    shell.connect(shellGain);
    shellGain.connect(bodyBus);

    malletSource.buffer = malletBuffer;
    malletFilter.type = "bandpass";
    malletFilter.frequency.setValueAtTime(settings.malletFilterFrequency ?? 285, now);
    malletFilter.Q.setValueAtTime(settings.malletFilterQ ?? 0.9, now);
    malletGain.gain.setValueAtTime(settings.malletGain ?? 0.24, now);
    malletGain.gain.exponentialRampToValueAtTime(0.0001, now + malletSeconds);
    malletSource.connect(malletFilter);
    malletFilter.connect(malletGain);
    malletGain.connect(bodyBus);

    click.type = "triangle";
    click.frequency.setValueAtTime(settings.clickFrequency, now);
    clickGain.gain.setValueAtTime(settings.clickGain, now);
    clickGain.gain.exponentialRampToValueAtTime(0.0001, now + settings.clickSeconds);
    click.connect(clickGain);
    clickGain.connect(output);

    body.start(now);
    sub.start(now);
    shell.start(now);
    malletSource.start(now);
    click.start(now);
    body.stop(stopAt);
    sub.stop(stopAt);
    shell.stop(stopAt);
    malletSource.stop(now + malletSeconds);
    click.stop(now + settings.clickSeconds + 0.02);
    body.onended = () => {
      this.disconnectNode(body);
      this.disconnectNode(bodyGain);
      this.disconnectNode(sub);
      this.disconnectNode(subGain);
      this.disconnectNode(shell);
      this.disconnectNode(shellGain);
      this.disconnectNode(malletSource);
      this.disconnectNode(malletFilter);
      this.disconnectNode(malletGain);
      this.disconnectNode(click);
      this.disconnectNode(clickGain);
      this.disconnectNode(bodyBus);
      this.disconnectNode(bodyDrive);
      this.disconnectNode(bodyTone);
      this.disconnectNode(roomDelay);
      this.disconnectNode(roomFeedback);
      this.disconnectNode(roomDamping);
      this.disconnectNode(roomGain);
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
    const airHighpass = this.audioCtx.createBiquadFilter();
    const airGain = this.audioCtx.createGain();
    const noiseGain = this.audioCtx.createGain();
    const metallicBus = this.audioCtx.createGain();
    const metallicEchoDelay = this.audioCtx.createDelay(0.25);
    const metallicEchoFeedback = this.audioCtx.createGain();
    const metallicEchoDamping = this.audioCtx.createBiquadFilter();
    const metallicEchoGain = this.audioCtx.createGain();
    const noiseSeconds = Math.max(settings.noiseSeconds, 0.01);
    const noiseAttackSeconds = Math.min(settings.noiseAttackSeconds ?? 0.0015, noiseSeconds * 0.25);
    const metallicDecaySeconds = Math.max(settings.metallicDecaySeconds ?? noiseSeconds, noiseSeconds);
    const metallicEchoTailSeconds = Math.max(settings.metallicEchoTailSeconds ?? 0.2, 0);
    const stopAt = now + Math.max(noiseSeconds, metallicDecaySeconds) + metallicEchoTailSeconds + 0.06;

    output.gain.setValueAtTime(Math.max(volume, 0) * settings.gain, now);
    output.connect(this.masterInput || this.audioCtx.destination);

    source.buffer = noiseBuffer;
    highpass.type = "highpass";
    highpass.frequency.setValueAtTime(settings.highpassFrequency, now);
    bandpass.type = "bandpass";
    bandpass.frequency.setValueAtTime(settings.bandpassFrequency, now);
    bandpass.Q.setValueAtTime(settings.bandpassQ, now);
    airHighpass.type = "highpass";
    airHighpass.frequency.setValueAtTime(settings.airHighpassFrequency, now);
    airGain.gain.setValueAtTime(settings.airGain ?? 0.25, now);
    airGain.gain.exponentialRampToValueAtTime(0.0001, now + noiseSeconds * 0.82);
    noiseGain.gain.setValueAtTime(0.0001, now);
    noiseGain.gain.exponentialRampToValueAtTime(settings.noiseGain ?? 1, now + noiseAttackSeconds);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + noiseSeconds);
    metallicEchoDelay.delayTime.setValueAtTime(settings.metallicEchoDelaySeconds ?? 0.045, now);
    metallicEchoFeedback.gain.setValueAtTime(
      THREE.MathUtils.clamp(settings.metallicEchoFeedback ?? 0.3, 0, 0.9),
      now,
    );
    metallicEchoDamping.type = "lowpass";
    metallicEchoDamping.frequency.setValueAtTime(settings.metallicEchoDampingFrequency ?? 7600, now);
    metallicEchoGain.gain.setValueAtTime(settings.metallicEchoGain ?? 0.12, now);

    source.connect(highpass);
    highpass.connect(bandpass);
    highpass.connect(airHighpass);
    bandpass.connect(noiseGain);
    airHighpass.connect(airGain);
    noiseGain.connect(output);
    airGain.connect(output);
    metallicBus.connect(output);
    metallicBus.connect(metallicEchoDelay);
    metallicEchoDelay.connect(metallicEchoGain);
    metallicEchoGain.connect(output);
    metallicEchoDelay.connect(metallicEchoFeedback);
    metallicEchoFeedback.connect(metallicEchoDamping);
    metallicEchoDamping.connect(metallicEchoDelay);

    const metallicDetunes = settings.metallicDetuneCents || [];
    const metallicOscillators = settings.metallicFrequencies.map((frequency, index) => {
      const oscillator = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      const partialGain = settings.metallicGain / Math.sqrt(index + 1);
      const partialPosition =
        settings.metallicFrequencies.length > 1
          ? index / (settings.metallicFrequencies.length - 1)
          : 0;
      const partialDecay = metallicDecaySeconds * THREE.MathUtils.lerp(1, 0.56, partialPosition);

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, now);
      oscillator.detune.setValueAtTime(metallicDetunes[index] ?? 0, now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(partialGain, now + (settings.metallicAttackSeconds ?? 0.0025));
      gain.gain.exponentialRampToValueAtTime(0.0001, now + Math.max(partialDecay, 0.03));
      oscillator.connect(gain);
      gain.connect(metallicBus);
      oscillator.start(now);
      oscillator.stop(stopAt);
      return { oscillator, gain };
    });

    const cleanup = () => {
      this.disconnectNode(source);
      this.disconnectNode(highpass);
      this.disconnectNode(bandpass);
      this.disconnectNode(airHighpass);
      this.disconnectNode(airGain);
      this.disconnectNode(noiseGain);
      this.disconnectNode(metallicBus);
      this.disconnectNode(metallicEchoDelay);
      this.disconnectNode(metallicEchoFeedback);
      this.disconnectNode(metallicEchoDamping);
      this.disconnectNode(metallicEchoGain);
      for (const { oscillator, gain } of metallicOscillators) {
        this.disconnectNode(oscillator);
        this.disconnectNode(gain);
      }
      this.disconnectNode(output);
    };

    source.start(now);
    source.stop(now + noiseSeconds);

    const cleanupSource = metallicOscillators.at(-1)?.oscillator || source;
    cleanupSource.onended = cleanup;
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
