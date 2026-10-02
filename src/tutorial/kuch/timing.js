// Shared by the source score, derived arrangements, playback and assessment.
export const BPM = 92;
export const BEAT_MS = 60000 / BPM;

export const PRACTICE_MIN_BPM = 40;
export const PRACTICE_DEFAULT_BPM = 60;
export const PRACTICE_TEMPOS = Object.freeze([40, 50, 60, 70, 80, BPM]);
export const practiceBpm = (value) =>
  Math.max(
    PRACTICE_MIN_BPM,
    Math.min(BPM, Math.round(Number(value) || PRACTICE_DEFAULT_BPM)),
  );
// Immutable per-attempt snapshot of the metronome's tempo and beat-zero anchor.
export function kuchTiming(bpm = BPM, anchorMs = 0) {
  if (!Number.isFinite(bpm) || bpm <= 0) throw new Error("Invalid Kuch tempo");
  const beatMs = 60000 / bpm;
  return Object.freeze({
    bpm,
    beatMs,
    anchorMs,
    beatAt: (now) => (now - anchorMs) / beatMs,
  });
}
