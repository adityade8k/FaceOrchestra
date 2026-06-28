export const LooperEventType = {
  NoteOn: "noteOn",
  NoteOff: "noteOff",
  Gesture: "gesture",
};

export class LooperEvent {
  constructor({ id, type, timeMs, trackIndex = null, noteId = null, sample = null }) {
    this.id = id;
    this.type = type;
    this.timeMs = Math.max(timeMs || 0, 0);
    this.trackIndex = trackIndex;
    this.noteId = noteId;
    this.sample = sample ? LooperTimeline.cloneSample(sample) : null;
  }

  clone() {
    return new LooperEvent({
      id: this.id,
      type: this.type,
      timeMs: this.timeMs,
      trackIndex: this.trackIndex,
      noteId: this.noteId,
      sample: this.sample,
    });
  }
}

export class LooperTimeline {
  constructor() {
    this.events = [];
    this.trackBaselines = new Map();
    this.durationMs = 0;
    this.startedAtMs = 0;
    this.recording = false;
    this.nextEventId = 1;
    this.nextNoteId = 1;
    this.sorted = true;
  }

  startRecording(now, baselines = []) {
    this.clearRecording();
    this.recording = true;
    this.startedAtMs = now;
    for (const { trackIndex, sample } of baselines) {
      this.setTrackBaseline(trackIndex, sample);
      this.addGesture(trackIndex, 0, sample);
    }
  }

  stopRecording(now, minDurationMs = 1) {
    if (!this.recording) {
      return this.hasRecording();
    }

    this.durationMs = Math.max(now - this.startedAtMs, minDurationMs);
    this.recording = false;
    this.sortEvents();
    return this.hasRecording();
  }

  clearRecording() {
    this.events.length = 0;
    this.trackBaselines.clear();
    this.durationMs = 0;
    this.startedAtMs = 0;
    this.recording = false;
    this.nextEventId = 1;
    this.nextNoteId = 1;
    this.sorted = true;
  }

  hasRecording() {
    return this.durationMs > 0 && this.events.length > 0;
  }

  getElapsedMs(now) {
    return Math.max(now - this.startedAtMs, 0);
  }

  setTrackBaseline(trackIndex, sample) {
    if (trackIndex === null || !sample) {
      return;
    }
    this.trackBaselines.set(trackIndex, LooperTimeline.cloneSample(sample));
  }

  addNoteOn(trackIndex, timeMs, sample) {
    const noteId = this.nextNoteId;
    this.nextNoteId += 1;
    this.addEvent(LooperEventType.NoteOn, timeMs, {
      trackIndex,
      noteId,
      sample,
    });
    return noteId;
  }

  addNoteOff(trackIndex, timeMs, noteId) {
    this.addEvent(LooperEventType.NoteOff, timeMs, {
      trackIndex,
      noteId,
    });
  }

  addGesture(trackIndex, timeMs, sample, noteId = null) {
    this.addEvent(LooperEventType.Gesture, timeMs, {
      trackIndex,
      noteId,
      sample,
    });
  }

  addEvent(type, timeMs, { trackIndex = null, noteId = null, sample = null } = {}) {
    this.events.push(
      new LooperEvent({
        id: this.nextEventId,
        type,
        timeMs,
        trackIndex,
        noteId,
        sample,
      }),
    );
    this.nextEventId += 1;
    this.sorted = false;
  }

  getSortedEvents() {
    this.sortEvents();
    return this.events;
  }

  sortEvents() {
    if (this.sorted) {
      return;
    }
    const typeOrder = {
      [LooperEventType.NoteOff]: 0,
      [LooperEventType.Gesture]: 1,
      [LooperEventType.NoteOn]: 2,
    };
    this.events.sort((first, second) =>
      first.timeMs - second.timeMs ||
      (typeOrder[first.type] ?? 0) - (typeOrder[second.type] ?? 0) ||
      first.id - second.id,
    );
    this.sorted = true;
  }

  clone() {
    const timeline = new LooperTimeline();
    timeline.events = this.events.map((event) => event.clone());
    timeline.trackBaselines = new Map(
      [...this.trackBaselines.entries()].map(([trackIndex, sample]) => [
        trackIndex,
        LooperTimeline.cloneSample(sample),
      ]),
    );
    timeline.durationMs = this.durationMs;
    timeline.startedAtMs = 0;
    timeline.recording = false;
    timeline.nextEventId = this.nextEventId;
    timeline.nextNoteId = this.nextNoteId;
    timeline.sorted = this.sorted;
    return timeline;
  }

  static cloneSample(sample) {
    return sample ? { ...sample } : null;
  }
}
