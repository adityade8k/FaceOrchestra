import { resetActionState } from "./actionState.js";
import { LooperTrackTimeline } from "./LooperTrackTimeline.js";

export const LOOPER_TIMELINE_SCHEMA_VERSION = 1;

export class LooperTimeline {
  constructor() {
    this.durationMs = 0;
    this.contentEndMs = 0;
    this.loopGapMs = 0;
    this.startedAtMs = 0;
    this.recording = false;
    this.tracks = new Map();
  }

  startRecording(now) {
    this.clearRecording();
    this.recording = true;
    this.startedAtMs = now;
  }

  stopRecording(_now, minDurationMs = 1, loopGapMs = 0) {
    if (!this.recording) {
      return this.hasRecording();
    }

    this.recording = false;
    this.normalizeToFirstAction();
    this.setLoopGap(loopGapMs, minDurationMs);
    this.sortTracks();
    return this.hasRecording();
  }

  clearRecording() {
    this.durationMs = 0;
    this.contentEndMs = 0;
    this.loopGapMs = 0;
    this.startedAtMs = 0;
    this.recording = false;
    this.tracks.clear();
  }

  hasRecording() {
    return this.durationMs > 0 && this.getActiveTrackCount() > 0;
  }

  getActiveTrackCount() {
    let count = 0;
    for (const track of this.tracks.values()) {
      if (track.active) {
        count += 1;
      }
    }
    return count;
  }

  getElapsedMs(now) {
    return Math.max(now - this.startedAtMs, 0);
  }

  ensureTrack(trackId, { nodeId = null, trackIndex = null } = {}) {
    if (!trackId) {
      return null;
    }
    let track = this.tracks.get(trackId);
    if (!track) {
      track = new LooperTrackTimeline({ trackId, nodeId, trackIndex });
      this.tracks.set(trackId, track);
    }
    if (nodeId !== null) {
      track.nodeId = nodeId;
    }
    if (trackIndex !== null) {
      track.trackIndex = trackIndex;
    }
    return track;
  }

  getTrack(trackId) {
    return this.tracks.get(trackId) || null;
  }

  getActiveTracks() {
    const tracks = [];
    for (const track of this.tracks.values()) {
      if (track.active) {
        tracks.push(track);
      }
    }
    tracks.sort((first, second) =>
      (first.trackIndex ?? 0) - (second.trackIndex ?? 0) ||
      String(first.trackId).localeCompare(String(second.trackId)),
    );
    return tracks;
  }

  forEachActiveTrack(callback) {
    for (const track of this.tracks.values()) {
      if (track.active) {
        callback(track);
      }
    }
  }

  getDrumHitEventsAt(timeMs) {
    const events = [];
    for (const track of this.tracks.values()) {
      if (!track.active) {
        continue;
      }
      for (const event of track.getDrumHitEventsAt(timeMs)) {
        events.push({ track, event });
      }
    }
    return this.sortDrumHitEntries(events);
  }

  getDrumHitEventsBetween(startMs, endMs, options = {}) {
    const events = [];
    for (const track of this.tracks.values()) {
      if (!track.active) {
        continue;
      }
      for (const event of track.getDrumHitEventsBetween(startMs, endMs, options)) {
        events.push({ track, event });
      }
    }
    return this.sortDrumHitEntries(events);
  }

  sortDrumHitEntries(events) {
    return events.sort((first, second) =>
      first.event.timeMs - second.event.timeMs ||
      (first.track.trackIndex ?? Number.MAX_SAFE_INTEGER) -
        (second.track.trackIndex ?? Number.MAX_SAFE_INTEGER) ||
      String(first.track.trackId).localeCompare(String(second.track.trackId)) ||
      first.event.id - second.event.id,
    );
  }

  addActionEvent(
    trackId,
    { nodeId = null, trackIndex = null, type, timeMs, value, values, interpolation } = {},
  ) {
    const track = this.ensureTrack(trackId, { nodeId, trackIndex });
    if (!track || !type) {
      return null;
    }
    return track.addEvent(type, timeMs, { value, values, interpolation });
  }

  addDrumHitEvent(trackId, { nodeId = null, trackIndex = null, timeMs, drumType } = {}) {
    const track = this.ensureTrack(trackId, { nodeId, trackIndex });
    if (!track) {
      return null;
    }
    return track.addDrumHit(timeMs, drumType);
  }

  addFieldEvent(
    trackId,
    field,
    timeMs,
    value,
    { nodeId = null, trackIndex = null, interpolation = "linear" } = {},
  ) {
    const track = this.ensureTrack(trackId, { nodeId, trackIndex });
    if (!track) {
      return null;
    }
    return track.addFieldEvent(field, timeMs, value, interpolation);
  }

  setLoopGap(loopGapMs = 0, minDurationMs = 1) {
    this.loopGapMs = Math.max(loopGapMs || 0, 0);
    this.contentEndMs = this.getContentEndMs();
    this.durationMs = this.getActiveTrackCount() > 0
      ? Math.max(this.contentEndMs + this.loopGapMs, minDurationMs)
      : 0;
  }

  getContentEndMs() {
    let endMs = 0;
    for (const track of this.tracks.values()) {
      if (track.active) {
        endMs = Math.max(endMs, track.getContentEndMs());
      }
    }
    return endMs;
  }

  getFirstActionMs() {
    let firstActionMs = Infinity;
    for (const track of this.tracks.values()) {
      for (const event of track.events) {
        firstActionMs = Math.min(firstActionMs, event.timeMs);
      }
    }
    return firstActionMs;
  }

  normalizeToFirstAction() {
    const firstActionMs = this.getFirstActionMs();
    if (!Number.isFinite(firstActionMs) || firstActionMs <= 0) {
      return;
    }
    for (const track of this.tracks.values()) {
      track.normalize(firstActionMs);
    }
  }

  sortTracks() {
    for (const track of this.tracks.values()) {
      track.sortEvents();
    }
  }

  isLoopGapTime(timeMs) {
    return this.loopGapMs > 0 && this.contentEndMs > 0 && timeMs > this.contentEndMs;
  }

  sampleTrack(trackTimeline, timeMs, target) {
    if (!trackTimeline) {
      return resetActionState(target);
    }
    return trackTimeline.sample(timeMs, target, {
      inLoopGap: this.isLoopGapTime(timeMs),
    });
  }

  clone() {
    return LooperTimeline.fromJSON(this.toJSON());
  }

  toJSON() {
    this.sortTracks();
    return {
      schemaVersion: LOOPER_TIMELINE_SCHEMA_VERSION,
      durationMs: this.durationMs,
      contentEndMs: this.contentEndMs,
      loopGapMs: this.loopGapMs,
      tracks: [...this.tracks.values()].map((track) => track.toJSON()),
    };
  }

  static fromJSON(serialized = {}) {
    const timeline = new LooperTimeline();
    const serializedTracks = Array.isArray(serialized.tracks)
      ? serialized.tracks
      : Object.values(serialized.tracks || {});

    for (const serializedTrack of serializedTracks) {
      const track = LooperTrackTimeline.fromJSON(serializedTrack);
      if (track.trackId) {
        timeline.tracks.set(track.trackId, track);
      }
    }

    timeline.loopGapMs = Math.max(
      Number.isFinite(serialized.loopGapMs) ? serialized.loopGapMs : 0,
      0,
    );
    timeline.contentEndMs = timeline.getContentEndMs();
    const minimumSerializedDuration = Number.isFinite(serialized.durationMs)
      ? Math.max(serialized.durationMs, 0)
      : 0;
    timeline.durationMs = timeline.getActiveTrackCount() > 0
      ? Math.max(timeline.contentEndMs + timeline.loopGapMs, minimumSerializedDuration)
      : 0;
    timeline.startedAtMs = 0;
    timeline.recording = false;
    timeline.sortTracks();
    return timeline;
  }
}
