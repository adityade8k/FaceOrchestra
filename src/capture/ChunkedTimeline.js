import { Timeline } from "./Timeline.js";

// Long-take presentation cache. Exact export/seek awaits ensure(); interactive
// rendering gets null while a range loads, never an invented/interpolated pose.
export class ChunkedTimeline {
  constructor(
    index,
    events,
    gaps,
    loadRange,
    { maxChunks = 3, maxPoses = 256, maxRequests = 2, onReady = () => {} } = {},
  ) {
    Object.assign(this, {
      indexData: index,
      events,
      gaps,
      loadRange,
      maxChunks,
      maxPoses,
      maxRequests,
      onReady,
    });
    this.duration = index.duration;
    this.frames = [{ t: index.chunks[0].t, segment: index.chunks[0].segment }];
    this.cache = new Map();
    this.pending = new Map();
    this.poses = new Map();
    this.revision = 0;
    this.requests = 0;
    this.waiters = [];
  }
  async withRequest(operation) {
    if (this.requests >= this.maxRequests)
      await new Promise((resolve) => this.waiters.push(resolve));
    else this.requests++;
    try {
      if (this.disposed) throw new DOMException("Take closed", "AbortError");
      return await operation();
    } finally {
      const next = this.waiters.shift();
      if (next) next();
      else this.requests--;
    }
  }
  chunkAt(t) {
    const chunks = this.indexData.chunks;
    let lo = 0,
      hi = chunks.length;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (chunks[m].t <= t) lo = m + 1;
      else hi = m;
    }
    return Math.max(0, lo - 1);
  }
  async ensure(t) {
    const index = this.chunkAt(t);
    if (this.cache.has(index)) return;
    if (this.pending.has(index)) return this.pending.get(index);
    const chunks = this.indexData.chunks,
      current = chunks[index],
      next = chunks[index + 1];
    // Include the following keyframe chunk for exact interpolation at its edge.
    const operation = this.withRequest(() =>
      this.loadRange(current.offset, next?.end ?? current.end),
    )
      .then((packets) => {
        if (this.disposed) return;
        this.cache.set(index, new Timeline(packets, [], this.gaps));
        while (this.cache.size > this.maxChunks)
          this.cache.delete(this.cache.keys().next().value);
        this.revision++;
        this.onReady();
      })
      .finally(() => this.pending.delete(index));
    this.pending.set(index, operation);
    return operation;
  }
  seek(t) {
    const index = this.chunkAt(t),
      timeline = this.cache.get(index);
    if (!timeline) {
      this.ensure(t).catch((error) => this.onError?.(error));
      return null;
    }
    this.cache.delete(index);
    this.cache.set(index, timeline);
    return timeline.seek(t);
  }
  poseAt(t) {
    if (this.poses.has(t)) return this.poses.get(t);
    const frame = this.seek(t);
    if (!frame) return null;
    const pose = { ...frame, nodes: {} };
    this.poses.set(t, pose);
    while (this.poses.size > this.maxPoses)
      this.poses.delete(this.poses.keys().next().value);
    return pose;
  }
  dispose() {
    this.disposed = true;
    this.onDispose?.();
    this.cache.clear();
    this.poses.clear();
  }
}
