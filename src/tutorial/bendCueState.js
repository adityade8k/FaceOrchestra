import { bendAt } from './composition.js';
import { BEND_SENSITIVITY, MAX_PITCH_BEND_SEMITONES } from '../config/honk.js';

export const BEND_PRACTICE_DURATION_MS = 2250;
export function bendCueState(curve, fraction) {
  if (!curve || fraction < 0 || fraction > 1) return null;
  const semitones = bendAt(curve, fraction);
  const phase = fraction <= curve[1].fraction ? 'hold' : fraction >= curve.at(-2).fraction ? 'settle' : 'roll';
  return {semitones, rollRadians:semitones / MAX_PITCH_BEND_SEMITONES / BEND_SENSITIVITY, phase,
    instruction:phase === 'hold' ? 'Hold level · wrist roll follows' : phase === 'settle' ? 'Settle on C · then release' : 'Hold · roll down toward C · settle · release'};
}

// Project the same local Z roll used by getControllerRollBend onto camera-right.
// For an upright controller viewed from behind, negative pitch rotates its top
// right. Reversing the viewing orientation reverses that screen direction.
// Neither handedness nor a hard-coded screen-left/pitch convention is needed.
export function bendCueDisplacement(rollRadians, localRightDotViewRight, localUpDotViewRight) {
  return Math.max(-0.55, Math.min(0.55,
    (-Math.sin(rollRadians)*localRightDotViewRight + (Math.cos(rollRadians)-1)*localUpDotViewRight)*1.7));
}
