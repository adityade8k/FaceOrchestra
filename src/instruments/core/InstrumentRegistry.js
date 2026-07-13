import { INSTRUMENT_CAPABILITIES } from "./capabilities.js";
import { INSTRUMENT_LIFECYCLE } from "./InstrumentEntity.js";

export class InstrumentRegistry {
  constructor() {
    this.instruments = new Map();
    this.idsByKind = new Map();
    this.idByRoot = new WeakMap();
    this.listeners = new Set();
  }

  add(instrument, { initialize = true } = {}) {
    if (!instrument?.id || !instrument?.kind || !instrument?.root) {
      throw new TypeError("InstrumentRegistry accepts InstrumentEntity-like objects with id, kind, and root.");
    }
    if (this.instruments.has(instrument.id)) {
      throw new Error(`Instrument already registered: ${instrument.id}`);
    }
    const rootOwner = this.idByRoot.get(instrument.root);
    if (rootOwner) {
      throw new Error(`Instrument root is already registered to: ${rootOwner}`);
    }

    this.instruments.set(instrument.id, instrument);
    this.idByRoot.set(instrument.root, instrument.id);
    let kindIds = this.idsByKind.get(instrument.kind);
    if (!kindIds) {
      kindIds = new Set();
      this.idsByKind.set(instrument.kind, kindIds);
    }
    kindIds.add(instrument.id);

    if (initialize && instrument.lifecycle === INSTRUMENT_LIFECYCLE.created) {
      instrument.initialize?.();
    }
    this.emit({ type: "instrument.added", instrument, instrumentId: instrument.id });
    return instrument;
  }

  remove(instrumentOrId, { dispose = true } = {}) {
    const instrumentId = typeof instrumentOrId === "string" ? instrumentOrId : instrumentOrId?.id;
    const instrument = this.instruments.get(instrumentId);
    if (!instrument) {
      return null;
    }

    this.instruments.delete(instrument.id);
    this.idByRoot.delete(instrument.root);
    const kindIds = this.idsByKind.get(instrument.kind);
    kindIds?.delete(instrument.id);
    if (kindIds?.size === 0) {
      this.idsByKind.delete(instrument.kind);
    }
    this.emit({ type: "instrument.removed", instrument, instrumentId: instrument.id });
    if (dispose) {
      instrument.dispose?.();
    }
    return instrument;
  }

  get(instrumentId) {
    return this.instruments.get(instrumentId) || null;
  }

  has(instrumentId) {
    return this.instruments.has(instrumentId);
  }

  getByKind(kind) {
    return [...(this.idsByKind.get(kind) || [])]
      .map((instrumentId) => this.instruments.get(instrumentId))
      .filter(Boolean);
  }

  getByCapability(capability) {
    return [...this.instruments.values()].filter((instrument) => instrument.hasCapability?.(capability));
  }

  getTransformableInstruments() {
    return this.getByCapability(INSTRUMENT_CAPABILITIES.transformable);
  }

  getPlaceableInstruments() {
    return this.getByCapability(INSTRUMENT_CAPABILITIES.placeable);
  }

  getFromObject3D(object3D) {
    let current = object3D;
    while (current) {
      const descriptorId = current.userData?.interactionTarget?.ownerId || current.userData?.instrument?.id;
      const instrumentId = descriptorId || this.idByRoot.get(current);
      if (instrumentId && this.instruments.has(instrumentId)) {
        return this.instruments.get(instrumentId);
      }
      current = current.parent;
    }
    return null;
  }

  forEach(callback, thisArg = undefined) {
    this.instruments.forEach((instrument, instrumentId) => callback.call(thisArg, instrument, instrumentId, this));
  }

  values() {
    return this.instruments.values();
  }

  get size() {
    return this.instruments.size;
  }

  subscribe(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("Registry listener must be a function.");
    }
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  clear({ dispose = true } = {}) {
    for (const instrumentId of [...this.instruments.keys()]) {
      this.remove(instrumentId, { dispose });
    }
  }

  emit(event) {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}
