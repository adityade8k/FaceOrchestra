import { INSTRUMENT_KINDS } from "../core/capabilities.js";
import { InstrumentEntity } from "../core/InstrumentEntity.js";
import { getStickPercussionType } from "./percussionProfiles.js";

export const STICK_EVENT_TYPES = Object.freeze({
  strike: "stick.strike",
  contactExit: "stick.contact-exit",
  equipped: "stick.equipped",
  unequipped: "stick.unequipped",
});

export class StickInstrument extends InstrumentEntity {
  constructor({
    id,
    root,
    collider = null,
    interactionTargetRegistry = null,
    stickType = "default",
    percussionResolver = getStickPercussionType,
    metadata = {},
  } = {}) {
    super({
      id,
      kind: INSTRUMENT_KINDS.stick,
      root,
      interactionTargetRegistry,
      metadata,
    });
    this.stickType = stickType;
    this.collider = null;
    this.percussionResolver = percussionResolver;
    this.controllerId = null;
    this.colliderActive = false;
    this.contactTargetIds = new Set();
    this.listeners = new Set();
    this.strikeSequence = 0;
    this.visible = false;
    this.setCollider(collider);
  }

  get equipped() {
    return this.controllerId !== null;
  }

  setCollider(collider) {
    this.collider = collider;
    if (collider) {
      collider.userData ||= {};
      collider.userData.stick = Object.freeze({ ownerId: this.id, role: "stick.strike-volume" });
      collider.visible = this.colliderActive;
    }
    return collider;
  }

  equip(controllerId) {
    if (!controllerId) {
      throw new TypeError("Equipping a stick requires a stable controller ID.");
    }
    if (this.controllerId && this.controllerId !== controllerId) {
      throw new Error(`Stick ${this.id} is already equipped to ${this.controllerId}.`);
    }
    this.controllerId = controllerId;
    this.visible = true;
    this.activateCollider();
    this.emit({ type: STICK_EVENT_TYPES.equipped, stickId: this.id, controllerId });
    return this;
  }

  unequip() {
    const controllerId = this.controllerId;
    this.clearContacts();
    this.deactivateCollider();
    this.controllerId = null;
    this.visible = false;
    if (controllerId) {
      this.emit({ type: STICK_EVENT_TYPES.unequipped, stickId: this.id, controllerId });
    }
    return this;
  }

  activateCollider() {
    this.colliderActive = true;
    if (this.collider) {
      this.collider.visible = true;
    }
  }

  deactivateCollider() {
    this.colliderActive = false;
    if (this.collider) {
      this.collider.visible = false;
    }
  }

  beginContact(target, {
    percussionType = this.percussionResolver(target),
    velocity = 0,
    timestamp = performanceNow(),
  } = {}) {
    const targetId = typeof target === "string" ? target : target?.id;
    if (!this.equipped || !this.colliderActive || !targetId || !percussionType) {
      return null;
    }
    if (this.contactTargetIds.has(targetId)) {
      return null;
    }
    this.contactTargetIds.add(targetId);
    this.strikeSequence += 1;
    const event = Object.freeze({
      type: STICK_EVENT_TYPES.strike,
      eventId: `${this.id}:strike-${this.strikeSequence}`,
      stickId: this.id,
      controllerId: this.controllerId,
      targetId,
      percussionType,
      velocity: Math.max(Number.isFinite(velocity) ? velocity : 0, 0),
      timestamp,
    });
    this.emit(event);
    return event;
  }

  endContact(targetOrId, timestamp = performanceNow()) {
    const targetId = typeof targetOrId === "string" ? targetOrId : targetOrId?.id;
    if (!targetId || !this.contactTargetIds.delete(targetId)) {
      return false;
    }
    this.emit({
      type: STICK_EVENT_TYPES.contactExit,
      stickId: this.id,
      controllerId: this.controllerId,
      targetId,
      timestamp,
    });
    return true;
  }

  clearContacts(timestamp = performanceNow()) {
    for (const targetId of [...this.contactTargetIds]) {
      this.endContact(targetId, timestamp);
    }
  }

  subscribe(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("Stick event listener must be a function.");
    }
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  serialize() {
    return {
      id: this.id,
      kind: this.kind,
      preference: { stickType: this.stickType },
    };
  }

  dispose() {
    if (this.disposed) {
      return;
    }
    this.unequip();
    this.collider?.geometry?.dispose?.();
    const materials = Array.isArray(this.collider?.material)
      ? this.collider.material
      : [this.collider?.material];
    for (const material of materials) {
      material?.dispose?.();
    }
    this.collider = null;
    this.listeners.clear();
    super.dispose();
  }

  emit(event) {
    for (const listener of this.listeners) {
      listener(event, this);
    }
  }
}

function performanceNow() {
  return globalThis.performance?.now?.() ?? Date.now();
}
