import { Quaternion } from "three";
const qa = new Quaternion(),
  qb = new Quaternion();
export function interpolatePose(a, b, f) {
  if (!a || !b) return a || null;
  qa.fromArray(a.q);
  qb.fromArray(b.q);
  qa.slerp(qb, f);
  return { ...a, p: a.p.map((v, i) => v + (b.p[i] - v) * f), q: qa.toArray() };
}
export function interpolateNode(a, b, f) {
  if (!b || a.x.length !== b.x.length || a.x[10] !== b.x[10] || !a.x[10])
    return a;
  const x = a.x.slice();
  for (let i = 0; i < 10; i++) if (i < 3 || i >= 7) x[i] += (b.x[i] - x[i]) * f;
  qa.fromArray(a.x, 3);
  qb.fromArray(b.x, 3);
  qa.slerp(qb, f).toArray(x, 3);
  for (let i = 11; i < 11 + a.morphs; i++) x[i] += (b.x[i] - x[i]) * f;
  return { ...a, x };
}
export class Timeline {
  constructor(packets, events = [], gaps = []) {
    this.frames = packets
      .map((p) => ({ ...p.data, t: p.t }))
      .sort((a, b) => a.t - b.t);
    this.events = events;
    this.gaps = gaps;
    this.keys = [];
    this.frames.forEach((f, i) => {
      if (f.full) this.keys.push(i);
    });
    if (!this.frames.length || !this.frames[0].full)
      throw new Error(
        "Take has no initial full presentation sample. Recover or select another take.",
      );
    this.duration = this.frames.at(-1).t;
  }
  index(t) {
    let lo = 0,
      hi = this.frames.length;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (this.frames[m].t <= t) lo = m + 1;
      else hi = m;
    }
    return Math.max(0, lo - 1);
  }
  reconstruct(index) {
    let lo = 0,
      hi = this.keys.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.keys[mid] <= index) lo = mid + 1;
      else hi = mid;
    }
    const key = this.keys[Math.max(0, lo - 1)];
    const sequential =
      this.cursor !== undefined && this.cursor <= index && this.cursor >= key;
    let nodes = sequential ? this.state : {};
    for (let i = sequential ? this.cursor + 1 : key; i <= index; i++) {
      const frame = this.frames[i];
      if (frame.full) nodes = {};
      Object.assign(nodes, frame.nodes);
      for (const id of frame.removed || []) delete nodes[id];
    }
    this.cursor = index;
    this.state = nodes;
    // Interpolation and callers own their returned map, never the cursor state.
    nodes = { ...nodes };
    return nodes;
  }
  seek(t) {
    const index = this.index(t),
      a = this.frames[index],
      b = this.frames[index + 1];
    const nodes = this.reconstruct(index);
    const gap = this.gaps.some(
      (g) => g.stream === "samples" && g.start <= (b?.t ?? t) && g.end >= a.t,
    );
    const continuous =
      b && a.segment === b.segment && !gap && b.t - a.t < 0.25 && t >= a.t;
    const f = continuous
      ? Math.max(0, Math.min(1, (t - a.t) / (b.t - a.t)))
      : 0;
    let xr = a.xr;
    if (f > 0) {
      const next = { ...nodes, ...b.nodes };
      for (const id of b.removed || []) delete next[id];
      for (const id in nodes)
        nodes[id] = interpolateNode(nodes[id], next[id], f);
      xr = {
        viewer: interpolatePose(a.xr.viewer, b.xr.viewer, f),
        controllers: a.xr.controllers.map((c) => {
          const d = b.xr.controllers.find(
            (v) =>
              v.handedness === c.handedness &&
              v.profiles.join() === c.profiles.join(),
          );
          return d
            ? {
                ...c,
                grip: interpolatePose(c.grip, d.grip, f),
                ray: interpolatePose(c.ray, d.ray, f),
              }
            : c;
        }),
      };
    }
    if (t < a.t)
      return {
        nodes: {},
        xr: { viewer: null, controllers: [] },
        segment: a.segment,
        t,
        gap: true,
      };
    return { nodes, xr, segment: a.segment, t, gap };
  }
}
