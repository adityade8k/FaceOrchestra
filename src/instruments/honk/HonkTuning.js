export const F4_FREQUENCY = 349.23;
export const F4_MIDI_NOTE = 65;
export const CHROMATIC_NOTE_NAMES = Object.freeze([
  "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B",
]);

export const HONK_PITCH_SNAP_STEPS = Object.freeze({
  cMajor: Object.freeze([-5, -3, -1, 0, 2, 4, 6, 7]),
  fNaturalMinor: Object.freeze([-5, -4, -2, 0, 2, 3, 5, 7]),
});

export function pitchControlFromSemitones(semitonesFromF = 0) {
  return clamp(semitonesFromF < 0 ? semitonesFromF / 5 : semitonesFromF / 7, -1, 1);
}

export function octaveControlFromOffset(octaveOffset = 0) {
  return clamp(octaveOffset / 2, -1, 1);
}

export function semitonesFromPitchControl(pitchControl = 0, pitchSnap = null) {
  const control = clamp(pitchControl, -1, 1);
  const raw = control < 0 ? mapLinear(control, -1, 0, -5, 0) : mapLinear(control, 0, 1, 0, 7);
  const steps = HONK_PITCH_SNAP_STEPS[pitchSnap];
  return steps ? snapToSteps(raw, steps) : raw;
}

export function octaveFromControl(octaveControl = 0) {
  return mapLinear(clamp(octaveControl, -1, 1), -1, 1, 2, 6);
}

export function frequencyFromControls({ pitchControl = 0, octaveControl = 0, pitchSnap = null } = {}) {
  const semitones = semitonesFromPitchControl(pitchControl, pitchSnap);
  const octave = octaveFromControl(octaveControl);
  return F4_FREQUENCY * 2 ** (semitones / 12) * 2 ** (octave - 4);
}

export function createHonkTuning(values = {}) {
  const semitonesFromF = Number.isFinite(values.semitonesFromF) ? values.semitonesFromF : 0;
  const octaveOffset = Number.isFinite(values.octaveOffset) ? values.octaveOffset : 0;
  return {
    note: values.note || values.label || null,
    semitonesFromF,
    octaveOffset,
    pitchControl: Number.isFinite(values.pitchControl)
      ? clamp(values.pitchControl, -1, 1)
      : pitchControlFromSemitones(semitonesFromF),
    octaveControl: Number.isFinite(values.octaveControl)
      ? clamp(values.octaveControl, -1, 1)
      : octaveControlFromOffset(octaveOffset),
    pitchSnap: values.pitchSnap || null,
  };
}

export function noteNameFromControls(pitchControl, octaveControl, pitchSnap = null) {
  const semitones = semitonesFromPitchControl(pitchControl, pitchSnap);
  const octave = octaveFromControl(octaveControl);
  const midi = Math.round(F4_MIDI_NOTE + semitones + (octave - 4) * 12);
  const noteIndex = ((midi % 12) + 12) % 12;
  return `${CHROMATIC_NOTE_NAMES[noteIndex]}${Math.floor(midi / 12) - 1}`;
}

export function snapToSteps(value, steps) {
  return steps.reduce(
    (closest, step) => Math.abs(step - value) < Math.abs(closest - value) ? step : closest,
    steps[0],
  );
}

function mapLinear(value, inMin, inMax, outMin, outMax) {
  return outMin + ((value - inMin) / (inMax - inMin)) * (outMax - outMin);
}

function clamp(value, min, max) {
  const number = Number.isFinite(value) ? value : 0;
  return Math.min(Math.max(number, min), max);
}
