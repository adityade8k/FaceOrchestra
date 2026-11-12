import { PERCUSSION_BUS_SETTINGS } from "../../config/audio.js";

// Ver-7's percussion trim and gentle dynamics, kept separate from the louder
// Honk chain. Both paths still meet at the master's final limiter/capture output.
export class PercussionBus {
  constructor(settings = PERCUSSION_BUS_SETTINGS) {
    this.settings = settings;
    this.context = null;
    this.input = null;
    this.highpass = null;
    this.lowpass = null;
    this.compressor = null;
    this.saturator = null;
  }

  initialize(context, destination) {
    if (!context || !destination) return null;
    if (this.context === context && this.input) return this.input;
    this.disconnect();
    this.context = context;
    this.input = context.createGain();
    this.highpass = context.createBiquadFilter();
    this.lowpass = context.createBiquadFilter();
    this.compressor = context.createDynamicsCompressor();
    this.saturator = context.createWaveShaper();
    this.input.gain.value = this.settings.inputGain;
    this.highpass.type = "highpass";
    this.highpass.frequency.value = this.settings.highpassFrequency;
    this.highpass.Q.value = 0.707;
    this.lowpass.type = "lowpass";
    this.lowpass.frequency.value = Math.min(
      this.settings.lowpassFrequency,
      context.sampleRate * 0.45,
    );
    this.lowpass.Q.value = 0.707;
    for (const [key, value] of Object.entries(this.settings.compressor))
      this.compressor[key].value = value;
    const drive = this.settings.saturationDrive,
      normalizer = Math.tanh(drive);
    const curve = new Float32Array(4097);
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * 2 - 1;
      curve[i] = Math.tanh(x * drive) / normalizer;
    }
    this.saturator.curve = curve;
    this.saturator.oversample = "2x";
    this.input.connect(this.highpass);
    this.highpass.connect(this.lowpass);
    this.lowpass.connect(this.compressor);
    this.compressor.connect(this.saturator);
    this.saturator.connect(destination);
    return this.input;
  }

  disconnect() {
    for (const key of ["input", "highpass", "lowpass", "compressor", "saturator"]) {
      this[key]?.disconnect?.();
      this[key] = null;
    }
    this.context = null;
  }
}
