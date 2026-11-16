// Rebuilt from authoritative world-space squeeze spheres every update. Reusing
// the workspace never caches a transform: teleports and changing radii remain
// visible within the same update. The callback avoids allocating pair tuples.
export class ContactSweep {
  constructor() {
    this.entries = [];
    this.pool = [];
  }

  forEach(spheres, observe) {
    const entries = this.entries;
    entries.length = 0;
    for (let i = 0; i < spheres.length; i++) {
      const s = spheres[i];
      if (!s?.center?.every(Number.isFinite) || !Number.isFinite(s.radius) || s.radius <= 0)
        continue;
      const slot = entries.length;
      const entry = (this.pool[slot] ||= {});
      entry.i = i;
      entry.min = s.center[0] - s.radius;
      entry.max = s.center[0] + s.radius;
      entry.s = s;
      entries.push(entry);
    }
    entries.sort(compareEntries);
    for (let a = 0; a < entries.length; a++) {
      const first = entries[a];
      for (let b = a + 1; b < entries.length && entries[b].min <= first.max; b++) {
        const second = entries[b],
          sum = first.s.radius + second.s.radius;
        if (
          Math.abs(first.s.center[1] - second.s.center[1]) > sum ||
          Math.abs(first.s.center[2] - second.s.center[2]) > sum
        )
          continue;
        if (first.i < second.i) observe(first.i, second.i);
        else observe(second.i, first.i);
      }
    }
  }

  clear() {
    this.entries.length = 0;
    this.pool.length = 0;
  }
}

function compareEntries(a, b) {
  return a.min - b.min || a.i - b.i;
}
