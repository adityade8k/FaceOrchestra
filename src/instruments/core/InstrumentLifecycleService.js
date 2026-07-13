import { INSTRUMENT_KINDS } from "./capabilities.js";

export const INSTRUMENT_LIFECYCLE_EVENTS = Object.freeze({
  deleting: "instrument.deleting",
  deleted: "instrument.deleted",
  sessionResetting: "session.resetting",
  sessionReset: "session.reset",
});

const RESET_DELETE_PRIORITY = Object.freeze({
  [INSTRUMENT_KINDS.honk]: 0,
  [INSTRUMENT_KINDS.stick]: 1,
  [INSTRUMENT_KINDS.looper]: 2,
});

/**
 * Coordinates cross-domain cleanup while leaving resource ownership on each
 * instrument. Runtime-only services are injected so this stays independent of
 * Three.js, Web Audio, XR controllers, and persistence.
 */
export class InstrumentLifecycleService {
  constructor({
    instrumentRegistry,
    contactSystem = null,
    lockService = null,
    stickEquipmentSystem = null,
    getLoopers = null,
    releaseInstrumentAudio = null,
    resetAudio = null,
    sessionResetters = [],
  } = {}) {
    if (!instrumentRegistry) {
      throw new TypeError("InstrumentLifecycleService requires an instrumentRegistry.");
    }
    if (getLoopers !== null && typeof getLoopers !== "function") {
      throw new TypeError("getLoopers must be a function when provided.");
    }
    if (releaseInstrumentAudio !== null && typeof releaseInstrumentAudio !== "function") {
      throw new TypeError("releaseInstrumentAudio must be a function when provided.");
    }
    if (resetAudio !== null && typeof resetAudio !== "function") {
      throw new TypeError("resetAudio must be a function when provided.");
    }

    this.instrumentRegistry = instrumentRegistry;
    this.contactSystem = contactSystem;
    this.lockService = lockService;
    this.stickEquipmentSystem = stickEquipmentSystem;
    this.getLoopers = getLoopers || (() => instrumentRegistry.getByKind(INSTRUMENT_KINDS.looper));
    this.releaseInstrumentAudio = releaseInstrumentAudio;
    this.resetAudio = resetAudio;
    this.sessionResetters = new Set();
    this.listeners = new Set();
    this.deletingIds = new Set();
    this.resetting = false;

    for (const resetter of sessionResetters) {
      this.addSessionResetter(resetter);
    }
  }

  deleteInstrument(instrumentOrId, { reason = "user" } = {}) {
    const instrumentId = typeof instrumentOrId === "string" ? instrumentOrId : instrumentOrId?.id;
    const instrument = instrumentId ? this.instrumentRegistry.get(instrumentId) : null;
    if (!instrument || this.deletingIds.has(instrument.id)) {
      return null;
    }

    this.deletingIds.add(instrument.id);
    const cleanup = {
      disconnectedLooperIds: [],
      removedFromContactGraph: false,
      removedFromLockGroup: false,
      releasedAudio: false,
      unequipped: false,
    };
    const eventBase = {
      instrument,
      instrumentId: instrument.id,
      kind: instrument.kind,
      reason,
    };

    try {
      this.emit({ type: INSTRUMENT_LIFECYCLE_EVENTS.deleting, ...eventBase });
      if (instrument.kind === INSTRUMENT_KINDS.honk) {
        this.cleanupHonk(instrument, cleanup, reason);
      } else if (instrument.kind === INSTRUMENT_KINDS.stick) {
        cleanup.unequipped = Boolean(this.stickEquipmentSystem?.unequip?.(instrument));
      }

      const wasAlreadyDisposed = Boolean(instrument.disposed);
      const removed = this.instrumentRegistry.remove(instrument.id, { dispose: true });
      if (!removed) {
        return null;
      }
      const result = Object.freeze({
        ...eventBase,
        instrument: removed,
        wasAlreadyDisposed,
        cleanup: Object.freeze({
          ...cleanup,
          disconnectedLooperIds: Object.freeze([...cleanup.disconnectedLooperIds]),
        }),
      });
      this.emit({ type: INSTRUMENT_LIFECYCLE_EVENTS.deleted, ...result });
      return result;
    } finally {
      this.deletingIds.delete(instrument.id);
    }
  }

  cleanupHonk(honk, cleanup, reason) {
    const honkId = honk.id;

    // Disconnect while the honk is still resolvable so automation layers and
    // action voices can be released by each looper's public cleanup path.
    for (const looper of [...(this.getLoopers?.() || [])]) {
      if (!looper || looper.disposed || typeof looper.disconnectHonk !== "function") {
        continue;
      }
      const disconnected = looper.disconnectHonk(honkId);
      if (Array.isArray(disconnected) && disconnected.length > 0) {
        cleanup.disconnectedLooperIds.push(looper.id);
      }
    }

    const hadContactNode = Boolean(this.contactSystem?.graph?.hasHonk?.(honkId));
    const removedContactNode = this.contactSystem?.removeHonk?.(honkId);
    cleanup.removedFromContactGraph = Boolean(hadContactNode || removedContactNode);
    const existingLockGroup = this.lockService?.getGroupForMember?.(honkId) || null;
    const remainingLockGroup = this.lockService?.removeMember?.(honkId) || null;
    cleanup.removedFromLockGroup = Boolean(existingLockGroup || remainingLockGroup);
    if (this.releaseInstrumentAudio) {
      this.releaseInstrumentAudio(honk, { reason });
      cleanup.releasedAudio = true;
    }
  }

  resetSession({ reason = "session-reset" } = {}) {
    if (this.resetting) {
      return null;
    }
    this.resetting = true;

    try {
      this.emit({ type: INSTRUMENT_LIFECYCLE_EVENTS.sessionResetting, reason });
      const instruments = [...this.instrumentRegistry.values()].sort(
        (first, second) => getResetPriority(first) - getResetPriority(second),
      );
      const deleted = [];
      for (const instrument of instruments) {
        const result = this.deleteInstrument(instrument.id, { reason });
        if (result) {
          deleted.push(result);
        }
      }

      // These are intentionally called even after per-instrument cleanup. They
      // also clear transient state that may not currently belong to an entity.
      this.contactSystem?.reset?.();
      this.lockService?.reset?.({ reason });
      this.stickEquipmentSystem?.reset?.();
      this.resetAudio?.({ reason });

      const context = Object.freeze({
        reason,
        deletedInstrumentIds: Object.freeze(deleted.map((result) => result.instrumentId)),
      });
      for (const resetter of this.sessionResetters) {
        invokeResetter(resetter, context);
      }

      const result = Object.freeze({
        ...context,
        deletedCount: deleted.length,
        deleted: Object.freeze(deleted),
      });
      this.emit({ type: INSTRUMENT_LIFECYCLE_EVENTS.sessionReset, ...result });
      return result;
    } finally {
      this.resetting = false;
    }
  }

  addSessionResetter(resetter) {
    if (typeof resetter !== "function" && typeof resetter?.reset !== "function") {
      throw new TypeError("A session resetter must be a function or expose reset(context).");
    }
    this.sessionResetters.add(resetter);
    return () => this.sessionResetters.delete(resetter);
  }

  subscribe(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("Lifecycle listener must be a function.");
    }
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispose() {
    this.listeners.clear();
    this.sessionResetters.clear();
    this.deletingIds.clear();
  }

  emit(event) {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}

function getResetPriority(instrument) {
  return RESET_DELETE_PRIORITY[instrument?.kind] ?? Number.MAX_SAFE_INTEGER;
}

function invokeResetter(resetter, context) {
  if (typeof resetter === "function") {
    resetter(context);
  } else {
    resetter.reset(context);
  }
}
