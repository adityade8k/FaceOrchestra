import { resetActionState } from "./actionState.js";
import { LooperTrackTimeline } from "./LooperTrackTimeline.js";

export const LOOPER_TIMELINE_SCHEMA_VERSION = 3;
export const LooperTimingMode = Object.freeze({
  Ordinary: "ordinary",
  Metronome: "metronome",
});
const DEFAULT_BEAT_INTERVAL_MS = 500;

export class LooperTimeline {
  constructor() {
    this.durationMs = 0;
    this.contentEndMs = 0;
    this.recordedDurationMs = 0;
    this.beatIntervalMs = 0;
    this.timingMode = LooperTimingMode.Ordinary;
    this.beatAnalysis = null;
    this.gapBeats = 0;
    this.startedAtMs = 0;
    this.recording = false;
    this.firstOnsetElapsedMs = null;
    this.recordingBeatOriginMs = null;
    this.tracks = new Map();
  }

  startRecording(now, timing = null) {
    this.clearRecording();
    this.recording = true;
    this.startedAtMs = now;
    if (timing?.beatIntervalMs > 0 && Number.isFinite(timing.beatOriginMs)) {
      this.timingMode = LooperTimingMode.Metronome;
      this.beatIntervalMs = timing.beatIntervalMs;
      this.recordingBeatOriginMs = timing.beatOriginMs;
    }
  }

  markMusicalOnset(elapsedMs) {
    if (!this.recording || this.firstOnsetElapsedMs !== null || !Number.isFinite(elapsedMs)) {
      return false;
    }
    this.firstOnsetElapsedMs = Math.max(elapsedMs, 0);
    return true;
  }

  stopRecording(now, minDurationMs = 1, timing = null) {
    if (!this.recording) {
      return this.hasRecording();
    }

    this.recording = false;
    const firstMusicalOnsetMs = Number.isFinite(this.firstOnsetElapsedMs)
      ? this.firstOnsetElapsedMs
      : this.getFirstMusicalOnsetMs();
    if (!Number.isFinite(firstMusicalOnsetMs)) {
      this.tracks.clear();
      this.recordedDurationMs = 0;
      this.contentEndMs = 0;
      this.durationMs = 0;
      return false;
    }
    this.normalizeToFirstMusicalOnset(firstMusicalOnsetMs);
    this.contentEndMs = this.getMusicalContentEndMs();
    this.discardEventsAfter(this.contentEndMs);
    this.recordedDurationMs = this.contentEndMs;
    this.finalizeDuration(minDurationMs);
    this.sortTracks();
    return this.hasRecording();
  }

  clearRecording() {
    this.durationMs = 0;
    this.contentEndMs = 0;
    this.recordedDurationMs = 0;
    this.beatIntervalMs = 0;
    this.timingMode = LooperTimingMode.Ordinary;
    this.beatAnalysis = null;
    this.gapBeats = 0;
    this.startedAtMs = 0;
    this.recording = false;
    this.firstOnsetElapsedMs = null;
    this.recordingBeatOriginMs = null;
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

  finalizeDuration(minDurationMs = 1) {
    this.contentEndMs = this.getMusicalContentEndMs();
    this.recordedDurationMs = this.contentEndMs;
    const baseDurationMs = Math.max(this.contentEndMs, minDurationMs);
    const gapDurationMs = this.gapBeats * (this.beatIntervalMs || DEFAULT_BEAT_INTERVAL_MS);
    this.durationMs = this.getActiveTrackCount() > 0
      ? baseDurationMs + gapDurationMs
      : 0;
  }

  setGapBeats(beats = 0, minDurationMs = 1) {
    this.gapBeats = Math.min(Math.max(Math.round(beats || 0), 0), 4);
    this.finalizeDuration(minDurationMs);
    return this.gapBeats;
  }

  getContentEndMs() {
    return this.getMusicalContentEndMs();
  }

  getMusicalContentEndMs() {
    let endMs = 0;
    for (const track of this.tracks.values()) {
      if (track.active) {
        endMs = Math.max(endMs, track.getMusicalContentEndMs());
      }
    }
    return endMs;
  }

  getFirstMusicalOnsetMs() {
    let firstOnsetMs = Infinity;
    for (const track of this.tracks.values()) {
      firstOnsetMs = Math.min(firstOnsetMs, track.getFirstMusicalOnsetMs());
    }
    return firstOnsetMs;
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

  normalizeToFirstMusicalOnset(firstOnsetMs = this.getFirstMusicalOnsetMs()) {
    if (!Number.isFinite(firstOnsetMs) || firstOnsetMs <= 0) {
      return;
    }
    for (const track of this.tracks.values()) {
      track.discardEventsBefore(firstOnsetMs);
      track.normalize(firstOnsetMs);
    }
  }


  discardEventsAfter(timeMs) {
    for (const track of this.tracks.values()) track.discardEventsAfter(timeMs);
  }

  sortTracks() {
    for (const track of this.tracks.values()) {
      track.sortEvents();
    }
  }

  isTailPaddingTime(timeMs) {
    return this.durationMs > this.contentEndMs && this.contentEndMs > 0 && timeMs > this.contentEndMs;
  }

  sampleTrack(trackTimeline, timeMs, target) {
    if (!trackTimeline) {
      return resetActionState(target);
    }
    return trackTimeline.sample(timeMs, target, {
      inTailPadding: this.isTailPaddingTime(timeMs),
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
      recordedDurationMs: this.recordedDurationMs,
      beatIntervalMs: this.beatIntervalMs,
      timingMode: this.timingMode,
      beatAnalysis: this.beatAnalysis ? { ...this.beatAnalysis } : null,
      gapBeats: this.gapBeats,
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

    timeline.beatIntervalMs = Math.max(
      Number.isFinite(serialized.beatIntervalMs) ? serialized.beatIntervalMs : 0,
      0,
    );
    timeline.timingMode = serialized.timingMode === LooperTimingMode.Metronome
      ? LooperTimingMode.Metronome
      : LooperTimingMode.Ordinary;
    timeline.beatAnalysis = serialized.beatAnalysis && typeof serialized.beatAnalysis === "object"
      ? { ...serialized.beatAnalysis }
      : null;
    timeline.gapBeats = Math.min(Math.max(Math.round(serialized.gapBeats || 0), 0), 4);
    timeline.contentEndMs = timeline.getMusicalContentEndMs();
    timeline.recordedDurationMs = timeline.contentEndMs;
    timeline.discardEventsAfter(timeline.contentEndMs);
    const gapDurationMs = timeline.gapBeats * (timeline.beatIntervalMs || DEFAULT_BEAT_INTERVAL_MS);
    timeline.durationMs = timeline.getActiveTrackCount() > 0
      ? Math.max(timeline.contentEndMs, 1) + gapDurationMs
      : 0;
    timeline.startedAtMs = 0;
    timeline.recording = false;
    timeline.sortTracks();
    return timeline;
  }
}
