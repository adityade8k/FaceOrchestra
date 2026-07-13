import { clamp, mapLinear } from "../audioMath.js";

export const F4_FREQUENCY = 349.23;

export const PITCH_SNAP_STEPS = {
  cMajor: [-5, -3, -1, 0, 2, 4, 6, 7],
  fNaturalMinor: [-5, -4, -2, 0, 2, 3, 5, 7],
};

export function snapToPitchSteps(value, steps) {
  if (!Array.isArray(steps) || steps.length === 0) {
    return value;
  }

  return steps.reduce(
    (closest, step) => (Math.abs(step - value) < Math.abs(closest - value) ? step : closest),
    steps[0],
  );
}

export function getPitchSemitones(leftEar, pitchSnap = null) {
  const pitchControl = clamp(leftEar, -1, 1);
  const rawPitchSemitones =
    pitchControl < 0
      ? mapLinear(pitchControl, -1, 0, -5, 0)
      : mapLinear(pitchControl, 0, 1, 0, 7);
  const snapSteps = PITCH_SNAP_STEPS[pitchSnap];
  return snapSteps ? snapToPitchSteps(rawPitchSemitones, snapSteps) : rawPitchSemitones;
}

export function getOctave(rightEar) {
  return mapLinear(clamp(rightEar, -1, 1), -1, 1, 2, 6);
}

export function getHonkFrequency({ leftEar, rightEar, pitchSnap = null }) {
  const pitchSemitones = getPitchSemitones(leftEar, pitchSnap);
  const octave = getOctave(rightEar);
  return F4_FREQUENCY * 2 ** (pitchSemitones / 12) * 2 ** (octave - 4);
}
