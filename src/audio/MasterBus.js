import { AUDIO_MASTER_BUS_SETTINGS } from "../config/audio.js";

export class MasterBus {
  constructor(settings = AUDIO_MASTER_BUS_SETTINGS) {
    this.settings = settings;
    this.context = null;
    this.input = null;
    this.honkInput = null;
    this.percussionInput = null;
    this.metronomeInput = null;
    this.highpass = null;
    this.lowpass = null;
    this.compressor = null;
    this.makeup = null;
    this.saturator = null;
    this.limiter = null;
    this.output = null;
  }

  initialize(context) {
    if (!context || (this.input && this.context === context)) return this.input;
    this.disconnect();
    const settings = this.settings;
    const busSettings = settings.buses || {};
    this.context = context;
    this.input = context.createGain();
    this.honkInput = createBusInput(context, busSettings.honk ?? 0.62);
    this.percussionInput = createBusInput(context, busSettings.percussion ?? 0.48);
    this.metronomeInput = createBusInput(context, busSettings.metronome ?? 0.24);
    this.highpass = context.createBiquadFilter();
    this.lowpass = context.createBiquadFilter();
    this.compressor = context.createDynamicsCompressor();
    this.makeup = context.createGain();
    this.saturator = settings.saturation?.enabled && context.createWaveShaper
      ? context.createWaveShaper()
      : null;
    this.limiter = context.createDynamicsCompressor();
    this.output = context.createGain();

    this.input.gain.value = settings.inputGain ?? 0.78;
    this.highpass.type = "highpass";
    this.highpass.frequency.value = Math.max(settings.highpass?.frequency ?? 18, 10);
    this.highpass.Q.value = settings.highpass?.q ?? 0.707;
    this.lowpass.type = "lowpass";
    this.lowpass.frequency.value = getSafeLowpassFrequency(
      settings.lowpass?.frequency ?? 15500,
      context.sampleRate,
    );
    this.lowpass.Q.value = settings.lowpass?.q ?? 0.707;
    configureCompressor(this.compressor, settings.compressor || {}, {
      threshold: -12,
      knee: 12,
      ratio: 2.5,
      attack: 0.012,
      release: 0.16,
    });
    this.makeup.gain.value = Math.min(Math.max(settings.makeupGain ?? 1, 0), 1.5);
    if (this.saturator) {
      this.saturator.curve = createSoftSaturationCurve(settings.saturation?.drive ?? 1.15);
      this.saturator.oversample = "2x";
    }
    configureCompressor(this.limiter, settings.limiter || {}, {
      threshold: -1.5,
      knee: 0,
      ratio: 20,
      attack: 0.001,
      release: 0.06,
    });
    this.output.gain.value = Math.min(Math.max(settings.outputGain ?? 0.92, 0), 1);

    this.honkInput.connect(this.input);
    this.percussionInput.connect(this.input);
    this.metronomeInput.connect(this.input);
    this.input.connect(this.highpass);
    this.highpass.connect(this.lowpass);
    this.lowpass.connect(this.compressor);
    this.compressor.connect(this.makeup);
    if (this.saturator) {
      this.makeup.connect(this.saturator);
      this.saturator.connect(this.limiter);
    } else {
      this.makeup.connect(this.limiter);
    }
    this.limiter.connect(this.output);
    this.output.connect(context.destination);
    return this.input;
  }

  getInput(kind = "master") {
    if (kind === "honk" || kind === "music") return this.honkInput || this.input;
    if (kind === "percussion") return this.percussionInput || this.input;
    if (kind === "metronome") return this.metronomeInput || this.input;
    return this.input;
  }

  disconnect() {
    for (const node of [
      this.honkInput,
      this.percussionInput,
      this.metronomeInput,
      this.input,
      this.highpass,
      this.lowpass,
      this.compressor,
      this.makeup,
      this.saturator,
      this.limiter,
      this.output,
    ]) node?.disconnect?.();
    this.context = null;
    this.input = null;
    this.honkInput = null;
    this.percussionInput = null;
    this.metronomeInput = null;
    this.highpass = null;
    this.lowpass = null;
    this.compressor = null;
    this.makeup = null;
    this.saturator = null;
    this.limiter = null;
    this.output = null;
  }
}

function createBusInput(context, gain) {
  const input = context.createGain();
  input.gain.value = Math.min(Math.max(Number.isFinite(gain) ? gain : 1, 0), 1);
  return input;
}

function configureCompressor(node, settings, defaults) {
  node.threshold.value = settings.threshold ?? defaults.threshold;
  node.knee.value = settings.knee ?? defaults.knee;
  node.ratio.value = settings.ratio ?? defaults.ratio;
  node.attack.value = settings.attack ?? defaults.attack;
  node.release.value = settings.release ?? defaults.release;
}

function getSafeLowpassFrequency(requestedFrequency, sampleRate) {
  const nyquistSafetyFrequency = Number.isFinite(sampleRate) ? sampleRate * 0.45 : Infinity;
  return Math.max(20, Math.min(requestedFrequency, nyquistSafetyFrequency));
}

function createSoftSaturationCurve(drive) {
  const curve = new Float32Array(256);
  const safeDrive = Math.max(Number.isFinite(drive) ? drive : 1, 0.01);
  const normalization = Math.tanh(safeDrive);
  for (let index = 0; index < curve.length; index += 1) {
    const input = (index / (curve.length - 1)) * 2 - 1;
    curve[index] = Math.tanh(input * safeDrive) / normalization;
  }
  return curve;
}
