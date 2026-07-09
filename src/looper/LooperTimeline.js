export const LooperActionEventType = {
  Squeeze: "squeeze",
  SqueezeStart: "squeezeStart",
  SqueezeEnd: "squeezeEnd",
  Bend: "bend",
  Vowel: "vowel",
  Nose: "nose",
  EarLeft: "earLeft",
  EarRight: "earRight",
  MorphSnapshot: "morphSnapshot",
  GestureSnapshot: "gestureSnapshot",
  DrumHit: "drumHit",
};

export const ACTION_FIELDS = ["squeeze", "bend", "earLeft", "earRight", "nose", "vowel"];
export const NUMERIC_ACTION_FIELDS = ["squeeze", "bend", "earLeft", "earRight", "nose"];

const EVENT_FIELD_BY_TYPE = {
  [LooperActionEventType.Squeeze]: "squeeze",
  [LooperActionEventType.SqueezeStart]: "squeeze",
  [LooperActionEventType.SqueezeEnd]: "squeeze",
  [LooperActionEventType.Bend]: "bend",
  [LooperActionEventType.Vowel]: "vowel",
  [LooperActionEventType.Nose]: "nose",
  [LooperActionEventType.EarLeft]: "earLeft",
  [LooperActionEventType.EarRight]: "earRight",
};

export function resetActionState(target) {
  for (const field of ACTION_FIELDS) {
    target[field] = undefined;
  }
  return target;
}

export function createActionState(values = null) {
  const state = {
    squeeze: undefined,
    bend: undefined,
    earLeft: undefined,
    earRight: undefined,
    nose: undefined,
    vowel: undefined,
  };
  if (values) {
    copyActionState(state, values);
  }
  return state;
}

export function copyActionState(target, source = null) {
  resetActionState(target);
  if (!source) {
    return target;
  }

  for (const field of ACTION_FIELDS) {
    if (source[field] !== undefined) {
      target[field] = source[field];
    }
  }
  return target;
}

export function cloneActionState(source = null) {
  return createActionState(source);
}

export function hasActionValue(state, field) {
  return state?.[field] !== undefined && state?.[field] !== null;
}

function cloneValues(values) {
  if (!values) {
    return null;
  }
  const clone = {};
  for (const field of ACTION_FIELDS) {
    if (values[field] !== undefined) {
      clone[field] = values[field];
    }
  }
  return clone;
}

function getEventFieldValue(event, field) {
  if (!event) {
    return undefined;
  }
  if (EVENT_FIELD_BY_TYPE[event.type] === field) {
    return event.value;
  }
  if (
    (event.type === LooperActionEventType.MorphSnapshot ||
      event.type === LooperActionEventType.GestureSnapshot) &&
    event.values?.[field] !== undefined
  ) {
    return event.values[field];
  }
  return undefined;
}

function isDrumHitEvent(event) {
  return event?.type === LooperActionEventType.DrumHit;
}

export class LooperActionEvent {
  constructor({
    id,
    timeMs,
    type,
    value = undefined,
    values = null,
    interpolation = "step",
  }) {
    this.id = id;
    this.timeMs = Math.max(timeMs || 0, 0);
    this.type = type;
    this.value = value;
    this.values = cloneValues(values);
    this.interpolation = interpolation;
  }

  clone() {
    return new LooperActionEvent({
      id: this.id,
      timeMs: this.timeMs,
      type: this.type,
      value: this.value,
      values: this.values,
      interpolation: this.interpolation,
    });
  }
}

export class LooperTrackTimeline {
  constructor({ trackId, nodeId = null, trackIndex = null } = {}) {
    this.trackId = trackId;
    this.nodeId = nodeId;
    this.trackIndex = trackIndex;
    this.active = false;
    this.baselineActionState = createActionState();
    this.events = [];
    this.nextEventId = 1;
    this.sorted = true;
    this.recordedFields = new Set();
  }

  setBaseline(actionState) {
    copyActionState(this.baselineActionState, actionState);
  }

  addFieldEvent(field, timeMs, value, interpolation = "linear") {
    const type = {
      squeeze: LooperActionEventType.Squeeze,
      bend: LooperActionEventType.Bend,
      earLeft: LooperActionEventType.EarLeft,
      earRight: LooperActionEventType.EarRight,
      nose: LooperActionEventType.Nose,
      vowel: LooperActionEventType.Vowel,
    }[field];
    if (!type) {
      return null;
    }
    return this.addEvent(type, timeMs, { value, interpolation });
  }

  addEvent(type, timeMs, { value = undefined, values = null, interpolation = "step" } = {}) {
    const event = new LooperActionEvent({
      id: this.nextEventId,
      type,
      timeMs,
      value,
      values,
      interpolation,
    });
    this.nextEventId += 1;
    this.events.push(event);
    this.markRecordedFields(event);
    this.active = this.events.length > 0;
    this.sorted = false;
    return event;
  }

  addDrumHit(timeMs, drumType) {
    if (!drumType) {
      return null;
    }
    return this.addEvent(LooperActionEventType.DrumHit, timeMs, {
      value: drumType,
      interpolation: "step",
    });
  }

  markRecordedFields(event) {
    const eventField = EVENT_FIELD_BY_TYPE[event.type];
    if (eventField) {
      this.recordedFields.add(eventField);
    }
    if (
      event.type === LooperActionEventType.MorphSnapshot ||
      event.type === LooperActionEventType.GestureSnapshot
    ) {
      for (const field of ACTION_FIELDS) {
        if (event.values?.[field] !== undefined) {
          this.recordedFields.add(field);
        }
      }
    }
  }

  rebuildRecordedFields() {
    this.recordedFields.clear();
    for (const event of this.events) {
      this.markRecordedFields(event);
    }
    this.active = this.events.length > 0;
  }

  hasRecordedField(field) {
    return this.recordedFields.has(field);
  }

  getContentEndMs() {
    let endMs = 0;
    for (const event of this.events) {
      endMs = Math.max(endMs, event.timeMs);
    }
    return endMs;
  }

  sortEvents() {
    if (this.sorted) {
      return;
    }
    const typeOrder = {
      [LooperActionEventType.SqueezeEnd]: 0,
      [LooperActionEventType.Squeeze]: 1,
      [LooperActionEventType.Bend]: 2,
      [LooperActionEventType.MorphSnapshot]: 3,
      [LooperActionEventType.GestureSnapshot]: 4,
      [LooperActionEventType.Vowel]: 5,
      [LooperActionEventType.SqueezeStart]: 6,
      [LooperActionEventType.DrumHit]: 7,
    };
    this.events.sort((first, second) =>
      first.timeMs - second.timeMs ||
      (typeOrder[first.type] ?? 10) - (typeOrder[second.type] ?? 10) ||
      first.id - second.id,
    );
    this.sorted = true;
  }

  normalize(offsetMs) {
    if (!Number.isFinite(offsetMs) || offsetMs <= 0) {
      return;
    }
    for (const event of this.events) {
      event.timeMs = Math.max(event.timeMs - offsetMs, 0);
    }
    this.sorted = false;
  }

  getDrumHitEventsAt(timeMs, epsilon = 0.001) {
    if (!this.active) {
      return [];
    }

    this.sortEvents();
    return this.events.filter(
      (event) => isDrumHitEvent(event) && Math.abs(event.timeMs - timeMs) <= epsilon,
    );
  }

  getDrumHitEventsBetween(startMs, endMs, { includeStart = false, includeEnd = true } = {}) {
    if (!this.active || endMs < startMs) {
      return [];
    }

    this.sortEvents();
    return this.events.filter((event) => {
      if (!isDrumHitEvent(event)) {
        return false;
      }
      const afterStart = includeStart ? event.timeMs >= startMs : event.timeMs > startMs;
      const beforeEnd = includeEnd ? event.timeMs <= endMs : event.timeMs < endMs;
      return afterStart && beforeEnd;
    });
  }

  sample(timeMs, target, { inLoopGap = false } = {}) {
    resetActionState(target);
    if (!this.active) {
      return target;
    }

    this.sortEvents();
    if (inLoopGap) {
      if (this.hasRecordedField("squeeze")) {
        target.squeeze = 0;
      }
      if (this.hasRecordedField("bend")) {
        target.bend = 0;
      }
      return target;
    }

    for (const field of NUMERIC_ACTION_FIELDS) {
      target[field] = this.sampleNumericField(field, timeMs);
    }
    target.vowel = this.sampleStepField("vowel", timeMs);
    return target;
  }

  sampleNumericField(field, timeMs) {
    if (!this.hasRecordedField(field)) {
      return undefined;
    }

    let previousEvent = null;
    let previousValue = undefined;
    let nextEvent = null;
    let nextValue = undefined;

    for (const event of this.events) {
      const value = getEventFieldValue(event, field);
      if (value === undefined) {
        continue;
      }
      if (event.timeMs <= timeMs) {
        previousEvent = event;
        previousValue = value;
        continue;
      }
      nextEvent = event;
      nextValue = value;
      break;
    }

    if (previousValue === undefined) {
      return undefined;
    }
    if (
      previousEvent?.interpolation !== "linear" ||
      nextValue === undefined ||
      !nextEvent ||
      nextEvent.timeMs <= previousEvent.timeMs
    ) {
      return previousValue;
    }

    const t = (timeMs - previousEvent.timeMs) / (nextEvent.timeMs - previousEvent.timeMs);
    return previousValue + (nextValue - previousValue) * Math.min(Math.max(t, 0), 1);
  }

  sampleStepField(field, timeMs) {
    if (!this.hasRecordedField(field)) {
      return undefined;
    }

    let latestValue = undefined;
    for (const event of this.events) {
      if (event.timeMs > timeMs) {
        break;
      }
      const value = getEventFieldValue(event, field);
      if (value !== undefined) {
        latestValue = value;
      }
    }
    return latestValue;
  }

  clone() {
    const timeline = new LooperTrackTimeline({
      trackId: this.trackId,
      nodeId: this.nodeId,
      trackIndex: this.trackIndex,
    });
    timeline.active = this.active;
    timeline.baselineActionState = cloneActionState(this.baselineActionState);
    timeline.events = this.events.map((event) => event.clone());
    timeline.nextEventId = this.nextEventId;
    timeline.sorted = this.sorted;
    timeline.rebuildRecordedFields();
    return timeline;
  }
}

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

  stopRecording(now, minDurationMs = 1, loopGapMs = 0) {
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

  addActionEvent(trackId, { nodeId = null, trackIndex = null, type, timeMs, value, values, interpolation } = {}) {
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

  addFieldEvent(trackId, field, timeMs, value, {
    nodeId = null,
    trackIndex = null,
    interpolation = "linear",
  } = {}) {
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
    const timeline = new LooperTimeline();
    timeline.durationMs = this.durationMs;
    timeline.contentEndMs = this.contentEndMs;
    timeline.loopGapMs = this.loopGapMs;
    timeline.startedAtMs = 0;
    timeline.recording = false;
    for (const [trackId, track] of this.tracks) {
      timeline.tracks.set(trackId, track.clone());
    }
    return timeline;
  }
}
