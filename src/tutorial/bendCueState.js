import { bendAt } from "../compositions/jog/definition.js";
import { BEND_SENSITIVITY, MAX_PITCH_BEND_SEMITONES } from "../config/honk.js";

export const BEND_PRACTICE_DURATION_MS = 2250;
export function bendCueState(curve, fraction, event = {}) {
  if (!curve || curve.length < 2 || fraction < 0 || fraction > 1) return null;
  if (event.bendStyle === "melody") return melodyBendCueState(curve, fraction, event);
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

// A melodic hold can turn several times and end back on its starting pitch.
// Show the current turn's destination, rather than the entire note's endpoint.
function melodyBendCueState(curve, fraction, event) {
  const semitones = bendAt(curve, fraction);
  const sign = i => Math.sign(curve[i].semitones - curve[i - 1].semitones);
  let right = curve.findIndex(p => p.fraction > fraction);
  if (right < 0) right = curve.length - 1;
  right = Math.max(1, right);
  let from = right - 1, to = right, direction = sign(right), phase = "roll";
  if (!direction) {
    phase = "hold";
    while (to < curve.length - 1 && !sign(to)) to++;
    direction = sign(to);
    if (!direction) phase = "settle";
    from = to - 1;
  } else {
    while (from > 0 && sign(from) === direction) from--;
  }
  while (to < curve.length - 1 && sign(to + 1) === direction && direction) to++;
  const startSemitones = curve[from].semitones;
  const destinationSemitones = curve[to].semitones;
  const label = midi => ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "G♯", "A", "B♭", "B"][(Math.round(midi) % 12 + 12) % 12] + (Math.floor(Math.round(midi) / 12) - 1);
  const base = event.midi ?? event.midis?.[0];
  const start = label(base + startSemitones), destination = label(base + destinationSemitones);
  const word = direction < 0 ? "down" : "up";
  return {
    semitones, rollRadians: semitones / MAX_PITCH_BEND_SEMITONES / BEND_SENSITIVITY,
    phase, direction: word, amount: Math.abs(destinationSemitones - startSemitones),
    start, destination, startSemitones, destinationSemitones,
    instruction: phase === "settle"
      ? `Hold ${destination} · keep Trigger held until release`
      : phase === "hold"
        ? `Hold ${start} · keep Trigger held; bend ${word} toward ${destination} next`
        : `Bend ${word} toward ${destination} · follow the triangle · keep Trigger held`,
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
