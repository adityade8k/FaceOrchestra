import { InstrumentEntity } from "../core/InstrumentEntity.js";
import { LooperController } from "./LooperController.js";
import { disposeWireMesh } from "./view/wireUtils.js";

export class LooperInstrument extends InstrumentEntity {
  constructor(options = {}) {
    super({
      ...options,
      kind: "looper",
    });
    this.hitTargets = options.hitTargets || {};
    this.morphController = options.morphController || null;
    this.instrumentRegistry = options.instrumentRegistry || options.registry || null;
    const looperAdapter = { ...(options.looperAdapter || {}) };
    if (!looperAdapter.resolveHonk && this.instrumentRegistry) {
      looperAdapter.resolveHonk = (honkId) => this.instrumentRegistry.get(honkId);
    }
    this.looperController = options.looperController || new LooperController(looperAdapter);
    this.ownsLooperController = !options.looperController;
    this.trackCount = options.trackCount;
    this.looperData = null;
    this.locked = false;

    if (this.instrumentRegistry?.subscribe) {
      const unsubscribe = this.instrumentRegistry.subscribe((event) => {
        if (event.type === "instrument.removed" && event.instrument?.kind === "honk") {
          this.disconnectHonk(event.instrumentId);
        }
      });
      this.addDisposeHandler(unsubscribe);
    }
  }

  get transport() {
    return this.looperData?.transport || null;
  }

  get tracks() {
    return this.looperData?.tracks || [];
  }

  get timeline() {
    return this.looperData?.timeline || null;
  }

  initialize() {
    super.initialize();
    if (this.looperData) {
      return this;
    }
    this.looperData = this.looperController.createStateData(this, {
      ...(Number.isFinite(this.trackCount) ? { trackCount: this.trackCount } : {}),
    });
    return this;
  }

  hasRuntimeData() {
    return Boolean(this.looperData);
  }

  record(now = performance.now()) {
    this.initialize();
    return this.looperController.startRecording(this, now);
  }

  finishRecording(now = performance.now()) {
    return this.looperController.stopRecording(this, now);
  }

  clearRecording() {
    return this.looperController.clearRecording(this);
  }

  play(now = performance.now(), options = {}) {
    return this.looperController.startPlayback(this, now, options);
  }

  resume(now = performance.now()) {
    return this.looperController.resumePlayback(this, now);
  }

  pause() {
    return this.looperController.pausePlayback(this);
  }

  stop() {
    return this.looperController.stopPlayback(this);
  }

  connectTrack(trackIndexOrId, honkId) {
    return this.looperController.connectTrackToHonk(this, trackIndexOrId, honkId);
  }

  disconnectTrack(trackIndexOrId, now = performance.now()) {
    return this.looperController.disconnectTrack(this, trackIndexOrId, now);
  }

  disconnectHonk(honkId, now = performance.now()) {
    return this.looperController.disconnectHonk(this, honkId, now);
  }

  recordTrackDrumHit(trackIndexOrId, drumType, now = performance.now()) {
    const track = this.looperController.getTrack(this, trackIndexOrId);
    return this.looperController.recordTrackDrumHit(this, track, drumType, now);
  }

  recordSelfDrumHit(drumType, now = performance.now()) {
    return this.looperController.recordSelfDrumHit(this, drumType, now);
  }

  setControl(control, value) {
    return this.looperController.setControlValue(this, control, value);
  }

  getMorphValue(morphName) {
    return this.morphController?.getValue?.(morphName) ?? 0;
  }

  setMorphValue(morphName, value) {
    return this.morphController?.setMorph?.(morphName, value) ?? false;
  }

  getTracks() {
    return this.tracks;
  }

  serialize() {
    this.initialize();
    const base = super.serialize();
    const looper = this.looperController.serializeState(this);
    return {
      ...base,
      appearance: { locked: Boolean(this.locked) },
      controls: looper.controls,
      timeline: looper.timeline,
    };
  }

  serializeRelationships() {
    return this.looperController.connections.serializeConnections(this).map((connection) => ({
      looperId: this.id,
      ...connection,
    }));
  }

  restore(serialized = {}, options = {}) {
    this.restoreEntity(serialized);
    return this.restoreTimeline(serialized, options);
  }

  restoreEntity(serialized = {}) {
    this.initialize();
    this.restoreTransform(serialized.transform);
    this.locked = Boolean(serialized.appearance?.locked ?? serialized.locked);
    return this;
  }

  restoreTimeline(serialized = {}, options = {}) {
    this.initialize();
    return this.looperController.restoreState(this, serialized.looper || serialized, options);
  }

  restoreConnections(connections = []) {
    this.initialize();
    return this.looperController.restoreConnections(this, connections);
  }

  dispose() {
    if (this.disposed) {
      return;
    }
    if (this.looperData) {
      for (const track of this.looperData.tracks || []) {
        disposeWireMesh(track.wireMesh);
        track.wireMesh = null;
      }
      this.looperController.releaseLooper(this);
      this.looperData = null;
    }
    disposeOwnedLooperResources(this.root);
    this.hitTargets = {};
    this.morphController = null;
    super.dispose();
  }
}

function disposeOwnedLooperResources(root) {
  const disposedGeometries = new Set();
  const disposedMaterials = new Set();
  root?.traverse?.((object) => {
    const isOwnedViewObject = Boolean(
      object.userData?.isLooperCollider ||
      object.userData?.isBodyGripTarget ||
      object.name?.startsWith("DEBUG_"),
    );
    const geometry = object.geometry;
    const ownsGeometry = isOwnedViewObject ||
      geometry?.userData?.disposeWithOwner ||
      geometry?.userData?.disposeOnInstrumentDelete;
    if (geometry && ownsGeometry && !disposedGeometries.has(geometry)) {
      geometry.dispose?.();
      disposedGeometries.add(geometry);
    }

    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      const ownsMaterial = isOwnedViewObject ||
        material?.userData?.disposeWithOwner ||
        material?.userData?.disposeOnInstrumentDelete;
      if (material && ownsMaterial && !disposedMaterials.has(material)) {
        material.dispose?.();
        disposedMaterials.add(material);
      }
    }
  });
}
