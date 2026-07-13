import { assertInstrumentKind } from "./capabilities.js";

export class InstrumentFactory {
  constructor({ registry = null, interactionTargetRegistry = null } = {}) {
    this.registry = registry;
    this.interactionTargetRegistry = interactionTargetRegistry;
    this.creators = new Map();
  }

  register(kind, creator) {
    assertInstrumentKind(kind);
    if (typeof creator !== "function") {
      throw new TypeError(`Instrument creator for ${kind} must be a function.`);
    }
    this.creators.set(kind, creator);
    return this;
  }

  unregister(kind) {
    return this.creators.delete(kind);
  }

  has(kind) {
    return this.creators.has(kind);
  }

  create({ kind, register = true, ...options } = {}) {
    assertInstrumentKind(kind);
    const creator = this.creators.get(kind);
    if (!creator) {
      throw new Error(`No instrument creator registered for kind: ${kind}`);
    }

    const instrument = creator({
      ...options,
      kind,
      interactionTargetRegistry: options.interactionTargetRegistry || this.interactionTargetRegistry,
    });
    if (!instrument || instrument.kind !== kind) {
      throw new Error(`Creator for ${kind} did not return a matching instrument.`);
    }
    if (register && this.registry) {
      this.registry.add(instrument);
    }
    return instrument;
  }

  createFromSerialized(serialized, options = {}) {
    if (!serialized?.kind || !serialized?.id) {
      throw new TypeError("Serialized instrument requires kind and stable id.");
    }
    const instrument = this.create({
      ...options,
      kind: serialized.kind,
      id: serialized.id,
      serialized,
    });
    instrument.restoreTransform?.(serialized.transform);
    return instrument;
  }
}
