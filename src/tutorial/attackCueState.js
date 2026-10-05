// Expected Trigger timing, independent of when the learner actually presses.
// The same score beat drives preview controllers, backing and these cues.
export function attackCueState(beat, event, { nextBeat, prepareStartBeat = event.beat - 1 } = {}) {
  const elapsed = beat - event.beat;
  if (elapsed < 0) {
    if (event.beat !== nextBeat) return null;
    // The next target keeps its white circle. During its final preparation beat,
    // yellow shrinks to the same small radius as the attack.
    const preparing = beat >= prepareStartBeat;
    return { phase: preparing ? "prepare" : "next", green: 0,
      yellow: preparing ? .08 - 1.27 * elapsed / (event.beat - prepareStartBeat) : 0, red: 0, reference: 1.35 };
  }
  if (elapsed >= event.beats) return null;
  return {
    phase: "hold",
    green: 0,
    // Continuous through the attack minimum, then grows to red at release.
    yellow: .08 + .92 * elapsed / event.beats,
    red: 1,
    reference: 0,
  };
}
