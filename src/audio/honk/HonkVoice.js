import {
  HONK_AUTOMATION_SETTINGS,
  HONK_NOTE_GAIN_SETTINGS,
  HONK_RELEASE_SETTINGS,
  VOICE_GAIN_SETTINGS,
} from "../../config/audio.js";
import { clamp } from "../audioMath.js";
import { FORMANTS, VOWEL_ROUNDNESS } from "./formantData.js";
import { F4_FREQUENCY, getHonkFrequency } from "./pitch.js";

const SILENT_GAIN = 0;
const PARAMETER_EPSILON = 1e-5;

export class HonkVoice {
  constructor({ context, destination, vowel = "A" }) {
    this.context = context;
    this.destination = destination || context.destination;
    this.currentBank = null;
    this.retiringBanks = new Set();
    this.formantNodes = [];
    this.roundnessNode = null;
    this.vowel = null;
    this.pitchBendSemitones = 0;
    this.lastRetriggerToken = 0;
    this.disconnected = false;
    this.disposing = false;
    this.started = false;
    this.lastTargets = {
      frequency: NaN,
      detune: NaN,
      vibratoFrequency: NaN,
      gain: 0,
    };
    this.performanceCounters = {
      parameterTransitions: 0,
      duplicateUpdatesSkipped: 0,
      formantCrossfades: 0,
      formantBanksDisposed: 0,
    };

    this.createNodes();
    this.rebuildFormants(vowel, { initial: true });
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
    setInitialValue(this.source.frequency, F4_FREQUENCY, now);
    this.toneFilter.type = "lowpass";
    setInitialValue(this.toneFilter.frequency, VOICE_GAIN_SETTINGS.toneLowpassFrequency, now);
    setInitialValue(this.toneFilter.Q, VOICE_GAIN_SETTINGS.toneLowpassQ, now);
    this.source.connect(this.toneFilter);

    this.vibrato.type = "sine";
    setInitialValue(this.vibrato.frequency, 5.2, now);
    setInitialValue(this.vibratoGain.gain, 7, now);
    this.vibrato.connect(this.vibratoGain);
    this.vibratoGain.connect(this.source.detune);

    setInitialValue(this.master.gain, SILENT_GAIN, now);
    setInitialValue(this.output.gain, VOICE_GAIN_SETTINGS.outputGain, now);
    this.master.connect(this.output);
    this.output.connect(this.destination);
  }

  start() {
    if (this.started || this.disconnected) return false;
    const now = this.context.currentTime;
    this.source.start(now);
    this.vibrato.start(now);
    this.started = true;
    return true;
  }

  rebuildFormants(vowel, { initial = false } = {}) {
    const normalizedVowel = FORMANTS[vowel] ? vowel : "A";
    if (!initial && this.vowel === normalizedVowel) return false;
    const now = this.context.currentTime;
    const bank = this.createFormantBank(normalizedVowel, initial ? 1 : 0);
    const oldBank = this.currentBank;
    this.currentBank = bank;
    this.formantNodes = bank.formants;
    this.roundnessNode = bank.roundness;
    this.vowel = normalizedVowel;
    if (!oldBank || initial) return true;

    this.performanceCounters.formantCrossfades += 1;
    const fadeSeconds = HONK_AUTOMATION_SETTINGS.formantCrossfadeSeconds;
    smoothAudioParam(bank.output.gain, 1, now, fadeSeconds);
    smoothAudioParam(oldBank.output.gain, 0, now, fadeSeconds);
    this.retiringBanks.add(oldBank);
    while (this.retiringBanks.size > HONK_AUTOMATION_SETTINGS.maxRetiringFormantBanks) {
      const oldest = this.retiringBanks.values().next().value;
      this.disposeFormantBank(oldest);
    }
    const cleanup = () => this.disposeFormantBank(oldBank);
    oldBank.cleanupTimer = globalThis.setTimeout?.(
      cleanup,
      Math.ceil((fadeSeconds + 0.004) * 1000),
    ) ?? null;
    oldBank.cleanupTimer?.unref?.();
    return true;
  }

  createFormantBank(vowel, initialGain) {
    const now = this.context.currentTime;
    const formants = FORMANTS[vowel] || FORMANTS.A;
    const output = this.context.createGain();
    setInitialValue(output.gain, initialGain, now);
    output.connect(this.master);
    const nodes = formants.freq.map((frequency, index) => {
      const filter = this.context.createBiquadFilter();
      const gain = this.context.createGain();
      filter.type = "bandpass";
      setInitialValue(filter.frequency, frequency, now);
      setInitialValue(filter.Q, formants.q[index], now);
      setInitialValue(gain.gain, formants.gain[index], now);
      this.toneFilter.connect(filter);
      filter.connect(gain);
      gain.connect(output);
      return { filter, gain };
    });
    let roundness = null;
    const roundnessSettings = VOWEL_ROUNDNESS[vowel];
    if (roundnessSettings) {
      const filter = this.context.createBiquadFilter();
      const gain = this.context.createGain();
      filter.type = "bandpass";
      setInitialValue(filter.frequency, roundnessSettings.freq, now);
      setInitialValue(filter.Q, roundnessSettings.q, now);
      setInitialValue(gain.gain, roundnessSettings.gain, now);
      this.toneFilter.connect(filter);
      filter.connect(gain);
      gain.connect(output);
      roundness = { filter, gain };
    }
    return { vowel, output, formants: nodes, roundness, cleanupTimer: null };
  }

  disposeFormantBank(bank) {
    if (!bank || bank.disposed) return false;
    bank.disposed = true;
    if (bank.cleanupTimer !== null) {
      globalThis.clearTimeout?.(bank.cleanupTimer);
      bank.cleanupTimer = null;
    }
    disconnectNode(bank.output);
    for (const nodeSet of bank.formants) {
      disconnectNode(this.toneFilter, nodeSet.filter);
      disconnectNode(nodeSet.filter, nodeSet.gain);
      disconnectNode(nodeSet.gain, bank.output);
      disconnectNode(nodeSet.filter);
      disconnectNode(nodeSet.gain);
    }
    if (bank.roundness) {
      disconnectNode(this.toneFilter, bank.roundness.filter);
      disconnectNode(bank.roundness.filter, bank.roundness.gain);
      disconnectNode(bank.roundness.gain, bank.output);
      disconnectNode(bank.roundness.filter);
      disconnectNode(bank.roundness.gain);
    }
    this.retiringBanks.delete(bank);
    this.performanceCounters.formantBanksDisposed += 1;
    return true;
  }

  setVowel(vowel) {
    return this.rebuildFormants(vowel);
  }

  setPitchBend(semitones) {
    this.pitchBendSemitones = Number.isFinite(semitones) ? semitones : 0;
  }

  update({
    hornAmount,
    masterGain = 1,
    leftEar,
    rightEar,
    noteGain = 1,
    pitchBendSemitones = null,
    pitchSnap = null,
    retriggerToken = 0,
  }) {
    if (this.disconnected || this.disposing) return false;
    const now = this.context.currentTime;
    const frequency = getHonkFrequency({ leftEar, rightEar, pitchSnap });
    if (pitchBendSemitones !== null) this.setPitchBend(pitchBendSemitones);
    const detune = this.pitchBendSemitones * 100;
    const gain = Math.max(
      SILENT_GAIN,
      clamp(hornAmount, 0, 1) *
        VOICE_GAIN_SETTINGS.baseGain *
        Math.max(masterGain, 0) *
        clamp(noteGain, 0, 1),
    );
    let changed = false;
    changed = this.scheduleTarget(
      "frequency",
      this.source.frequency,
      frequency,
      now,
      HONK_AUTOMATION_SETTINGS.pitchSmoothingSeconds,
    ) || changed;
    changed = this.scheduleTarget(
      "detune",
      this.source.detune,
      detune,
      now,
      HONK_AUTOMATION_SETTINGS.detuneSmoothingSeconds,
    ) || changed;
    changed = this.scheduleTarget(
      "vibratoFrequency",
      this.vibrato.frequency,
      5.2,
      now,
      HONK_AUTOMATION_SETTINGS.parameterSmoothingSeconds,
    ) || changed;
    const shouldRetrigger = Number.isFinite(retriggerToken) &&
      retriggerToken !== this.lastRetriggerToken &&
      gain > SILENT_GAIN;
    this.lastRetriggerToken = Number.isFinite(retriggerToken)
      ? retriggerToken
      : this.lastRetriggerToken;
    if (shouldRetrigger) {
      changed = this.scheduleRetrigger(gain, now) || changed;
    } else {
      const gainSeconds = gain > this.lastTargets.gain
        ? HONK_AUTOMATION_SETTINGS.gateAttackSeconds
        : HONK_AUTOMATION_SETTINGS.gateReleaseSeconds;
      changed = this.scheduleTarget("gain", this.master.gain, gain, now, gainSeconds) || changed;
    }
    if (!changed) this.performanceCounters.duplicateUpdatesSkipped += 1;
    return changed;
  }

  scheduleTarget(key, parameter, value, now, seconds) {
    if (Math.abs(this.lastTargets[key] - value) <= PARAMETER_EPSILON) return false;
    smoothAudioParam(parameter, value, now, seconds);
    this.lastTargets[key] = value;
    this.performanceCounters.parameterTransitions += 1;
    return true;
  }

  scheduleRetrigger(targetGain, now) {
    holdAudioParam(this.master.gain, now, targetGain);
    const dipAt = now + HONK_AUTOMATION_SETTINGS.retriggerDipSeconds;
    const attackAt = dipAt + HONK_AUTOMATION_SETTINGS.gateAttackSeconds;
    this.master.gain.linearRampToValueAtTime?.(0.0001, dipAt);
    this.master.gain.linearRampToValueAtTime?.(targetGain, attackAt);
    this.lastTargets.gain = targetGain;
    this.performanceCounters.parameterTransitions += 1;
    return true;
  }

  silence(fadeSeconds = HONK_RELEASE_SETTINGS.liveFadeSeconds) {
    if (this.disconnected) return false;
    const requested = Number.isFinite(fadeSeconds)
      ? fadeSeconds
      : HONK_RELEASE_SETTINGS.liveFadeSeconds;
    const safeFade = Math.max(requested, HONK_AUTOMATION_SETTINGS.gateReleaseSeconds);
    if (this.lastTargets.gain === SILENT_GAIN) return false;
    smoothAudioParam(this.master.gain, SILENT_GAIN, this.context.currentTime, safeFade);
    this.lastTargets.gain = SILENT_GAIN;
    this.pitchBendSemitones = 0;
    return true;
  }

  // Kept as a compatibility alias; ordinary note-off no longer destroys the graph.
  release(fadeSeconds = HONK_RELEASE_SETTINGS.liveFadeSeconds, onEnded = null) {
    const changed = this.silence(fadeSeconds);
    onEnded?.();
    return { persistent: true, changed };
  }

  dispose() {
    if (this.disconnected || this.disposing) return false;
    this.disposing = true;
    const now = this.context.currentTime;
    const stopAt = now + HONK_AUTOMATION_SETTINGS.disposeFadeSeconds;
    smoothAudioParam(
      this.master.gain,
      SILENT_GAIN,
      now,
      HONK_AUTOMATION_SETTINGS.disposeFadeSeconds,
    );
    const finish = () => this.disconnect();
    this.source.onended = finish;
    try { this.source.stop(stopAt); } catch { finish(); }
    try { this.vibrato.stop(stopAt); } catch { /* already stopped */ }
    const timer = globalThis.setTimeout?.(
      finish,
      Math.ceil((HONK_AUTOMATION_SETTINGS.disposeFadeSeconds + 0.01) * 1000),
    );
    timer?.unref?.();
    return true;
  }

  disconnect() {
    if (this.disconnected) return;
    this.disconnected = true;
    this.disposeFormantBank(this.currentBank);
    this.currentBank = null;
    while (this.retiringBanks.size > 0) {
      this.disposeFormantBank(this.retiringBanks.values().next().value);
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

  getTrackedAudioNodeCount() {
    let count = 6; // carrier, tone filter, vibrato, vibrato gain, master, output
    if (this.currentBank) count += countFormantBankNodes(this.currentBank);
    for (const bank of this.retiringBanks) count += countFormantBankNodes(bank);
    return count;
  }
}

export function smoothAudioParam(parameter, value, now, durationSeconds) {
  if (!parameter) return false;
  const target = Number.isFinite(value) ? value : 0;
  const duration = Math.max(Number.isFinite(durationSeconds) ? durationSeconds : 0, 0.003);
  if (typeof parameter.cancelAndHoldAtTime === "function") {
    parameter.cancelAndHoldAtTime(now);
  } else {
    const current = Number.isFinite(parameter.value) ? parameter.value : target;
    parameter.cancelScheduledValues?.(now);
    parameter.setValueAtTime?.(current, now);
  }
  parameter.linearRampToValueAtTime?.(target, now + duration);
  return true;
}

function holdAudioParam(parameter, now, fallbackValue) {
  if (typeof parameter?.cancelAndHoldAtTime === "function") {
    parameter.cancelAndHoldAtTime(now);
    return;
  }
  const current = Number.isFinite(parameter?.value) ? parameter.value : fallbackValue;
  parameter?.cancelScheduledValues?.(now);
  parameter?.setValueAtTime?.(current, now);
}

function setInitialValue(parameter, value, now) {
  if (parameter?.setValueAtTime) parameter.setValueAtTime(value, now);
  else if (parameter) parameter.value = value;
}

function disconnectNode(node, destination = undefined) {
  try {
    if (destination) node?.disconnect?.(destination);
    else node?.disconnect?.();
  } catch {
    // Already disconnected.
  }
}

function countFormantBankNodes(bank) {
  return 1 + bank.formants.length * 2 + (bank.roundness ? 2 : 0);
}
