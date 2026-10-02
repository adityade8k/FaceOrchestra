import { bendAt } from "./composition.js";
import { BEND_SENSITIVITY, MAX_PITCH_BEND_SEMITONES } from "../config/honk.js";

export const BEND_PRACTICE_DURATION_MS = 2250;
export function bendCueState(curve, fraction, event = {}) {
  if (!curve || fraction < 0 || fraction > 1) return null;
  const semitones = bendAt(curve, fraction);
  const phase =
    fraction <= curve[1].fraction
      ? "hold"
      : fraction >= curve.at(-2).fraction
        ? "settle"
        : "roll";
  const base =
      event.midi ?? (event.midis?.length === 1 ? event.midis[0] : undefined),
    change = curve.at(-1).semitones - curve[0].semitones;
  const direction = change >= 0 ? "up" : "down",
    amount = Math.abs(change);
  const label = (midi) =>
    ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "G♯", "A", "B♭", "B"][
      ((Math.round(midi) % 12) + 12) % 12
    ] +
    (Math.floor(midi / 12) - 1);
  const start = Number.isFinite(base)
    ? label(base + curve[0].semitones)
    : "the starting pitch";
  const destination = Number.isFinite(base)
    ? label(base + curve.at(-1).semitones)
    : "the target pitch";
  return {
    semitones,
    rollRadians: semitones / MAX_PITCH_BEND_SEMITONES / BEND_SENSITIVITY,
    phase,
    direction,
    amount,
    start,
    destination,
    instruction:
      phase === "hold"
        ? `Hold level on ${start} · keep Trigger held; roll ${direction} next`
        : phase === "settle"
          ? `Settle on ${destination} · keep holding · then release`
          : `Hold · roll ${direction} toward ${destination} · ${amount} semitone${amount === 1 ? "" : "s"} · keep Trigger held · settle`,
  };
}

// Project the same local Z roll used by getControllerRollBend onto camera-right.
// For an upright controller viewed from behind, negative pitch rotates its top
// right. Reversing the viewing orientation reverses that screen direction.
// Neither handedness nor a hard-coded screen-left/pitch convention is needed.
export function bendCueDisplacement(
  rollRadians,
  localRightDotViewRight,
  localUpDotViewRight,
) {
  return Math.max(
    -0.55,
    Math.min(
      0.55,
      (-Math.sin(rollRadians) * localRightDotViewRight +
        (Math.cos(rollRadians) - 1) * localUpDotViewRight) *
        1.7,
    ),
  );
}
