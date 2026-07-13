import { ACTION_FIELDS, actionStateToJSON } from "./actionState.js";

export const LooperActionEventType = Object.freeze({
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
});

export const EVENT_FIELD_BY_TYPE = Object.freeze({
  [LooperActionEventType.Squeeze]: "squeeze",
  [LooperActionEventType.SqueezeStart]: "squeeze",
  [LooperActionEventType.SqueezeEnd]: "squeeze",
  [LooperActionEventType.Bend]: "bend",
  [LooperActionEventType.Vowel]: "vowel",
  [LooperActionEventType.Nose]: "nose",
  [LooperActionEventType.EarLeft]: "earLeft",
  [LooperActionEventType.EarRight]: "earRight",
});

export function getEventFieldValue(event, field) {
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

export function isDrumHitEvent(event) {
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
  } = {}) {
    this.id = id;
    this.timeMs = Math.max(Number.isFinite(timeMs) ? timeMs : 0, 0);
    this.type = type;
    this.value = value;
    this.values = values ? actionStateToJSON(values) : null;
    this.interpolation = interpolation;
  }

  clone() {
    return LooperActionEvent.fromJSON(this.toJSON());
  }

  toJSON() {
    const serialized = {
      id: this.id,
      timeMs: this.timeMs,
      type: this.type,
      interpolation: this.interpolation,
    };
    if (this.value !== undefined) {
      serialized.value = this.value;
    }
    if (this.values) {
      serialized.values = actionStateToJSON(this.values);
    }
    return serialized;
  }

  static fromJSON(serialized = {}) {
    return new LooperActionEvent({
      id: serialized.id,
      timeMs: serialized.timeMs,
      type: serialized.type,
      value: serialized.value,
      values: serialized.values,
      interpolation: serialized.interpolation || "step",
    });
  }
}

export function getRecordedFieldsForEvent(event) {
  const fields = [];
  const eventField = EVENT_FIELD_BY_TYPE[event?.type];
  if (eventField) {
    fields.push(eventField);
  }
  if (
    event?.type === LooperActionEventType.MorphSnapshot ||
    event?.type === LooperActionEventType.GestureSnapshot
  ) {
    for (const field of ACTION_FIELDS) {
      if (event.values?.[field] !== undefined) {
        fields.push(field);
      }
    }
  }
  return fields;
}
