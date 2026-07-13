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
} from "./LooperActionEvent.js";

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
