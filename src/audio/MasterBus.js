import { AUDIO_MASTER_BUS_SETTINGS } from "../config/audio.js";

export class MasterBus {
  constructor(settings = AUDIO_MASTER_BUS_SETTINGS) {
    this.settings = settings;
    this.context = null;
    this.input = null;
    this.lowpass = null;
    this.compressor = null;
    this.makeup = null;
    this.limiter = null;
    this.output = null;
  }

  initialize(context) {
    if (!context || (this.input && this.context === context)) {
      return this.input;
    }

    this.disconnect();

    const settings = this.settings;
    const lowpassSettings = settings.lowpass || {};
    const compressorSettings = settings.compressor || {};
    const limiterSettings = settings.limiter || {};
    this.context = context;
    this.input = context.createGain();
    this.lowpass = context.createBiquadFilter();
    this.compressor = context.createDynamicsCompressor();
    this.makeup = context.createGain();
    this.limiter = context.createDynamicsCompressor();
    this.output = context.createGain();

    this.input.gain.value = settings.inputGain ?? 1;
    this.lowpass.type = "lowpass";
    this.lowpass.frequency.value = getSafeLowpassFrequency(
      lowpassSettings.frequency ?? 14000,
      context.sampleRate,
    );
    this.lowpass.Q.value = lowpassSettings.q ?? 0.707;
    configureCompressor(this.compressor, compressorSettings, {
      threshold: -18,
      knee: 18,
      ratio: 8,
      attack: 0.004,
      release: 0.18,
    });
    this.makeup.gain.value = settings.makeupGain ?? 1;
    configureCompressor(this.limiter, limiterSettings, {
      threshold: -1,
      knee: 0,
      ratio: 20,
      attack: 0.001,
      release: 0.08,
    });
    this.output.gain.value = Math.min(Math.max(settings.outputGain ?? 0.94, 0), 1);

    this.input.connect(this.lowpass);
    this.lowpass.connect(this.compressor);
    this.compressor.connect(this.makeup);
    this.makeup.connect(this.limiter);
    this.limiter.connect(this.output);
    this.output.connect(context.destination);
    return this.input;
  }

  disconnect() {
    for (const node of [
      this.input,
      this.lowpass,
      this.compressor,
      this.makeup,
      this.limiter,
      this.output,
    ]) {
      node?.disconnect?.();
    }
    this.context = null;
    this.input = null;
    this.lowpass = null;
    this.compressor = null;
    this.makeup = null;
    this.limiter = null;
    this.output = null;
  }
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
