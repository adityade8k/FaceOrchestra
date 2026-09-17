import { LooperPortTransport } from "../looper/LooperPortTransport.js";
import { METRONOME_CONNECTION_PORTS } from "../../config/metronome.js";

export const METRONOME_CONNECTION_TARGET_KINDS = Object.freeze({
  looper: "looper",
  honk: "honk",
});

export const HONK_METRONOME_TARGET_PORT_ID = "honk.looper-connector";

const VALID_PORT_IDS = new Set(METRONOME_CONNECTION_PORTS.map(({ portId }) => portId));

export class MetronomeConnectionManager {
  constructor({ registry, onConnectionAdded = null, onConnectionRemoved = null } = {}) {
    if (!registry) throw new TypeError("MetronomeConnectionManager requires an InstrumentRegistry.");
    this.registry = registry;
    this.onConnectionAdded = onConnectionAdded;
    this.onConnectionRemoved = onConnectionRemoved;
    this.connectionsByPort = new Map();
    this.portTransport = new LooperPortTransport();
    this.connectionSequence = 0;
    this.connectionOrder = new WeakMap();
    this.incomingByTarget = new Map();
    this.endpointDisposalSubscriptions = new Map();
    this.listeners = new Set();
    this.unsubscribeRegistry = registry.subscribe?.((event) => {
      if (event.type === "instrument.removed") this.disconnectInstrument(event.instrumentId);
    }) || null;
  }

  connect({ metronomeId, portId, targetKind, targetId, targetPortId } = {}) {
    const candidate = { metronomeId, portId, targetKind, targetId, targetPortId };
    if (!this.validate(candidate)) return null;

    const portKey = this.getPortKey(metronomeId, portId);
    const targetKey = this.getTargetKey(targetKind, targetId);
    const existingIncoming = this.incomingByTarget.get(targetKey) || null;
    if (existingIncoming && connectionsEqual(existingIncoming, candidate)) return existingIncoming;
    // Preserve direct Honk output replacement semantics. Only Looper outputs fan out.
    for (const existing of this.getConnectionsForPort(metronomeId, portId)) {
      if (targetKind !== "looper" || existing.targetKind !== "looper") this.disconnectConnection(existing, "port-replaced");
    }
    if (existingIncoming) this.disconnectConnection(existingIncoming, "incoming-replaced");

    const connection = Object.freeze({ ...candidate });
    if (!this.connectionsByPort.has(portKey)) this.connectionsByPort.set(portKey, new Set());
    this.connectionsByPort.get(portKey).add(connection);
    this.connectionOrder.set(connection, ++this.connectionSequence);
    this.incomingByTarget.set(targetKey, connection);
    this.retainEndpoint(metronomeId);
    this.retainEndpoint(targetId);
    // Connecting never starts a take. Stop a running/armed newcomer before it
    // can join an occupied group (or retain a stale standalone clock anchor).
    if (targetKind === "looper") {
      const looper = this.registry.get(targetId);
      looper?.looperController?.handleClockDisconnected?.(looper);
      if (looper?.looperController) looper.looperController.portTransport = this.portTransport;
    }
    this.onConnectionAdded?.(connection);
    this.emit({ type: "metronome-connection.created", connection });
    return connection;
  }

  validate({ metronomeId, portId, targetKind, targetId, targetPortId } = {}) {
    const metronome = this.registry.get(metronomeId);
    if (!isAvailableInstrument(metronome, "metronome")) return false;
    if (!VALID_PORT_IDS.has(portId) || !metronome.hasConnectionPort?.(portId)) return false;
    const target = this.registry.get(targetId);
    if (!isAvailableInstrument(target, targetKind)) return false;

    if (targetKind === METRONOME_CONNECTION_TARGET_KINDS.looper) {
      const track = getLooperTracks(target).find((entry) => entry.trackId === targetPortId);
      return Boolean(track?.nodeTarget && track.nodeTarget.visible !== false);
    }
    if (targetKind === METRONOME_CONNECTION_TARGET_KINDS.honk) {
      if (targetPortId !== HONK_METRONOME_TARGET_PORT_ID) return false;
      return Boolean(target.getTarget?.(targetPortId) || target.targetsByRole?.get?.(targetPortId));
    }
    return false;
  }

  disconnectPort(metronomeId, portId, reason = "disconnect") {
    return this.getConnectionsForPort(metronomeId, portId).map(connection => this.disconnectConnection(connection, reason));
  }

  disconnectTarget(targetKind, targetId, reason = "disconnect") {
    const connection = this.getConnectionForTarget(targetKind, targetId);
    return connection ? this.disconnectConnection(connection, reason) : null;
  }

  disconnectInstrument(instrumentId, reason = "endpoint-removed") {
    const removed = [];
    for (const connection of this.getConnections()) {
      if (connection.metronomeId !== instrumentId && connection.targetId !== instrumentId) continue;
      const disconnected = this.disconnectConnection(connection, reason);
      if (disconnected) removed.push(disconnected);
    }
    return removed;
  }

  disconnectConnection(connection, reason = "disconnect") {
    if (!connection) return null;
    const portKey = this.getPortKey(connection.metronomeId, connection.portId);
    const connections = this.connectionsByPort.get(portKey);
    if (!connections?.delete(connection)) return null;
    if (!connections.size) this.connectionsByPort.delete(portKey);
    if (connection.targetKind === "looper") {
      const looper = this.registry.get(connection.targetId) || this.endpointDisposalSubscriptions.get(connection.targetId)?.instrument;
      this.portTransport.remove(looper);
      looper?.looperController?.handleClockDisconnected?.(looper);
    }
    const targetKey = this.getTargetKey(connection.targetKind, connection.targetId);
    if (this.incomingByTarget.get(targetKey) === connection) this.incomingByTarget.delete(targetKey);
    this.releaseEndpoint(connection.metronomeId);
    this.releaseEndpoint(connection.targetId);
    this.onConnectionRemoved?.(connection, reason);
    this.emit({ type: "metronome-connection.removed", connection, reason });
    return connection;
  }

  getConnectionForPort(metronomeId, portId) {
    return this.getConnectionsForPort(metronomeId, portId).at(-1) || null;
  }

  getConnectionsForPort(metronomeId, portId) {
    return [...(this.connectionsByPort.get(this.getPortKey(metronomeId, portId)) || [])];
  }

  getConnections() { return [...this.connectionsByPort.values()].flatMap(set => [...set]); }

  getConnectionForTarget(targetKind, targetId) {
    return this.incomingByTarget.get(this.getTargetKey(targetKind, targetId)) || null;
  }

  getConnectionsForMetronome(metronomeId) {
    return this.getConnections().filter(
      (connection) => connection.metronomeId === metronomeId,
    );
  }

  getTimingForLooper(looperId, now = performance.now()) {
    const connection = this.getConnectionForTarget(METRONOME_CONNECTION_TARGET_KINDS.looper, looperId);
    if (!connection) return inactiveTiming({ connected: false });
    const metronome = this.registry.get(connection.metronomeId);
    if (!isAvailableInstrument(metronome, "metronome")) {
      return inactiveTiming({ connected: false });
    }
    const timing = metronome.getBeatTiming?.(now) || {};
    return {
      ...timing,
      active: Boolean(timing.active),
      connected: true,
      metronomeId: metronome.id,
      portId: connection.portId,
      connectionOrder: this.connectionOrder.get(connection),
    };
  }

  serialize(savedIds = null) {
    const allowedIds = savedIds ? new Set(savedIds) : null;
    return this.getConnections()
      .filter(({ metronomeId, targetId }) =>
        !allowedIds || (allowedIds.has(metronomeId) && allowedIds.has(targetId)),
      )
      .map((connection) => ({ ...connection }));
  }

  restore(serializedConnections = []) {
    const restored = [];
    for (const serialized of serializedConnections || []) {
      const connection = this.connect(serialized);
      if (connection) restored.push(connection);
    }
    return restored;
  }

  clear(reason = "reset") {
    this.portTransport.reset();
    for (const connection of this.getConnections()) {
      this.disconnectConnection(connection, reason);
    }
  }

  subscribe(listener) {
    if (typeof listener !== "function") throw new TypeError("Connection listener must be a function.");
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispose() {
    this.clear("dispose");
    this.unsubscribeRegistry?.();
    this.unsubscribeRegistry = null;
    for (const { unsubscribe } of this.endpointDisposalSubscriptions.values()) unsubscribe?.();
    this.endpointDisposalSubscriptions.clear();
    this.listeners.clear();
  }

  getPortKey(metronomeId, portId) {
    return `${metronomeId}:${portId}`;
  }

  getTargetKey(targetKind, targetId) {
    return `${targetKind}:${targetId}`;
  }

  retainEndpoint(instrumentId) {
    const current = this.endpointDisposalSubscriptions.get(instrumentId);
    if (current) {
      current.count += 1;
      return;
    }
    const instrument = this.registry.get(instrumentId);
    const unsubscribe = instrument?.addDisposeHandler?.(() => {
      this.disconnectInstrument(instrumentId, "endpoint-disposed");
    }) || null;
    this.endpointDisposalSubscriptions.set(instrumentId, { count: 1, unsubscribe, instrument });
  }

  releaseEndpoint(instrumentId) {
    const current = this.endpointDisposalSubscriptions.get(instrumentId);
    if (!current) return;
    current.count -= 1;
    if (current.count > 0) return;
    current.unsubscribe?.();
    this.endpointDisposalSubscriptions.delete(instrumentId);
  }

  emit(event) {
    for (const listener of this.listeners) listener(event);
  }
}

function isAvailableInstrument(instrument, expectedKind) {
  return Boolean(
    instrument &&
    instrument.kind === expectedKind &&
    !instrument.disposed &&
    !instrument.pendingPlacement &&
    instrument.root?.visible !== false,
  );
}

function getLooperTracks(looper) {
  return looper.getTracks?.() || looper.tracks || looper.looperData?.tracks || [];
}

function connectionsEqual(first, second) {
  return first.metronomeId === second.metronomeId &&
    first.portId === second.portId &&
    first.targetKind === second.targetKind &&
    first.targetId === second.targetId &&
    first.targetPortId === second.targetPortId;
}

function inactiveTiming({ connected = false } = {}) {
  return {
    active: false,
    clockAvailable: false,
    connected,
    metronomeId: null,
    portId: null,
    bpm: null,
    beatIntervalMs: null,
    beatOriginMs: null,
    beatPosition: null,
    nearestBeatMs: null,
    lastBeatMs: null,
    lastEmittedBeatOrdinal: null,
  };
}
