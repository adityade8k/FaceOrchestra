import { METRONOME_SETTINGS } from "../../config/metronome.js";
import { INSTRUMENT_KINDS } from "../core/capabilities.js";
import { InstrumentEntity } from "../core/InstrumentEntity.js";

export const METRONOME_INTERACTION_ROLES = Object.freeze({
  body: "metronome.body",
  bpm: "metronome.bpm",
  volume: "metronome.volume",
});

export class MetronomeInstrument extends InstrumentEntity {
  constructor({ id, root, interactionTargetRegistry = null, targets = {}, audioSystem = null,
    bpm = METRONOME_SETTINGS.defaultBpm, volume = METRONOME_SETTINGS.defaultVolume,
    componentId = "metronome", metadata = {} } = {}) {
    super({ id, kind: INSTRUMENT_KINDS.metronome, root, interactionTargetRegistry, metadata });
    this.componentId = componentId;
    this.audioSystem = audioSystem;
    this.bpm = clamp(bpm, METRONOME_SETTINGS.minBpm, METRONOME_SETTINGS.maxBpm);
    this.volume = clamp(volume, METRONOME_SETTINGS.minVolume, METRONOME_SETTINGS.maxVolume);
    this.playing = false;
    this.nextTickMs = null;
    this.lastTickMs = null;
    this.beatOriginMs = null;
    this.targetsByRole = new Map();
    for (const [role, target] of Object.entries(targets)) {
      if (!target) continue;
      this.targetsByRole.set(role, target);
      if (interactionTargetRegistry) this.registerInteractionTarget(role, target);
    }
  }

  setBpm(value) {
    const previousBpm = this.bpm;
    const nextBpm = Math.round(clamp(value, METRONOME_SETTINGS.minBpm, METRONOME_SETTINGS.maxBpm));
    if (this.playing && Number.isFinite(this.nextTickMs)) {
      const now = performance.now();
      const previousInterval = 60000 / previousBpm;
      const nextInterval = 60000 / nextBpm;
      const remainingBeatFraction = clamp((this.nextTickMs - now) / previousInterval, 0, 1);
      this.nextTickMs = now + nextInterval * remainingBeatFraction;
      this.beatOriginMs = this.nextTickMs - nextInterval;
    }
    this.bpm = nextBpm;
    return this.bpm;
  }

  setVolume(value) {
    this.volume = clamp(value, METRONOME_SETTINGS.minVolume, METRONOME_SETTINGS.maxVolume);
    return this.volume;
  }

  play(now = performance.now()) {
    this.playing = true;
    this.lastTickMs = null;
    this.nextTickMs = now;
    this.beatOriginMs = now;
    return true;
  }

  pause() {
    this.playing = false;
    this.nextTickMs = null;
    this.lastTickMs = null;
    this.beatOriginMs = null;
    return false;
  }

  toggle(now = performance.now()) {
    return this.playing ? this.pause() : this.play(now);
  }

  update(now = performance.now()) {
    if (!this.playing || this.pendingPlacement) return false;
    if (!Number.isFinite(this.nextTickMs)) this.nextTickMs = now;
    if (now < this.nextTickMs) return false;
    this.audioSystem?.triggerMetronomeClick?.({ volume: this.volume });
    const interval = 60000 / this.bpm;
    this.lastTickMs = this.nextTickMs;
    do this.nextTickMs += interval;
    while (this.nextTickMs <= now);
    return true;
  }

  getBeatTiming(now = performance.now()) {
    const beatIntervalMs = 60000 / this.bpm;
    if (!this.playing || !Number.isFinite(this.beatOriginMs)) {
      return { active: false, bpm: this.bpm, beatIntervalMs, nearestBeatMs: now };
    }
    const beatIndex = Math.round((now - this.beatOriginMs) / beatIntervalMs);
    return {
      active: true,
      bpm: this.bpm,
      beatIntervalMs,
      nearestBeatMs: this.beatOriginMs + beatIndex * beatIntervalMs,
    };
  }

  serialize() {
    return { ...super.serialize(), componentId: this.componentId, bpm: this.bpm, volume: this.volume };
  }

  restore(saved = {}) {
    this.restoreTransform(saved.transform);
    this.setBpm(saved.bpm ?? this.bpm);
    this.setVolume(saved.volume ?? this.volume);
    this.pause();
    return this;
  }

  dispose() {
    this.pause();
    this.targetsByRole.clear();
    this.metronomeLabelTexture?.dispose?.();
    this.metronomeLabelTexture = null;
    this.metronomeLabelCanvas = null;
    this.root.traverse?.((object) => {
      if (object.geometry?.userData?.disposeWithOwner) object.geometry.dispose?.();
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (material?.userData?.disposeWithOwner || material?.userData?.disposeOnInstrumentDelete) {
          material.dispose?.();
        }
      }
    });
    super.dispose();
  }
}

function clamp(value, min, max) {
  return Math.min(Math.max(Number.isFinite(value) ? value : min, min), max);
}
