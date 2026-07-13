import { AUDIO_MASTER_BUS_SETTINGS } from "../config/audio.js";

export class MasterBus {
  constructor(settings = AUDIO_MASTER_BUS_SETTINGS) {
    this.settings = settings;
    this.context = null;
    this.input = null;
    this.compressor = null;
    this.output = null;
  }

  initialize(context) {
    if (!context || (this.input && this.context === context)) {
      return this.input;
    }

    const settings = this.settings;
    const compressorSettings = settings.compressor || {};
    this.context = context;
    this.input = context.createGain();
    this.compressor = context.createDynamicsCompressor();
    this.output = context.createGain();

    this.input.gain.value = settings.inputGain ?? 1;
    this.compressor.threshold.value = compressorSettings.threshold ?? -18;
    this.compressor.knee.value = compressorSettings.knee ?? 18;
    this.compressor.ratio.value = compressorSettings.ratio ?? 8;
    this.compressor.attack.value = compressorSettings.attack ?? 0.004;
    this.compressor.release.value = compressorSettings.release ?? 0.18;
    this.output.gain.value = settings.outputGain ?? 0.82;

    this.input.connect(this.compressor);
    this.compressor.connect(this.output);
    this.output.connect(context.destination);
    return this.input;
  }
}
