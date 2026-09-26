// Rebuilt from authoritative world-space squeeze spheres every update. A
// conservative sweep handles teleports, parent changes and changing radii.
// No transform revision contract is required; exact overlap remains unchanged.
export function* contactCandidates(spheres) {
  const entries = [];
  for (let i = 0; i < spheres.length; i++) {
    const s = spheres[i];
    if (
      s?.center?.every(Number.isFinite) &&
      Number.isFinite(s.radius) &&
      s.radius > 0
    )
      entries.push({
        i,
        min: s.center[0] - s.radius,
        max: s.center[0] + s.radius,
        s,
      });
  }
  entries.sort((a, b) => a.min - b.min || a.i - b.i);
  for (let a = 0; a < entries.length; a++) {
    const first = entries[a];
    for (
      let b = a + 1;
      b < entries.length && entries[b].min <= first.max;
      b++
    ) {
      const second = entries[b],
        sum = first.s.radius + second.s.radius;
      if (
        Math.abs(first.s.center[1] - second.s.center[1]) > sum ||
        Math.abs(first.s.center[2] - second.s.center[2]) > sum
      )
        continue;
      yield first.i < second.i ? [first.i, second.i] : [second.i, first.i];
    }
  }
}
