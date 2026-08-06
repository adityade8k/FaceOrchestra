import { createEmptySceneData } from "./schema.js";

export class SceneSerializer {
  constructor({
    registry,
    lockService,
    metronomeConnectionManager = null,
    getEquipment = () => ({ preferredStickType: "default" }),
  }) {
    this.registry = registry;
    this.lockService = lockService;
    this.metronomeConnectionManager = metronomeConnectionManager;
    this.getEquipment = getEquipment;
  }

  serialize() {
    const scene = createEmptySceneData();
    scene.instruments = [...this.registry.values()]
      .filter((instrument) => instrument?.persistable !== false && !instrument.pendingPlacement)
      .map((instrument) => this.serializeInstrument(instrument));
    scene.relationships.honkLocks = this.lockService?.serialize?.() || [];
    scene.relationships.looperConnections = this.serializeLooperConnections(scene.instruments);
    const savedIds = new Set(scene.instruments.map(({ id }) => id));
    scene.relationships.metronomeConnections =
      this.metronomeConnectionManager?.serialize?.(savedIds) || [];
    scene.equipment = { ...scene.equipment, ...this.getEquipment() };
    return assertPlainScene(scene);
  }

  serializeInstrument(instrument) {
    const serialized = omitTransientLooperState(
      instrument.serialize?.() || {},
      instrument.kind,
    );
    const scaleOverride = Number.isFinite(instrument.baseScale) ? instrument.baseScale : null;
    return {
      ...serialized,
      id: instrument.id,
      kind: instrument.kind,
      transform: serializeTransform(instrument.root, scaleOverride),
    };
  }

  serializeLooperConnections(instruments) {
    const savedIds = new Set(instruments.map(({ id }) => id));
    const connections = [];
    for (const looper of this.registry.getByKind("looper")) {
      if (!savedIds.has(looper.id)) continue;
      for (const track of looper.getTracks?.() || looper.tracks || looper.looperData?.tracks || []) {
        const honkId = track.connectedHonkId;
        if (honkId && savedIds.has(honkId)) {
          connections.push({ looperId: looper.id, trackId: track.trackId, honkId });
        }
      }
    }
    return connections;
  }
}

export function serializeTransform(root, scaleOverride = null) {
  const scale = Number.isFinite(scaleOverride)
    ? [scaleOverride, scaleOverride, scaleOverride]
    : root?.scale?.toArray?.() || [1, 1, 1];
  return {
    position: root?.position?.toArray?.() || [0, 0, 0],
    quaternion: root?.quaternion?.toArray?.() || [0, 0, 0, 1],
    scale,
  };
}

function assertPlainScene(scene) {
  const serialized = JSON.stringify(scene);
  if (!serialized) throw new TypeError("Scene did not serialize to JSON");
  return JSON.parse(serialized);
}

const TRANSIENT_LOOPER_FIELDS = Object.freeze([
  "transport",
  "transportState",
  "recording",
  "playing",
  "paused",
  "stopped",
  "playheadMs",
  "playbackPositionMs",
  "lastPlaybackUpdateMs",
  "playbackEngine",
  "automationLayers",
  "activeVoiceIds",
]);

function omitTransientLooperState(serialized, kind) {
  if (kind !== "looper" || !serialized || typeof serialized !== "object") {
    return serialized;
  }
  const persistent = { ...serialized };
  for (const field of TRANSIENT_LOOPER_FIELDS) delete persistent[field];
  if (persistent.looper && typeof persistent.looper === "object") {
    persistent.looper = { ...persistent.looper };
    for (const field of TRANSIENT_LOOPER_FIELDS) delete persistent.looper[field];
  }
  return persistent;
}
