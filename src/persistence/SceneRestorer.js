export class SceneRestorer {
  constructor({
    registry,
    createInstrument,
    lockService,
    onEquipment = () => {},
    onInstrumentRestored = () => {},
  }) {
    this.registry = registry;
    this.createInstrument = createInstrument;
    this.lockService = lockService;
    this.onEquipment = onEquipment;
    this.onInstrumentRestored = onInstrumentRestored;
  }

  async restore(sceneData) {
    if (!sceneData || !Array.isArray(sceneData.instruments)) return { instruments: [], skipped: [] };
    const instruments = [];
    const skipped = [];
    const deferredTimelines = [];

    // Pass 1: all stable-ID entities exist before relationships are considered.
    for (const saved of sceneData.instruments) {
      if (!saved?.id || !saved?.kind) {
        skipped.push(saved);
        continue;
      }
      try {
        const instrument = await this.createInstrument(saved);
        if (!instrument) {
          skipped.push(saved);
          continue;
        }
        applyTransform(instrument, saved.transform);
        if (instrument.kind === "looper" && typeof instrument.restoreTimeline === "function") {
          instrument.restoreEntity?.(saved);
          deferredTimelines.push({ instrument, saved });
        } else {
          instrument.restore?.(saved);
        }
        if (!this.registry.has(instrument.id)) this.registry.add(instrument);
        this.onInstrumentRestored(instrument, saved);
        instruments.push(instrument);
      } catch (error) {
        console.warn(`Could not restore instrument ${saved.id}:`, error);
        skipped.push(saved);
      }
    }

    // Pass 2: relationship targets can be resolved by ID.
    const restorableLocks = [];
    for (const lock of sceneData.relationships?.honkLocks || []) {
      const memberIds = (lock.memberIds || []).filter((id) => this.registry.get(id)?.kind === "honk");
      if (memberIds.length < 2) continue;
      restorableLocks.push({ ...lock, memberIds });
    }
    this.lockService?.restore?.(restorableLocks);
    for (const connection of sceneData.relationships?.looperConnections || []) {
      const looper = this.registry.get(connection.looperId);
      const honk = this.registry.get(connection.honkId);
      if (looper?.kind !== "looper" || honk?.kind !== "honk") continue;
      const tracks = looper.getTracks?.() || looper.tracks || looper.looperData?.tracks || [];
      const trackIndex = tracks.findIndex((track) => track.trackId === connection.trackId);
      if (trackIndex >= 0) looper.connectTrack?.(trackIndex, connection.honkId);
    }
    for (const { instrument, saved } of deferredTimelines) {
      instrument.restoreTimeline(saved, {
        restoreConnections: false,
        preserveConnections: true,
      });
    }
    this.onEquipment(sceneData.equipment || {});
    return { instruments, skipped };
  }
}

function applyTransform(instrument, transform = {}) {
  const { root } = instrument;
  if (!root) return;
  if (Array.isArray(transform.position) && transform.position.length === 3) root.position.fromArray(transform.position);
  if (Array.isArray(transform.quaternion) && transform.quaternion.length === 4) {
    root.quaternion.fromArray(transform.quaternion).normalize();
  }
  if (Array.isArray(transform.scale) && transform.scale.length === 3) {
    if (typeof instrument.setScale === "function" && approximatelyUniform(transform.scale)) {
      instrument.setScale(transform.scale[0]);
    } else {
      root.scale.fromArray(transform.scale);
    }
  }
  root.updateMatrixWorld?.(true);
}

function approximatelyUniform(scale) {
  return Math.abs(scale[0] - scale[1]) < 1e-6 && Math.abs(scale[1] - scale[2]) < 1e-6;
}
