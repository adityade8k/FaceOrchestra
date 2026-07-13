import {
  INSTRUMENT_CAPABILITIES,
  assertInstrumentKind,
  createCapabilitySet,
  getDefaultCapabilities,
} from "./capabilities.js";
import { assertStableId, createStableId } from "./id.js";

export const INSTRUMENT_LIFECYCLE = Object.freeze({
  created: "created",
  initialized: "initialized",
  disposed: "disposed",
});

export class InstrumentEntity {
  constructor({
    id = null,
    kind,
    root,
    capabilities = null,
    interactionTargetRegistry = null,
    metadata = {},
  } = {}) {
    this.kind = assertInstrumentKind(kind);
    this.id = assertStableId(id || createStableId(this.kind), "Instrument ID");
    if (!root || typeof root !== "object") {
      throw new TypeError(`${this.kind} instrument ${this.id} requires an Object3D-like root.`);
    }

    this.root = root;
    this.capabilities = capabilities === null
      ? getDefaultCapabilities(this.kind)
      : createCapabilitySet(capabilities);
    this.persistable = this.capabilities.has(INSTRUMENT_CAPABILITIES.persistable);
    this.interactionTargetRegistry = interactionTargetRegistry;
    this.interactionTargetIds = new Set();
    this.metadata = { ...metadata };
    this.lifecycle = INSTRUMENT_LIFECYCLE.created;
    this.disposeHandlers = new Set();

    this.root.userData ||= {};
    this.root.userData.instrument = Object.freeze({ id: this.id, kind: this.kind });
  }

  get position() {
    return this.root.position;
  }

  get quaternion() {
    return this.root.quaternion;
  }

  get rotation() {
    return this.root.rotation;
  }

  get scale() {
    return this.root.scale;
  }

  get visible() {
    return this.root.visible !== false;
  }

  set visible(value) {
    this.root.visible = Boolean(value);
  }

  get disposed() {
    return this.lifecycle === INSTRUMENT_LIFECYCLE.disposed;
  }

  initialize() {
    if (this.disposed) {
      throw new Error(`Cannot initialize disposed instrument: ${this.id}`);
    }
    this.lifecycle = INSTRUMENT_LIFECYCLE.initialized;
    return this;
  }

  hasCapability(capability) {
    return this.capabilities.has(capability);
  }

  attachTo(parent) {
    parent?.add?.(this.root);
    return this;
  }

  detach() {
    this.root.removeFromParent?.();
    if (!this.root.removeFromParent && this.root.parent?.remove) {
      this.root.parent.remove(this.root);
    }
    return this;
  }

  registerInteractionTarget(role, object3D, options = {}) {
    if (!this.interactionTargetRegistry) {
      throw new Error(`Instrument ${this.id} has no interaction target registry.`);
    }
    const target = this.interactionTargetRegistry.register({
      ...options,
      ownerId: this.id,
      role,
      object3D,
    });
    this.interactionTargetIds.add(target.targetId);
    return target;
  }

  unregisterInteractionTarget(targetOrId) {
    if (!this.interactionTargetRegistry) {
      return null;
    }
    const record = this.interactionTargetRegistry.unregister(targetOrId);
    if (record) {
      this.interactionTargetIds.delete(record.targetId);
    }
    return record;
  }

  getInteractionTargets() {
    return this.interactionTargetRegistry?.getByOwner(this.id) || [];
  }

  addDisposeHandler(handler) {
    if (typeof handler !== "function") {
      throw new TypeError("Dispose handler must be a function.");
    }
    this.disposeHandlers.add(handler);
    return () => this.disposeHandlers.delete(handler);
  }

  getScale() {
    const scale = readTuple(this.root.scale, 3, [1, 1, 1]);
    return (Math.abs(scale[0]) + Math.abs(scale[1]) + Math.abs(scale[2])) / 3;
  }

  setScale(value) {
    if (Number.isFinite(value)) {
      if (typeof this.root.scale?.setScalar === "function") {
        this.root.scale.setScalar(value);
      } else if (typeof this.root.scale?.set === "function") {
        this.root.scale.set(value, value, value);
      } else if (this.root.scale) {
        this.root.scale.x = value;
        this.root.scale.y = value;
        this.root.scale.z = value;
      }
      if (Object.prototype.hasOwnProperty.call(this, "baseScale")) {
        this.baseScale = value;
      }
      return this;
    }

    const tuple = readTuple(value, 3, null);
    if (!tuple) {
      throw new TypeError("Instrument scale must be a finite scalar or three-component value.");
    }
    writeTuple(this.root.scale, tuple);
    if (Object.prototype.hasOwnProperty.call(this, "baseScale")) {
      this.baseScale = (Math.abs(tuple[0]) + Math.abs(tuple[1]) + Math.abs(tuple[2])) / 3;
    }
    return this;
  }

  serialize() {
    return {
      id: this.id,
      kind: this.kind,
      transform: captureTransform(this.root),
    };
  }

  restoreTransform(transform = {}) {
    if (transform.position) {
      writeTuple(this.root.position, transform.position);
    }
    if (transform.quaternion) {
      writeTuple(this.root.quaternion, transform.quaternion);
      this.root.quaternion?.normalize?.();
    }
    if (transform.scale) {
      writeTuple(this.root.scale, transform.scale);
    }
    return this;
  }

  dispose() {
    if (this.disposed) {
      return;
    }

    this.interactionTargetRegistry?.unregisterOwner(this.id);
    this.interactionTargetIds.clear();
    for (const handler of [...this.disposeHandlers]) {
      handler(this);
    }
    this.disposeHandlers.clear();
    this.detach();
    if (this.root.userData?.instrument?.id === this.id) {
      delete this.root.userData.instrument;
    }
    this.lifecycle = INSTRUMENT_LIFECYCLE.disposed;
  }
}

export function captureTransform(root) {
  return {
    position: readTuple(root?.position, 3, [0, 0, 0]),
    quaternion: readTuple(root?.quaternion, 4, [0, 0, 0, 1]),
    scale: readTuple(root?.scale, 3, [1, 1, 1]),
  };
}

export function readTuple(value, length, fallback = null) {
  if (Array.isArray(value) || ArrayBuffer.isView(value)) {
    const tuple = Array.from(value).slice(0, length);
    return tuple.length === length && tuple.every(Number.isFinite) ? tuple : fallback;
  }
  if (typeof value?.toArray === "function") {
    const tuple = value.toArray().slice(0, length);
    return tuple.length === length && tuple.every(Number.isFinite) ? tuple : fallback;
  }
  const keys = length === 4 ? ["x", "y", "z", "w"] : ["x", "y", "z"];
  const tuple = keys.map((key) => value?.[key]);
  return tuple.every(Number.isFinite) ? tuple : fallback;
}

export function writeTuple(target, tuple) {
  if (!target || !tuple) {
    return;
  }
  if (typeof target.fromArray === "function") {
    target.fromArray(tuple);
    return;
  }
  if (typeof target.set === "function") {
    target.set(...tuple);
    return;
  }
  const keys = tuple.length === 4 ? ["x", "y", "z", "w"] : ["x", "y", "z"];
  keys.forEach((key, index) => {
    target[key] = tuple[index];
  });
}
