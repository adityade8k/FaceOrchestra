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
    this.contentEndMs = 0;
    this.loopGapMs = 0;
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

  stopRecording(now, minDurationMs = 1, loopGapMs = 0) {
    if (!this.recording) {
      return this.hasRecording();
    }

    this.recording = false;
    this.normalizeToFirstNote();
    this.setLoopGap(loopGapMs, minDurationMs);
    this.sortEvents();
    return this.hasRecording();
  }

  clearRecording() {
    this.events.length = 0;
    this.trackBaselines.clear();
    this.durationMs = 0;
    this.contentEndMs = 0;
    this.loopGapMs = 0;
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

  setLoopGap(loopGapMs = 0, minDurationMs = 1) {
    this.loopGapMs = Math.max(loopGapMs || 0, 0);
    this.contentEndMs = this.getContentEndMs();
    this.durationMs = this.events.length > 0
      ? Math.max(this.contentEndMs + this.loopGapMs, minDurationMs)
      : 0;
  }

  normalizeToFirstNote() {
    const firstNoteMs = this.getFirstNoteStartMs();
    if (!Number.isFinite(firstNoteMs) || firstNoteMs <= 0) {
      return;
    }

    const baselines = new Map(this.trackBaselines);
    for (const event of this.events) {
      if (event.type === LooperEventType.Gesture && event.sample && event.timeMs <= firstNoteMs) {
        baselines.set(event.trackIndex, LooperTimeline.cloneSample(event.sample));
      }
    }

    this.trackBaselines = baselines;
    this.events = this.events.filter(
      (event) => event.type !== LooperEventType.Gesture || event.timeMs >= firstNoteMs,
    );

    for (const event of this.events) {
      event.timeMs = Math.max(event.timeMs - firstNoteMs, 0);
    }
    this.sorted = false;
  }

  getFirstNoteStartMs() {
    let firstNoteMs = Infinity;
    for (const event of this.events) {
      if (event.type === LooperEventType.NoteOn) {
        firstNoteMs = Math.min(firstNoteMs, event.timeMs);
      }
    }
    return firstNoteMs;
  }

  getContentEndMs() {
    let lastNoteEndMs = -Infinity;
    let lastEventMs = 0;
    for (const event of this.events) {
      lastEventMs = Math.max(lastEventMs, event.timeMs);
      if (event.type === LooperEventType.NoteOff) {
        lastNoteEndMs = Math.max(lastNoteEndMs, event.timeMs);
      }
    }
    return Number.isFinite(lastNoteEndMs) ? lastNoteEndMs : lastEventMs;
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
    timeline.contentEndMs = this.contentEndMs;
    timeline.loopGapMs = this.loopGapMs;
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
