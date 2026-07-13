import { createActionState } from "./timeline/actionState.js";

export class LooperPlaybackEngine {
  constructor() {
    this.playing = false;
    this.paused = false;
    this.elapsedMs = 0;
    this.lastUpdateMs = 0;
    this.started = false;
    this.trackSnapshots = new Map();
    this.activeTrackIds = new Set();
  }

  start(now, { resume = false } = {}) {
    if (!resume) {
      this.elapsedMs = 0;
      this.started = false;
      this.trackSnapshots.clear();
      this.activeTrackIds.clear();
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
    this.trackSnapshots.clear();
    this.activeTrackIds.clear();
  }

  update(now, timeline, speed = 1, handlers = {}) {
    if (!this.playing || this.paused || !timeline?.hasRecording()) {
      return false;
    }

    const durationMs = Math.max(timeline.durationMs, 1);
    const deltaMs = Math.max(now - this.lastUpdateMs, 0) * Math.max(speed, 0);
    this.lastUpdateMs = now;

    if (!this.started) {
      this.emitSnapshots(timeline, handlers);
      this.emitDrumHitEventsAt(timeline, 0, handlers);
      this.started = true;
    }

    if (deltaMs <= 0) {
      return false;
    }

    let remainingMs = deltaMs;
    let nextElapsedMs = this.elapsedMs;
    let wrapped = false;

    while (remainingMs > 0) {
      const segmentMs = Math.min(remainingMs, durationMs - nextElapsedMs);
      if (segmentMs <= 0) {
        nextElapsedMs = 0;
        wrapped = true;
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
        handlers.onLoopBoundary?.();
        this.emitDrumHitEventsAt(timeline, 0, handlers);
      } else {
        nextElapsedMs = segmentEndMs;
      }
    }

    this.elapsedMs = nextElapsedMs;
    this.emitSnapshots(timeline, handlers);
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
