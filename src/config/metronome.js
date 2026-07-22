export const METRONOME_COMPONENT_ID = "metronome";

export const METRONOME_SETTINGS = Object.freeze({
  defaultBpm: 120,
  minBpm: 30,
  maxBpm: 240,
  defaultVolume: 0.7,
  minVolume: 0,
  maxVolume: 1,
  bodyRadius: 0.16,
  controlRadius: 0.055,
  controlHorizontalOffset: 0.25,
  controlTravel: 0.28,
  sphereSegments: 24,
  sphereRings: 16,
  debugOpacity: 0.24,
  renderOrder: 24,
  clickFrequency: 1100,
  clickDurationSeconds: 0.035,
  clickGain: 0.18,
  baseScale: 2.5,
  minScale: 0.5,
  maxScale: 6,
  scaleStep: 0.25,
});

export const METRONOME_LABEL_SETTINGS = Object.freeze({
  color: 0xf7efe2,
  size: 0.055,
  depth: 0.008,
  curveSegments: 4,
  position: Object.freeze({ x: 0, y: 0.25, z: 0 }),
  rotationDegrees: Object.freeze({ x: -18, y: 0, z: 0 }),
});
