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
    this.drumEvents = [];
    this.eventOwners = new Map();
    this.hasDiscreteGates = false;
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
    this.sortEvents();
    let endMs = 0, held = false;
    for (const event of this.events) {
      if (event.support) continue;
      if (isDrumHitEvent(event)) {
        endMs = Math.max(endMs, event.timeMs + event.durationMs);
        continue;
      }
      if (event.type === LooperActionEventType.SqueezeStart) held = true;
      // A release closes the entire performed hold, including a forced Stop.
      if (held) endMs = Math.max(endMs, event.timeMs);
      if (event.type === LooperActionEventType.SqueezeEnd) held = false;
      if (!this.hasDiscreteGates && !isHonkGateEvent(event)) {
        const squeeze = getEventFieldValue(event, "squeeze");
        if (squeeze !== undefined) {
          held = Number(squeeze) > SQUEEZE_ONSET_THRESHOLD;
          if (held) endMs = Math.max(endMs, event.timeMs);
        }
      }
    }
    return endMs;
  }

  getIntentionalContentEndMs() {
    return this.getContentEndMs();
  }

  getMusicalOnsetTimes() {
    this.sortEvents();
    const onsets = [];
    let squeezeActive = false;
    const hasDiscreteGateTrack = this.hasDiscreteGates;

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
      // Equal-time gates keep their recorded order: release then reattack for
      // adjacent notes, or start then release for a same-frame capture.
      (isHonkGateEvent(first) && isHonkGateEvent(second) ? first.id - second.id : 0) ||
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
    this.drumEvents = [];
    this.eventOwners = new Map();
    this.hasDiscreteGates = false;
    let owner, releasedOwner, releasedAt;
    for (const event of this.events) {
      if (event.type === LooperActionEventType.SqueezeStart) owner = event;
      // The final expressive sample can follow its gate release at the same
      // timestamp. It still belongs to that voice, never to the next cycle.
      this.eventOwners.set(event, owner || (event.timeMs === releasedAt ? releasedOwner : owner));
      if (event.type === LooperActionEventType.SqueezeEnd) {
        releasedOwner = owner; releasedAt = event.timeMs; owner = null;
      }
      if (event.gateOnly && isHonkGateEvent(event)) this.hasDiscreteGates = true;
      if (isDrumHitEvent(event)) this.drumEvents.push(event);
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
    return sliceEventsBetween(this.gateEvents, timeMs - epsilon, timeMs + epsilon, { includeStart: true, includeEnd: true });
  }

  getGateEventsBetween(startMs, endMs, { includeStart = false, includeEnd = true } = {}) {
    this.sortEvents();
    return sliceEventsBetween(this.gateEvents, startMs, endMs, { includeStart, includeEnd });
  }

  getPerformanceEventsAt(timeMs, epsilon = 0.001) {
    this.sortEvents();
    return sliceEventsBetween(this.performanceEvents, timeMs - epsilon, timeMs + epsilon, { includeStart: true, includeEnd: true });
  }

  getPerformanceEventsBetween(startMs, endMs, { includeStart = false, includeEnd = true } = {}) {
    this.sortEvents();
    return sliceEventsBetween(this.performanceEvents, startMs, endMs, { includeStart, includeEnd });
  }

  normalize(offsetMs, endMs = Infinity) {
    if (!Number.isFinite(offsetMs) || offsetMs < 0) return;
    if (!offsetMs && this.events.every(event => event.timeMs <= endMs)) return;
    this.sortEvents();
    // Sample before removing pre-onset automation. Preserve its interpolation
    // mode so all tracks retain the exact state at the shared first onset.
    const support = [];
    for (const [field, events] of this.fieldEvents) {
      const previous = events[upperBoundByTime(events, offsetMs) - 1];
      if (!offsetMs || !previous || previous.timeMs === offsetMs) continue;
      const value = field === "vowel" ? this.sampleStepField(field, offsetMs) : this.sampleNumericField(field, offsetMs);
      if (value !== undefined) support.push({field, value, interpolation: previous?.interpolation || "linear"});
    }
    this.events = this.events.filter(event => event.timeMs >= offsetMs && event.timeMs <= endMs);
    for (const event of this.events) {
      event.timeMs -= offsetMs;
    }
    for (const point of support) this.addFieldEvent(point.field, 0, point.value, point.interpolation, false, {support: true});
    this.rebuildRecordedFields();
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
    return sliceEventsBetween(this.drumEvents, timeMs - epsilon, timeMs + epsilon,
      { includeStart: true, includeEnd: true });
  }

  getDrumHitEventsBetween(startMs, endMs, { includeStart = false, includeEnd = true } = {}) {
    this.sortEvents();
    return sliceEventsBetween(this.drumEvents, startMs, endMs, { includeStart, includeEnd });
  }

  getOwningNote(event, durationMs = Infinity) {
    this.sortEvents();
    if (!this.eventOwners.has(event)) return null;
    const owner = this.eventOwners.get(event);
    if (owner) return { event: owner, cycleOffset: 0 };
    if (owner === null) return null;
    const last = this.gateEvents.at(-1);
    const previous = last?.timeMs <= event.timeMs + durationMs ? last
      : this.gateEvents[upperBoundByTime(this.gateEvents, event.timeMs + durationMs) - 1];
    return previous?.type === LooperActionEventType.SqueezeStart
      ? { event: previous, cycleOffset: -1 } : null;
  }

  getActiveNote(timeMs, durationMs) {
    this.sortEvents();
    const current = this.gateEvents[upperBoundByTime(this.gateEvents, timeMs) - 1];
    // Before this cycle's first gate, the preceding cycle can still own a note.
    const previous = this.gateEvents[upperBoundByTime(this.gateEvents, timeMs + durationMs) - 1];
    const event = current || previous;
    return event?.type === LooperActionEventType.SqueezeStart
      ? { event, cycleOffset: current ? 0 : -1 } : null;
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
    if (this.hasDiscreteGates && !this.sampleGateActive(timeMs)) {
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
    this.sortEvents();
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
    this.sortEvents();
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
