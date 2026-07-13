import { STICK_PERCUSSION_TYPES } from "../../config/audio.js";
import { INSTRUMENT_KINDS } from "../core/capabilities.js";

export const STICK_PERCUSSION_BY_TARGET_KIND = Object.freeze({
  [INSTRUMENT_KINDS.honk]: STICK_PERCUSSION_TYPES.boink,
  [INSTRUMENT_KINDS.looper]: STICK_PERCUSSION_TYPES.hihat,
});

export function getStickPercussionType(target) {
  return STICK_PERCUSSION_BY_TARGET_KIND[target?.kind] || null;
}

// Live strikes historically play at full configured profile volume. Velocity is
// carried on the semantic event for future expression without changing that mix.
export function getStickStrikeVolume() {
  return 1;
}
