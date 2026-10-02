import { bendCueState } from "./bendCueState.js";
import { MAX_PITCH_BEND_SEMITONES } from "../config/honk.js";

export function bendGaugeState(event, fraction, observed = null) {
  const preview = fraction < 0;
  const target = bendCueState(event.bend, Math.max(0, fraction), event);
  if (!target) return null;
  const actual =
    !preview && Number.isFinite(observed?.semitones)
      ? observed.semitones
      : null;
  const destination = event.bend.at(-1).semitones;
  const tolerance = (event.assessment?.pitchCents ?? 35) / 100;
  const direction = Math.sign(destination - event.bend[0].semitones);
  const status = preview
    ? "Prepare · squeeze as green closes"
    : actual === null
      ? "Waiting for hold"
      : actual * direction < -tolerance
        ? "Wrong direction"
        : (actual - destination) * direction > tolerance
          ? "Overshoot"
          : Math.abs(actual - target.semitones) <= tolerance
            ? "On target"
            : "Follow target";
  return {
    ...target,
    preview,
    phase: preview ? "prepare" : target.phase,
    instruction: preview
      ? `Prepare ${target.start} · squeeze as green closes · roll ${target.direction} after the hold`
      : target.instruction,
    required: target.semitones,
    actual,
    destinationSemitones: destination,
    tolerance,
    status,
    onTarget: status === "On target",
    demonstration: !preview && observed?.origin === "demonstration",
    range: MAX_PITCH_BEND_SEMITONES,
  };
}
