import { getPercussionDurationMs } from "../../../audio/percussion/percussionProfiles.js";
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
  // Schema-v5 recordings keep the performed note gate separate from the
  // expressive squeeze curve. Older recordings did not have gateOnly and
  // therefore continue to use their gate values as squeeze samples.
  if (event.gateOnly) {
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

export function isHonkGateEvent(event) {
  return event?.type === LooperActionEventType.SqueezeStart ||
    event?.type === LooperActionEventType.SqueezeEnd;
}

export class LooperActionEvent {
  constructor({
    id,
    timeMs,
    type,
    value = undefined,
    values = null,
    interpolation = "step",
    synthetic = false,
    gateOnly = false,
    support = false,
    preserveDuration = false,
    releaseOrigin = null,
    durationMs = null,
  } = {}) {
    this.id = id;
    this.timeMs = Math.max(Number.isFinite(timeMs) ? timeMs : 0, 0);
    this.type = type;
    this.value = value;
    this.values = values ? actionStateToJSON(values) : null;
    this.interpolation = interpolation;
    this.synthetic = Boolean(synthetic);
    this.gateOnly = Boolean(gateOnly);
    this.support = Boolean(support);
    this.preserveDuration = Boolean(preserveDuration);
    this.releaseOrigin = releaseOrigin || null;
    if (isDrumHitEvent(this)) this.durationMs = Number.isFinite(durationMs) && durationMs > 0 ? durationMs : getPercussionDurationMs(value);
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
    if (this.synthetic) {
      serialized.synthetic = true;
    }
    if (this.gateOnly) serialized.gateOnly = true;
    if (this.support) serialized.support = true;
    if (this.preserveDuration) serialized.preserveDuration = true;
    if (this.releaseOrigin) serialized.releaseOrigin = this.releaseOrigin;
    if (this.durationMs > 0) serialized.durationMs = this.durationMs;
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
      synthetic: serialized.synthetic,
      gateOnly: serialized.gateOnly,
      support: serialized.support,
      preserveDuration: serialized.preserveDuration,
      releaseOrigin: serialized.releaseOrigin,
      durationMs: serialized.durationMs,
    });
  }
}

export function getRecordedFieldsForEvent(event) {
  const fields = [];
  const eventField = EVENT_FIELD_BY_TYPE[event?.type];
  if (eventField && !event?.gateOnly) {
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
