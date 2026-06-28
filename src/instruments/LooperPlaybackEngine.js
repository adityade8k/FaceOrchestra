import { LooperEventType, LooperTimeline } from "./LooperTimeline.js";

export class LooperPlaybackEngine {
  constructor() {
    this.playing = false;
    this.paused = false;
    this.elapsedMs = 0;
    this.lastUpdateMs = 0;
    this.cursor = 0;
    this.activeNotes = new Map();
    this.trackSamples = new Map();
    this.started = false;
  }

  start(now, { resume = false } = {}) {
    if (!resume) {
      this.elapsedMs = 0;
      this.cursor = 0;
      this.activeNotes.clear();
      this.trackSamples.clear();
      this.started = false;
    }
    this.playing = true;
    this.paused = false;
    this.lastUpdateMs = now;
  }

  pause(handlers = {}) {
    if (!this.playing || this.paused) {
      return;
    }
    this.releaseActiveNotes(handlers);
    this.playing = false;
    this.paused = true;
  }

  stop(handlers = {}) {
    this.releaseActiveNotes(handlers);
    this.playing = false;
    this.paused = false;
    this.elapsedMs = 0;
    this.lastUpdateMs = 0;
    this.cursor = 0;
    this.trackSamples.clear();
    this.started = false;
  }

  update(now, timeline, speed = 1, handlers = {}) {
    if (!this.playing || this.paused || !timeline?.hasRecording()) {
      return false;
    }

    const durationMs = Math.max(timeline.durationMs, 1);
    const events = timeline.getSortedEvents();
    const deltaMs = Math.max(now - this.lastUpdateMs, 0) * Math.max(speed, 0);
    this.lastUpdateMs = now;

    if (!this.started) {
      this.processRange(events, 0, 0, true, handlers);
      this.started = true;
    }

    if (deltaMs <= 0) {
      return false;
    }

    let nextElapsedMs = this.elapsedMs + deltaMs;
    let wrapped = false;

    while (nextElapsedMs >= durationMs) {
      this.processRange(events, this.elapsedMs, durationMs, false, handlers);
      this.releaseActiveNotes(handlers);
      handlers.onLoopBoundary?.();
      nextElapsedMs -= durationMs;
      this.elapsedMs = 0;
      this.cursor = 0;
      this.trackSamples.clear();
      wrapped = true;
      this.processRange(events, 0, 0, true, handlers);
    }

    this.processRange(events, this.elapsedMs, nextElapsedMs, false, handlers);
    this.elapsedMs = nextElapsedMs;
    return wrapped;
  }

  processRange(events, startMs, endMs, includeStart, handlers) {
    while (this.cursor < events.length) {
      const event = events[this.cursor];
      if (event.timeMs > endMs) {
        return;
      }
      const shouldProcess = includeStart
        ? event.timeMs >= startMs
        : event.timeMs > startMs;
      this.cursor += 1;
      if (shouldProcess) {
        this.dispatchEvent(event, handlers);
      }
    }
  }

  dispatchEvent(event, handlers) {
    if (event.sample) {
      this.trackSamples.set(event.trackIndex, LooperTimeline.cloneSample(event.sample));
    }

    if (event.type === LooperEventType.NoteOn) {
      const activeNote = {
        noteId: event.noteId,
        trackIndex: event.trackIndex,
        sample: LooperTimeline.cloneSample(event.sample),
      };
      this.activeNotes.set(event.noteId, activeNote);
      handlers.onNoteOn?.(event, activeNote);
      return;
    }

    if (event.type === LooperEventType.NoteOff) {
      const activeNote = this.activeNotes.get(event.noteId);
      if (activeNote) {
        handlers.onNoteOff?.(event, activeNote);
        this.activeNotes.delete(event.noteId);
      }
      return;
    }

    if (event.type === LooperEventType.Gesture) {
      for (const activeNote of this.activeNotes.values()) {
        if (activeNote.trackIndex === event.trackIndex) {
          activeNote.sample = LooperTimeline.cloneSample(event.sample);
        }
      }
      handlers.onGesture?.(event);
    }
  }

  getActiveNotes() {
    return this.activeNotes.values();
  }

  getTrackSample(trackIndex) {
    return this.trackSamples.get(trackIndex) || null;
  }

  releaseActiveNotes(handlers = {}) {
    for (const activeNote of this.activeNotes.values()) {
      handlers.onReleaseNote?.(activeNote);
    }
    this.activeNotes.clear();
  }
}
