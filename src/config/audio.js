export const NASALITY_SETTINGS = {
  oralReductionAtMax: 0.5,
  lowGainAtMax: 0.78,
  highGainAtMax: 0.28,
  highFrequencyLiftAtMax: 150,
};

export const HONK_MASTER_GAIN = 0.78;

export const AUDIO_MASTER_BUS_SETTINGS = {
  inputGain: 0.9,
  outputGain: 0.82,
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

export const STICK_PERCUSSION_TYPES = {
  boink: "boink",
  hihat: "hihat",
};

export const STICK_PERCUSSION_SETTINGS = {
  boink: {
    gain: 0.72,
    startFrequency: 150,
    endFrequency: 54,
    pitchDropSeconds: 0.11,
    bodySeconds: 0.24,
    clickGain: 0.18,
    clickFrequency: 900,
    clickSeconds: 0.035,
  },
  hihat: {
    gain: 0.38,
    noiseSeconds: 0.105,
    highpassFrequency: 6100,
    bandpassFrequency: 9600,
    bandpassQ: 1.6,
    metallicGain: 0.08,
    metallicFrequencies: [6720, 8140, 10320],
  },
};
