import { bendCueState } from "./bendCueState.js";
import { getHonkPitchBendRange } from "../config/honk.js";

export function bendGaugeState(event, fraction, observed = null) {
  const preview = fraction < 0;
  const target = bendCueState(event.bend, Math.max(0, fraction), event);
  if (!target) return null;
  const actual =
    !preview && Number.isFinite(observed?.semitones)
      ? observed.semitones
      : null;
  const destination = target.destinationSemitones ?? event.bend.at(-1).semitones;
  const tolerance = (event.assessment?.pitchCents ?? 35) / 100;
  const start = target.startSemitones ?? event.bend[0].semitones;
  const direction = Math.sign(destination - start);
  const status = preview
    ? "Prepare · press Trigger when the square highlights"
    : actual === null
      ? "Waiting for hold"
        : (actual - start) * direction < -tolerance
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
      ? `Prepare ${target.start} · press Trigger when the square highlights · roll ${target.direction} after the hold`
      : target.instruction,
    required: target.semitones,
    actual,
    destinationSemitones: destination,
    tolerance,
    status,
    onTarget: status === "On target",
    demonstration: !preview && observed?.origin === "demonstration",
    range: getHonkPitchBendRange(event),
  };
}
