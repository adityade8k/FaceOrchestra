import * as THREE from "three";
import { NASALITY_SETTINGS } from "../config/audio.js";

export const FORMANTS = {
  A: { freq: [800, 1300, 2500], gain: [1.0, 0.62, 0.28], q: [10, 16, 18] },
  E: { freq: [460, 1900, 2600], gain: [0.85, 0.88, 0.32], q: [12, 18, 20] },
  I: { freq: [300, 2300, 3000], gain: [0.74, 1.0, 0.42], q: [14, 20, 22] },
  O: { freq: [500, 820, 2350], gain: [1.2, 1.05, 0.18], q: [15, 20, 22] },
  U: { freq: [310, 720, 2050], gain: [1.12, 1.0, 0.12], q: [17, 22, 24] },
};

export const VOWEL_ROUNDNESS = {
  O: { freq: 610, gain: 0.34, q: 10 },
  U: { freq: 420, gain: 0.42, q: 12 },
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
  }

  async ensureAudio() {
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AudioContextClass();
    }

    if (this.audioCtx.state === "suspended") {
      await this.audioCtx.resume();
    }
  }

  async start(voiceId = "main") {
    await this.ensureAudio();

    if (this.voices.has(voiceId) || this.startingVoices.has(voiceId)) {
      return;
    }

    this.startingVoices.add(voiceId);
    const now = this.audioCtx.currentTime;
    const source = this.audioCtx.createOscillator();
    const vibrato = this.audioCtx.createOscillator();
    const vibratoGain = this.audioCtx.createGain();
    const master = this.audioCtx.createGain();
    const output = this.audioCtx.createGain();
    const panner = this.audioCtx.createPanner();
    const oralMix = this.audioCtx.createGain();
    const nasalLow = this.audioCtx.createBiquadFilter();
    const nasalLowGain = this.audioCtx.createGain();
    const nasalHigh = this.audioCtx.createBiquadFilter();
    const nasalHighGain = this.audioCtx.createGain();

    source.type = "sawtooth";
    source.frequency.setValueAtTime(F4_FREQUENCY, now);

    vibrato.type = "sine";
    vibrato.frequency.setValueAtTime(5.2, now);
    vibratoGain.gain.setValueAtTime(7, now);
    vibrato.connect(vibratoGain);
    vibratoGain.connect(source.detune);

    master.gain.setValueAtTime(0.0001, now);
    output.gain.setValueAtTime(5.8, now);
    oralMix.gain.setValueAtTime(1, now);

    oralMix.connect(master);
    master.connect(output);
    output.connect(panner);
    panner.connect(this.audioCtx.destination);

    panner.panningModel = "HRTF";
    panner.distanceModel = "linear";
    panner.refDistance = 1;
    panner.maxDistance = 10000;
    panner.rolloffFactor = 0;
    panner.coneInnerAngle = 90;
    panner.coneOuterAngle = 220;
    panner.coneOuterGain = 0.22;

    nasalLow.type = "bandpass";
    nasalLow.frequency.setValueAtTime(260, now);
    nasalLow.Q.setValueAtTime(7, now);
    nasalLowGain.gain.setValueAtTime(0.0001, now);

    nasalHigh.type = "bandpass";
    nasalHigh.frequency.setValueAtTime(1150, now);
    nasalHigh.Q.setValueAtTime(13, now);
    nasalHighGain.gain.setValueAtTime(0.0001, now);

    source.connect(nasalLow);
    nasalLow.connect(nasalLowGain);
    nasalLowGain.connect(master);

    source.connect(nasalHigh);
    nasalHigh.connect(nasalHighGain);
    nasalHighGain.connect(master);

    const voice = {
      source,
      vibrato,
      vibratoGain,
      master,
      output,
      panner,
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
      this.disconnectNode(voice.source, nodeSet.filter);
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
      voice.source.connect(filter);
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
      voice.source.connect(filter);
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
    const gain = Math.max(0.0001, hornAmount * 0.72 * Math.max(masterGain, 0));

    voice.source.frequency.setTargetAtTime(frequency, now, 0.035);
    voice.source.detune.setTargetAtTime(detune, now, 0.045);
    voice.vibrato.frequency.setTargetAtTime(5.2, now, 0.06);
    voice.master.gain.setTargetAtTime(gain, now, 0.035);
    voice.oralMix.gain.setTargetAtTime(1 - nasalAmount * NASALITY_SETTINGS.oralReductionAtMax, now, 0.05);
    voice.nasalLowGain.gain.setTargetAtTime(0.0001 + nasalAmount * NASALITY_SETTINGS.lowGainAtMax, now, 0.05);
    voice.nasalHigh.frequency.setTargetAtTime(1150 + nasalAmount * NASALITY_SETTINGS.highFrequencyLiftAtMax, now, 0.05);
    voice.nasalHighGain.gain.setTargetAtTime(0.0001 + nasalAmount * NASALITY_SETTINGS.highGainAtMax, now, 0.05);
  }

  updateListener({ position, forward, up }) {
    if (!this.audioCtx) {
      return;
    }

    const listener = this.audioCtx.listener;
    const now = this.audioCtx.currentTime;

    this.setAudioParam(listener.positionX, position.x, now);
    this.setAudioParam(listener.positionY, position.y, now);
    this.setAudioParam(listener.positionZ, position.z, now);
    this.setAudioParam(listener.forwardX, forward.x, now);
    this.setAudioParam(listener.forwardY, forward.y, now);
    this.setAudioParam(listener.forwardZ, forward.z, now);
    this.setAudioParam(listener.upX, up.x, now);
    this.setAudioParam(listener.upY, up.y, now);
    this.setAudioParam(listener.upZ, up.z, now);

    if (typeof listener.setPosition === "function") {
      listener.setPosition(position.x, position.y, position.z);
    }
    if (typeof listener.setOrientation === "function") {
      listener.setOrientation(forward.x, forward.y, forward.z, up.x, up.y, up.z);
    }
  }

  updateSpatial(voiceId = "main", { position, orientation, settings }) {
    const voice = this.voices.get(voiceId);
    if (!voice || !this.audioCtx) {
      return;
    }

    const now = this.audioCtx.currentTime;
    const panner = voice.panner;
    const directional = settings?.directionalFalloff || {};

    panner.distanceModel = "linear";
    panner.refDistance = 1;
    panner.maxDistance = 10000;
    panner.rolloffFactor = 0;
    panner.coneInnerAngle = directional.coneInnerAngle ?? 90;
    panner.coneOuterAngle = directional.coneOuterAngle ?? 220;
    panner.coneOuterGain = directional.coneOuterGain ?? 0.22;

    this.setAudioParam(panner.positionX, position.x, now);
    this.setAudioParam(panner.positionY, position.y, now);
    this.setAudioParam(panner.positionZ, position.z, now);
    this.setAudioParam(panner.orientationX, orientation.x, now);
    this.setAudioParam(panner.orientationY, orientation.y, now);
    this.setAudioParam(panner.orientationZ, orientation.z, now);

    if (typeof panner.setPosition === "function") {
      panner.setPosition(position.x, position.y, position.z);
    }
    if (typeof panner.setOrientation === "function") {
      panner.setOrientation(orientation.x, orientation.y, orientation.z);
    }
  }

  setAudioParam(param, value, time) {
    if (param?.setTargetAtTime) {
      param.setTargetAtTime(value, time, 0.025);
    }
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
    this.disconnectNode(voice.vibrato);
    this.disconnectNode(voice.vibratoGain);
    this.disconnectNode(voice.nasalLow);
    this.disconnectNode(voice.nasalLowGain);
    this.disconnectNode(voice.nasalHigh);
    this.disconnectNode(voice.nasalHighGain);
    this.disconnectNode(voice.oralMix);
    this.disconnectNode(voice.master);
    this.disconnectNode(voice.output);
    this.disconnectNode(voice.panner);
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
