import { createActionState } from "./timeline/actionState.js";

export function getNextBeatStart(now, timing) {
  const intervalMs = timing?.beatIntervalMs;
  const beatOriginMs = timing?.beatOriginMs;
  if (!(intervalMs > 0) || !Number.isFinite(beatOriginMs)) {
    return now;
  }
  const beatIndex = Math.floor((now - beatOriginMs) / intervalMs + 1e-9) + 1;
  return beatOriginMs + beatIndex * intervalMs;
}

export class LooperPlaybackEngine {
  constructor() {
    this.playing = false;
    this.paused = false;
    this.elapsedMs = 0;
    this.lastUpdateMs = 0;
    this.started = false;
    this.clockElapsedMs = null;
    this.trackSnapshots = new Map();
    this.activeTrackIds = new Set();
  }

  start(now, { resume = false } = {}) {
    if (!resume) {
      this.elapsedMs = 0;
      this.started = false;
      this.trackSnapshots.clear();
      this.activeTrackIds.clear();
      this.clockElapsedMs = null;
    }
    this.playing = true;
    this.paused = false;
    this.lastUpdateMs = now;
  }

  pause(handlers = {}) {
    if (!this.playing || this.paused) {
      return;
    }
    this.releaseTracks(handlers);
    this.playing = false;
    this.paused = true;
  }

  stop(handlers = {}) {
    this.releaseTracks(handlers);
    this.playing = false;
    this.paused = false;
    this.elapsedMs = 0;
    this.lastUpdateMs = 0;
    this.started = false;
    this.clockElapsedMs = null;
    this.trackSnapshots.clear();
    this.activeTrackIds.clear();
  }

  update(now, timeline, rate = 1, handlers = {}) {
    if (!this.playing || this.paused || !timeline?.hasRecording()) {
      return false;
    }

    if (!this.started && now < this.lastUpdateMs) {
      return false;
    }

    const deltaMs = Math.max(now - this.lastUpdateMs, 0) * Math.max(rate, 0);
    this.lastUpdateMs = now;
    this.clockElapsedMs = null;

    if (!this.started) {
      this.emitSnapshots(timeline, handlers);
      this.emitDrumHitEventsAt(timeline, 0, handlers);
      this.started = true;
    }

    if (deltaMs <= 0) {
      return false;
    }

    const wrapped = this.advanceBy(deltaMs, timeline, handlers);
    this.emitSnapshots(timeline, handlers);
    return wrapped;
  }

  updateFromClock(totalElapsedMs, timeline, handlers = {}) {
    if (!this.playing || this.paused || !timeline?.hasRecording()) return false;
    const authoritativeElapsedMs = Math.max(Number.isFinite(totalElapsedMs) ? totalElapsedMs : 0, 0);
    if (!this.started) {
      this.elapsedMs = 0;
      this.emitSnapshots(timeline, handlers);
      this.emitDrumHitEventsAt(timeline, 0, handlers);
      this.started = true;
      this.clockElapsedMs = 0;
    }
    const previousClockElapsedMs = Math.max(this.clockElapsedMs ?? 0, 0);
    const deltaMs = Math.max(authoritativeElapsedMs - previousClockElapsedMs, 0);
    this.clockElapsedMs = authoritativeElapsedMs;
    if (deltaMs <= 0) return false;
    const wrapped = this.advanceBy(deltaMs, timeline, handlers);
    const durationMs = Math.max(timeline.durationMs, 1);
    this.elapsedMs = ((authoritativeElapsedMs % durationMs) + durationMs) % durationMs;
    this.emitSnapshots(timeline, handlers);
    return wrapped;
  }

  advanceBy(deltaMs, timeline, handlers = {}) {
    const durationMs = Math.max(timeline.durationMs, 1);
    let remainingMs = deltaMs;
    let nextElapsedMs = this.elapsedMs;
    let wrapped = false;

    while (remainingMs > 0) {
      const segmentMs = Math.min(remainingMs, durationMs - nextElapsedMs);
      if (segmentMs <= 0) {
        nextElapsedMs = 0;
        wrapped = true;
        this.releaseTracks(handlers);
        handlers.onLoopBoundary?.();
        this.emitDrumHitEventsAt(timeline, 0, handlers);
        continue;
      }
      const segmentEndMs = nextElapsedMs + segmentMs;
      this.emitDrumHitEventsBetween(timeline, nextElapsedMs, segmentEndMs, handlers);
      remainingMs -= segmentMs;

      if (segmentEndMs >= durationMs) {
        nextElapsedMs = 0;
        wrapped = true;
        this.releaseTracks(handlers);
        handlers.onLoopBoundary?.();
        this.emitDrumHitEventsAt(timeline, 0, handlers);
      } else {
        nextElapsedMs = segmentEndMs;
      }
    }

    this.elapsedMs = nextElapsedMs;
    return wrapped;
  }

  emitDrumHitEventsAt(timeline, timeMs, handlers = {}) {
    for (const { track, event } of timeline.getDrumHitEventsAt?.(timeMs) || []) {
      handlers.onDrumHit?.(track, event, timeMs);
    }
  }

  emitDrumHitEventsBetween(timeline, startMs, endMs, handlers = {}) {
    for (const { track, event } of timeline.getDrumHitEventsBetween?.(startMs, endMs) || []) {
      handlers.onDrumHit?.(track, event, event.timeMs);
    }
  }

  emitSnapshots(timeline, handlers = {}) {
    this.activeTrackIds.clear();
    timeline.forEachActiveTrack((trackTimeline) => {
      this.activeTrackIds.add(trackTimeline.trackId);
      const snapshot = this.getMutableSnapshot(trackTimeline.trackId);
      timeline.sampleTrack(trackTimeline, this.elapsedMs, snapshot);
      handlers.onTrackSnapshot?.(trackTimeline, snapshot, this.elapsedMs);
    });

    for (const trackId of this.trackSnapshots.keys()) {
      if (!this.activeTrackIds.has(trackId)) {
        handlers.onReleaseTrack?.(trackId);
        this.trackSnapshots.delete(trackId);
      }
    }
  }

  getMutableSnapshot(trackId) {
    let snapshot = this.trackSnapshots.get(trackId);
    if (!snapshot) {
      snapshot = createActionState();
      this.trackSnapshots.set(trackId, snapshot);
    }
    return snapshot;
  }

  getTrackSnapshot(trackId) {
    return this.trackSnapshots.get(trackId) || null;
  }

  releaseTracks(handlers = {}) {
    for (const trackId of this.trackSnapshots.keys()) {
      handlers.onReleaseTrack?.(trackId);
    }
    this.trackSnapshots.clear();
  }
}
