export function bendAt(curve, fraction) {
  if (!curve) return 0;
  for (let i = 1; i < curve.length; i++) {
    const a = curve[i - 1],
      b = curve[i];
    if (fraction <= b.fraction) {
      const t = Math.max(0, Math.min(1, (fraction - a.fraction) / (b.fraction - a.fraction)));
      return a.semitones + (b.semitones - a.semitones) * (t * t * (3 - 2 * t));
    }
  }
  return curve.at(-1).semitones;
}
