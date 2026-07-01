export const NASALITY_SETTINGS = {
  oralReductionAtMax: 0.5,
  lowGainAtMax: 0.78,
  highGainAtMax: 0.28,
  highFrequencyLiftAtMax: 150,
};

export const SPATIAL_AUDIO_SETTINGS = {
  masterGain: 0.78,
  directionalFalloff: {
    coneInnerAngle: 35,
    coneOuterAngle: 110,
    coneOuterGain: 0.02,
  },
};

export const AUDIO_MASTER_BUS_SETTINGS = {
  inputGain: 0.9,
  outputGain: 1.64,
  compressor: {
    threshold: -18,
    knee: 18,
    ratio: 8,
    attack: 0.004,
    release: 0.18,
  },
};

export const VOICE_GAIN_SETTINGS = {
  baseGain: 0.42,
  outputGain: 0.9,
  toneLowpassFrequency: 3200,
  toneLowpassQ: 0.45,
};
