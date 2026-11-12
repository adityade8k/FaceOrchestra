// Beat equality tolerance only (less than one nanosecond at lesson tempo).
export const BEAT_EQUALITY_EPSILON = 1e-9;
export const nextBeatAfter = (position) => Math.floor(position + BEAT_EQUALITY_EPSILON) + 1;

export function hasBeatGrid(timing) {
  return Boolean(
    (timing?.connected || timing?.internal) &&
    timing.beatIntervalMs > 0 &&
    Number.isFinite(timing.beatOriginMs) &&
    Number.isFinite(timing.beatPosition),
  );
}
