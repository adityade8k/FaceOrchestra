import { AUDIO_MASTER_BUS_SETTINGS } from "../config/audio.js";
import { PercussionBus } from "./percussion/PercussionBus.js";

export class MasterBus {
  constructor(settings = AUDIO_MASTER_BUS_SETTINGS) {
    this.settings = settings;
    this.percussion = new PercussionBus(settings.percussion);
    this.context = null;
    this.input = null;
    this.lowpass = null;
    this.compressor = null;
    this.makeup = null;
    this.limiter = null;
    this.peakGuard = null;
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
    this.peakGuard = context.createWaveShaper();
    this.peakGuard.curve = createPeakGuardCurve();
    this.peakGuard.oversample = "4x";
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
    this.limiter.connect(this.peakGuard);
    this.peakGuard.connect(this.output);
    this.output.connect(context.destination);
    this.percussion.initialize(context, this.limiter);
    return this.input;
  }

  getInput(kind = "master") {
    return kind === "percussion" ? this.percussion.input || this.input : this.input;
  }

  disconnect() {
    this.percussion.disconnect();
    for (const node of [
      this.input,
      this.lowpass,
      this.compressor,
      this.makeup,
      this.limiter,
      this.peakGuard,
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
    this.peakGuard = null;
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

// DynamicsCompressorNode is not a brick-wall limiter: stick transients can
// overshoot full scale. Keep the normal mix linear, then smoothly flatten the
// last 15% before the device would hard-clip it. Odd length preserves exact zero.
function createPeakGuardCurve() {
  const curve = new Float32Array(4097),
    knee = 0.85,
    ceiling = 0.94;
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1,
      magnitude = Math.abs(x);
    const t = Math.max(0, (magnitude - knee) / (1 - knee));
    const y =
      magnitude <= knee
        ? magnitude
        : knee +
          (ceiling - knee) * (3 * t * t - 2 * t * t * t) +
          (1 - knee) * (t * t * t - 2 * t * t + t);
    curve[i] = Math.sign(x) * y;
  }
  return curve;
}
