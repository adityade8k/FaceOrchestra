import { resetActionState } from "./actionState.js";
import { LooperTrackTimeline } from "./LooperTrackTimeline.js";

export const LOOPER_TIMELINE_SCHEMA_VERSION = 7;
export const LooperTimingMode = Object.freeze({
  Ordinary: "ordinary",
  Metronome: "metronome",
  Internal: "internal",
});
const DEFAULT_BEAT_INTERVAL_MS = 500;

export class LooperTimeline {
  constructor() {
    this.durationMs = 0;
    this.contentEndMs = 0;
    this.recordedDurationMs = 0;
    this.beatIntervalMs = 0;
    this.sourceBeatIntervalMs = 0;
    this.timingMode = LooperTimingMode.Ordinary;
    this.beatAnalysis = null;
    this.gapBeats = 0;
    this.startedAtMs = 0;
    this.onsetOffsetMs = 0;
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
      this.timingMode = timing.internal ? LooperTimingMode.Internal : LooperTimingMode.Metronome;
      this.sourceBeatIntervalMs = timing.beatIntervalMs;
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
    this.pruneInactiveTracks();
    this.finalizeDuration(minDurationMs);
    this.sortTracks();
    return this.hasRecording();
  }

  clearRecording() {
    this.durationMs = 0;
    this.contentEndMs = 0;
    this.recordedDurationMs = 0;
    this.beatIntervalMs = 0;
    this.sourceBeatIntervalMs = 0;
    this.timingMode = LooperTimingMode.Ordinary;
    this.beatAnalysis = null;
    this.gapBeats = 0;
    this.startedAtMs = 0;
    this.onsetOffsetMs = 0;
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

  pruneInactiveTracks() {
    for (const [trackId, track] of this.tracks) {
      if (!track.active) this.tracks.delete(trackId);
    }
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

  getGateEventsAt(timeMs) {
    return this.collectTrackEvents((track) => track.getGateEventsAt(timeMs));
  }

  getGateEventsBetween(startMs, endMs, options = {}) {
    return this.collectTrackEvents((track) => track.getGateEventsBetween(startMs, endMs, options));
  }

  getPerformanceEventsAt(timeMs) {
    return this.collectTrackEvents((track) => track.getPerformanceEventsAt(timeMs));
  }

  getPerformanceEventsBetween(startMs, endMs, options = {}) {
    return this.collectTrackEvents(
      (track) => track.getPerformanceEventsBetween(startMs, endMs, options),
    );
  }

  collectTrackEvents(getEvents) {
    const entries = [];
    for (const track of this.tracks.values()) {
      if (!track.active) continue;
      for (const event of getEvents(track)) entries.push({ track, event });
    }
    return entries.sort((first, second) =>
      first.event.timeMs - second.event.timeMs ||
      (first.track.trackIndex ?? Number.MAX_SAFE_INTEGER) -
        (second.track.trackIndex ?? Number.MAX_SAFE_INTEGER) ||
      String(first.track.trackId).localeCompare(String(second.track.trackId)) ||
      first.event.id - second.event.id,
    );
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
    {
      nodeId = null,
      trackIndex = null,
      type,
      timeMs,
      value,
      values,
      interpolation,
      synthetic = false,
      gateOnly = false,
      support = false,
      preserveDuration = false,
      releaseOrigin = null,
    } = {},
  ) {
    const track = this.ensureTrack(trackId, { nodeId, trackIndex });
    if (!track || !type) {
      return null;
    }
    return track.addEvent(type, timeMs, {
      value,
      values,
      interpolation,
      synthetic,
      gateOnly,
      support,
      preserveDuration,
      releaseOrigin,
    });
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
    {
      nodeId = null,
      trackIndex = null,
      interpolation = "linear",
      synthetic = false,
      support = false,
    } = {},
  ) {
    const track = this.ensureTrack(trackId, { nodeId, trackIndex });
    if (!track) {
      return null;
    }
    return track.addFieldEvent(field, timeMs, value, interpolation, synthetic, { support });
  }

  finalizeDuration(minDurationMs = 1) {
    // One shared musical origin, independent of clock phase and selected Gap.
    if (!this.recording) this.normalizeToFirstAction();
    this.contentEndMs = this.getContentEndMs();
    this.recordedDurationMs = this.getMusicalOnsetTimes().length
      ? (this.contentEndMs > 0 ? this.contentEndMs : Math.max(minDurationMs, 1)) : 0;
    const gapDurationMs = this.gapBeats * (this.beatIntervalMs || DEFAULT_BEAT_INTERVAL_MS);
    this.durationMs = this.recordedDurationMs > 0 ? this.recordedDurationMs + gapDurationMs : 0;
  }

  setGapBeats(beats = 0, minDurationMs = 1) {
    this.gapBeats = Math.min(Math.max(Math.round(beats || 0), 0), 4);
    this.finalizeDuration(minDurationMs);
    return this.gapBeats;
  }

  getMusicalOnsetTimes() {
    const onsets = [];
    for (const track of this.tracks.values()) {
      if (track.active) {
        onsets.push(...track.getMusicalOnsetTimes());
      }
    }
    return onsets.sort((first, second) => first - second);
  }

  getLastMusicalOnsetMs() {
    return this.getMusicalOnsetTimes().at(-1) ?? -Infinity;
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

  getIntentionalContentEndMs() {
    let endMs = 0;
    for (const track of this.tracks.values()) {
      if (track.active) {
        endMs = Math.max(endMs, track.getIntentionalContentEndMs());
      }
    }
    return endMs;
  }

  getFirstActionMs() {
    return this.getMusicalOnsetTimes()[0] ?? Infinity;
  }

  normalizeToFirstAction() {
    const firstActionMs = this.getFirstActionMs();
    if (!Number.isFinite(firstActionMs)) {
      this.tracks.clear();
      return;
    }
    const endMs = this.getContentEndMs();
    for (const [id, track] of this.tracks) {
      if (!track.getMusicalOnsetTimes().length) this.tracks.delete(id);
      else track.normalize(firstActionMs, endMs);
    }
    // Preserve the original wall-clock coordinates for scoring/diagnostics.
    // Event t corresponds to startedAtMs + onsetOffsetMs + t.
    this.onsetOffsetMs += firstActionMs;
    if (Number.isFinite(this.beatAnalysis?.originMs)) this.beatAnalysis.originMs -= firstActionMs;
    if (Number.isFinite(this.firstOnsetElapsedMs)) this.firstOnsetElapsedMs = Math.max(0, this.firstOnsetElapsedMs - firstActionMs);
  }

  sortTracks() {
    for (const track of this.tracks.values()) {
      track.sortEvents();
    }
  }

  isTailPaddingTime(timeMs) {
    return this.durationMs > this.recordedDurationMs && timeMs >= this.recordedDurationMs;
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
      onsetOffsetMs: this.onsetOffsetMs,
      durationMs: this.durationMs,
      contentEndMs: this.contentEndMs,
      recordedDurationMs: this.recordedDurationMs,
      beatIntervalMs: this.beatIntervalMs,
      sourceBeatIntervalMs: this.sourceBeatIntervalMs,
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
      if (track.trackId && track.active) {
        timeline.tracks.set(track.trackId, track);
      }
    }

    timeline.beatIntervalMs = Math.max(
      Number.isFinite(serialized.beatIntervalMs) ? serialized.beatIntervalMs : 0,
      0,
    );
    timeline.timingMode = [LooperTimingMode.Metronome, LooperTimingMode.Internal].includes(serialized.timingMode)
      ? serialized.timingMode : LooperTimingMode.Ordinary;
    // Only explicit metadata or a legacy external-clock take is a reliable source tempo.
    timeline.sourceBeatIntervalMs = serialized.sourceBeatIntervalMs > 0 ? serialized.sourceBeatIntervalMs
      : serialized.timingMode === LooperTimingMode.Metronome ? timeline.beatIntervalMs : 0;
    timeline.beatAnalysis = serialized.beatAnalysis && typeof serialized.beatAnalysis === "object"
      ? { ...serialized.beatAnalysis }
      : null;
    timeline.gapBeats = Math.min(Math.max(Math.round(serialized.gapBeats || 0), 0), 4);
    // v7 migrates old beat/Stop-padded snapshots from the musical events.
    // Never treat the old saved duration as an instruction to reinsert silence.
    timeline.onsetOffsetMs = Math.max(Number(serialized.onsetOffsetMs) || 0, 0);
    // Only a degenerate zero-length Honk needs its saved nonzero fallback.
    // Positive musical content and all percussion ignore this minimum.
    timeline.finalizeDuration(Number.isFinite(serialized.recordedDurationMs) ? Math.max(serialized.recordedDurationMs, 1) : 1);
    timeline.startedAtMs = 0;
    timeline.recording = false;
    timeline.sortTracks();
    return timeline;
  }
}
