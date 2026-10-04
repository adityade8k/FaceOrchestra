// Partition exact MIDI key gates into supported Looper windows. A boundary may
// occur only when no backing key is held, so there are no fabricated tie attacks.
const LENGTHS = [2, 4, 8, 16];
export function splitPatterns(events, startBeat, endBeat) {
  const total = Math.ceil((endBeat - startBeat) / 2) * 2;
  const clipped = events.filter(e => e.beat < endBeat && e.beat + e.beats > startBeat).map(e => {
    const start = Math.max(e.beat, startBeat), end = Math.min(e.beat + e.beats, endBeat);
    return { ...e, beat: start - startBeat, beats: end - start, ...(start > e.beat ? { carry: true } : {}) };
  });
  const safe = b => !clipped.some(e => e.beat < b - 1e-9 && e.beat + e.beats > b + 1e-9);
  const paths = new Map([[total, { cost: 0, lengths: [] }]]);
  for (let at = total - 2; at >= 0; at -= 2) {
    if (!safe(at)) continue;
    for (const length of LENGTHS) {
      const tail = paths.get(at + length);
      const slice = clipped.filter(e => e.beat >= at - 1e-9 && e.beat < at + length - 1e-9);
      if (!tail || new Set(slice.map(e => e.role)).size > 14) continue;
      const cost = tail.cost + 1 + Math.abs(length - 8) * .04;
      if (!paths.has(at) || cost < paths.get(at).cost) paths.set(at, { cost, lengths: [length, ...tail.lengths] });
    }
  }
  // Short practice excerpts need only one supported window; it can stop early.
  if (!paths.has(0) && total <= 16 && new Set(clipped.map(e => e.role)).size <= 14) {
    const length = LENGTHS.find(n => n >= total);
    paths.set(0, { lengths: [length] });
  }
  if (!paths.has(0)) throw new Error("No lossless Looper partition for this excerpt");
  let at = 0;
  return paths.get(0).lengths.map((beats, index) => {
    const slice = clipped.filter(e => e.beat >= at - 1e-9 && e.beat < at + beats - 1e-9);
    const roles = [...new Set(slice.map(e => e.role))].sort((a, b) =>
      slice.find(e => e.role === a).midi - slice.find(e => e.role === b).midi);
    const middle = Math.min(7, Math.ceil(roles.length / 2));
    const block = { id: `block-${index + 1}`, beat: startBeat + at, beats,
      patterns: [roles.slice(0, middle), roles.slice(middle)].map((group, i) => ({
        lane: i ? "figures" : "foundation", beats,
        events: slice.filter(e => group.includes(e.role)).map(e => ({ ...e, beat: e.beat - at })),
      })) };
    at += beats; return block;
  });
}
