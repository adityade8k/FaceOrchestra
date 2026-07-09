export const NASALITY_SETTINGS = {
  oralReductionAtMax: 0.5,
  lowGainAtMax: 0.78,
  highGainAtMax: 0.28,
  highFrequencyLiftAtMax: 150,
};

export const HONK_MASTER_GAIN = 0.78;

export const AUDIO_MASTER_BUS_SETTINGS = {
  inputGain: 0.9,
  outputGain: 6.56,
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
    gain: 0.9,
    startFrequency: 118,
    endFrequency: 74,
    pitchDropSeconds: 0.08,
    bodyAttackSeconds: 0.004,
    bodySeconds: 0.58,
    subGain: 0.34,
    subStartFrequency: 66,
    subEndFrequency: 52,
    subPitchDropSeconds: 0.2,
    subSeconds: 0.68,
    shellGain: 0.46,
    shellStartFrequency: 218,
    shellEndFrequency: 146,
    shellPitchDropSeconds: 0.12,
    shellSeconds: 0.42,
    malletGain: 0.26,
    malletSeconds: 0.048,
    malletFilterFrequency: 360,
    malletFilterQ: 0.9,
    bodyDrive: 1.28,
    bodyToneFrequency: 1380,
    roomGain: 0.18,
    roomDelaySeconds: 0.052,
    roomFeedback: 0.26,
    roomDampingFrequency: 560,
    roomTailSeconds: 0.26,
    clickGain: 0.055,
    clickFrequency: 920,
    clickSeconds: 0.018,
  },
  hihat: {
    gain: 0.46,
    noiseGain: 0.72,
    noiseSeconds: 0.13,
    noiseAttackSeconds: 0.0015,
    highpassFrequency: 4800,
    bandpassFrequency: 8800,
    bandpassQ: 3.4,
    airGain: 0.28,
    airHighpassFrequency: 11200,
    metallicGain: 0.18,
    metallicAttackSeconds: 0.0025,
    metallicDecaySeconds: 0.24,
    metallicFrequencies: [3260, 4120, 5140, 6640, 8270, 11280],
    metallicDetuneCents: [-7, 5, -11, 9, -4, 6],
    metallicEchoGain: 0.14,
    metallicEchoDelaySeconds: 0.045,
    metallicEchoFeedback: 0.32,
    metallicEchoDampingFrequency: 7600,
    metallicEchoTailSeconds: 0.22,
  },
};
