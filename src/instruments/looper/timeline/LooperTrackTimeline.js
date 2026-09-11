import {
  NUMERIC_ACTION_FIELDS,
  actionStateToJSON,
  copyActionState,
  createActionState,
  resetActionState,
} from "./actionState.js";
import {
  LooperActionEvent,
  LooperActionEventType,
  getEventFieldValue,
  getRecordedFieldsForEvent,
  isDrumHitEvent,
  isHonkGateEvent,
} from "./LooperActionEvent.js";

const SQUEEZE_ONSET_THRESHOLD = 0.025;

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
    this.fieldEvents = new Map();
    this.gateEvents = [];
    this.performanceEvents = [];
  }

  setBaseline(actionState) {
    copyActionState(this.baselineActionState, actionState);
  }

  addFieldEvent(field, timeMs, value, interpolation = "linear", synthetic = false, metadata = {}) {
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
    return this.addEvent(type, timeMs, { value, interpolation, synthetic, ...metadata });
  }

  addEvent(
    type,
    timeMs,
    {
      value = undefined,
      values = null,
      interpolation = "step",
      synthetic = false,
      gateOnly = false,
      support = false,
      preserveDuration = false,
      releaseOrigin = null,
    } = {},
  ) {
    const event = new LooperActionEvent({
      id: this.nextEventId,
      type,
      timeMs,
      value,
      values,
      interpolation,
      synthetic,
      gateOnly,
      support,
      preserveDuration,
      releaseOrigin,
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
    for (const field of getRecordedFieldsForEvent(event)) {
      this.recordedFields.add(field);
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
      if (!event.support) endMs = Math.max(endMs, event.timeMs);
    }
    return endMs;
  }

  getIntentionalContentEndMs() {
    let endMs = 0;
    for (const event of this.events) {
      if ((!event.synthetic || event.preserveDuration) && !event.support) {
        endMs = Math.max(endMs, event.timeMs);
      }
    }
    return endMs;
  }

  getMusicalOnsetTimes() {
    this.sortEvents();
    const onsets = [];
    let squeezeActive = false;
    const hasDiscreteGateTrack = this.gateEvents.some((event) => event.gateOnly);

    for (const event of this.events) {
      if (isDrumHitEvent(event)) {
        onsets.push(event.timeMs);
        continue;
      }

      if (event.type === LooperActionEventType.SqueezeStart) {
        onsets.push(event.timeMs);
        squeezeActive = true;
        continue;
      }
      if (event.type === LooperActionEventType.SqueezeEnd) {
        squeezeActive = false;
        continue;
      }

      const squeeze = getEventFieldValue(event, "squeeze");
      if (hasDiscreteGateTrack) continue;
      if (squeeze === undefined) {
        continue;
      }

      const active = Number(squeeze) > SQUEEZE_ONSET_THRESHOLD;
      if (
        event.type === LooperActionEventType.SqueezeStart ||
        (active && !squeezeActive)
      ) {
        onsets.push(event.timeMs);
      }
      squeezeActive = active;
    }

    return onsets;
  }

  sortEvents() {
    if (this.sorted) {
      return;
    }
    const typeOrder = {
      [LooperActionEventType.SqueezeEnd]: 0,
      [LooperActionEventType.SqueezeStart]: 1,
      [LooperActionEventType.Squeeze]: 2,
      [LooperActionEventType.Bend]: 3,
      [LooperActionEventType.MorphSnapshot]: 4,
      [LooperActionEventType.GestureSnapshot]: 5,
      [LooperActionEventType.Vowel]: 6,
      [LooperActionEventType.DrumHit]: 7,
    };
    this.events.sort((first, second) =>
      first.timeMs - second.timeMs ||
      (typeOrder[first.type] ?? 10) - (typeOrder[second.type] ?? 10) ||
      first.id - second.id,
    );
    this.sorted = true;
    this.rebuildIndexes();
  }

  rebuildIndexes() {
    this.fieldEvents.clear();
    this.gateEvents = [];
    this.performanceEvents = [];
    for (const event of this.events) {
      if (isHonkGateEvent(event)) this.gateEvents.push(event);
      if (!isDrumHitEvent(event)) this.performanceEvents.push(event);
      for (const field of NUMERIC_ACTION_FIELDS) {
        if (getEventFieldValue(event, field) === undefined) continue;
        const entries = this.fieldEvents.get(field) || [];
        entries.push(event);
        this.fieldEvents.set(field, entries);
      }
      if (getEventFieldValue(event, "vowel") !== undefined) {
        const entries = this.fieldEvents.get("vowel") || [];
        entries.push(event);
        this.fieldEvents.set("vowel", entries);
      }
    }
  }

  getGateEventsAt(timeMs, epsilon = 0.001) {
    this.sortEvents();
    return this.gateEvents.filter((event) => Math.abs(event.timeMs - timeMs) <= epsilon);
  }

  getGateEventsBetween(startMs, endMs, { includeStart = false, includeEnd = true } = {}) {
    this.sortEvents();
    return sliceEventsBetween(this.gateEvents, startMs, endMs, { includeStart, includeEnd });
  }

  getPerformanceEventsAt(timeMs, epsilon = 0.001) {
    this.sortEvents();
    return this.performanceEvents.filter((event) => Math.abs(event.timeMs - timeMs) <= epsilon);
  }

  getPerformanceEventsBetween(startMs, endMs, { includeStart = false, includeEnd = true } = {}) {
    this.sortEvents();
    return sliceEventsBetween(this.performanceEvents, startMs, endMs, { includeStart, includeEnd });
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

  discardEventsBefore(timeMs) {
    this.events = this.events.filter((event) => event.timeMs >= timeMs);
    this.rebuildRecordedFields();
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

  sample(timeMs, target, { inTailPadding = false } = {}) {
    resetActionState(target);
    if (!this.active) {
      return target;
    }

    this.sortEvents();
    if (inTailPadding) {
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
    if (this.gateEvents.some((event) => event.gateOnly) && !this.sampleGateActive(timeMs)) {
      target.squeeze = 0;
    }
    return target;
  }

  sampleGateActive(timeMs) {
    this.sortEvents();
    const event = this.gateEvents[upperBoundByTime(this.gateEvents, timeMs) - 1];
    return event?.type === LooperActionEventType.SqueezeStart;
  }

  sampleNumericField(field, timeMs) {
    if (!this.hasRecordedField(field)) {
      return undefined;
    }

    const events = this.fieldEvents.get(field) || [];
    const nextIndex = upperBoundByTime(events, timeMs);
    let previousEvent = events[nextIndex - 1] || null;
    const nextEvent = events[nextIndex] || null;
    let previousValue = getEventFieldValue(previousEvent, field);
    const nextValue = getEventFieldValue(nextEvent, field);

    if (previousValue === undefined && this.baselineActionState[field] !== undefined) {
      previousValue = this.baselineActionState[field];
      previousEvent = { timeMs: 0, interpolation: "linear", synthetic: false };
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

    // Stop-generated safety resets must not pull the preceding recorded curve
    // toward neutral. They exist only to guarantee release at their timestamp;
    // loop wrapping handles that release when the event is on/outside the end.
    if (nextEvent.synthetic) {
      return previousValue;
    }

    // SqueezeStart/SqueezeEnd are note gates, not automation points. A linear
    // ramp from a release toward the next attack would fill a recorded rest with
    // a gradually rising Honk.
    if (
      field === "squeeze" &&
      (previousEvent.type === LooperActionEventType.SqueezeEnd ||
        nextEvent.type === LooperActionEventType.SqueezeEnd ||
        nextEvent.type === LooperActionEventType.SqueezeStart)
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

    const events = this.fieldEvents.get(field) || [];
    const previousEvent = events[upperBoundByTime(events, timeMs) - 1];
    return getEventFieldValue(previousEvent, field) ?? this.baselineActionState[field];
  }

  clone() {
    return LooperTrackTimeline.fromJSON(this.toJSON());
  }

  toJSON() {
    this.sortEvents();
    return {
      trackId: this.trackId,
      nodeId: this.nodeId,
      trackIndex: this.trackIndex,
      baselineActionState: actionStateToJSON(this.baselineActionState),
      events: this.events.map((event) => event.toJSON()),
    };
  }

  static fromJSON(serialized = {}) {
    const timeline = new LooperTrackTimeline({
      trackId: serialized.trackId,
      nodeId: serialized.nodeId ?? null,
      trackIndex: serialized.trackIndex ?? null,
    });
    timeline.setBaseline(serialized.baselineActionState);
    timeline.events = Array.isArray(serialized.events)
      ? serialized.events.map((event, index) => {
          const restoredEvent = LooperActionEvent.fromJSON(event);
          if (!Number.isFinite(restoredEvent.id)) {
            restoredEvent.id = index + 1;
          }
          return restoredEvent;
        })
      : [];
    timeline.nextEventId = timeline.events.reduce(
      (nextId, event) => Number.isFinite(event.id) ? Math.max(nextId, event.id + 1) : nextId,
      1,
    );
    timeline.sorted = false;
    timeline.sortEvents();
    timeline.rebuildRecordedFields();
    return timeline;
  }
}

function upperBoundByTime(events, timeMs) {
  let low = 0;
  let high = events.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (events[middle].timeMs <= timeMs) low = middle + 1;
    else high = middle;
  }
  return low;
}

function sliceEventsBetween(events, startMs, endMs, { includeStart, includeEnd }) {
  if (endMs < startMs) return [];
  const startIndex = includeStart
    ? lowerBoundByTime(events, startMs)
    : upperBoundByTime(events, startMs);
  const endIndex = includeEnd
    ? upperBoundByTime(events, endMs)
    : lowerBoundByTime(events, endMs);
  return events.slice(startIndex, endIndex);
}

function lowerBoundByTime(events, timeMs) {
  let low = 0;
  let high = events.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (events[middle].timeMs < timeMs) low = middle + 1;
    else high = middle;
  }
  return low;
}
