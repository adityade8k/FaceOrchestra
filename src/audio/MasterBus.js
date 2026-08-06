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

    this.disconnect();

    const settings = this.settings;
    const compressorSettings = settings.compressor || {};
    this.context = context;
    this.input = context.createGain();
    this.compressor = context.createDynamicsCompressor();
    this.output = context.createGain();

    this.input.gain.value = settings.inputGain ?? 1;
    configureCompressor(this.compressor, compressorSettings, {
      threshold: -18,
      knee: 18,
      ratio: 8,
      attack: 0.004,
      release: 0.18,
    });
    this.output.gain.value = settings.outputGain ?? 0.82;

    this.input.connect(this.compressor);
    this.compressor.connect(this.output);
    this.output.connect(context.destination);
    return this.input;
  }

  disconnect() {
    for (const node of [this.input, this.compressor, this.output]) {
      node?.disconnect?.();
    }
    this.context = null;
    this.input = null;
    this.compressor = null;
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
