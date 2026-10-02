// Green closes at attack. Yellow grows from zero to the fixed white reference
// over the hold, then disappears at release. Both share the same unit radius.
export function timingCueState(beat, event, { percussion = false } = {}) {
  const elapsed = beat - event.beat;
  const hold = percussion ? 0.1 : event.beats;
  if (elapsed < -1 || elapsed >= hold) return null;
  if (elapsed < 0)
    return { phase: "prepare", green: -elapsed * 1.35, yellow: 0 };
  return {
    phase: percussion ? "strike" : "hold",
    green: 0,
    yellow: elapsed / hold,
  };
}
