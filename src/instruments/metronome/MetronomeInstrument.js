import {
  METRONOME_BUTTON_ACTIONS,
  METRONOME_SETTINGS,
} from "../../config/metronome.js";
import { INSTRUMENT_KINDS } from "../core/capabilities.js";
import { InstrumentEntity } from "../core/InstrumentEntity.js";

export const METRONOME_INTERACTION_ROLES = Object.freeze({
  body: "metronome.body",
  play: "metronome.play",
  pause: "metronome.pause",
  bpm: "metronome.bpm",
  volume: "metronome.volume",
});

export class MetronomeInstrument extends InstrumentEntity {
  constructor({ id, root, interactionTargetRegistry = null, targets = {}, audioSystem = null,
    bpm = METRONOME_SETTINGS.defaultBpm, volume = METRONOME_SETTINGS.defaultVolume,
    componentId = "metronome", handleRig = null, buttonRig = null, pendulumRig = null,
    metadata = {} } = {}) {
    super({ id, kind: INSTRUMENT_KINDS.metronome, root, interactionTargetRegistry, metadata });
    this.componentId = componentId;
    this.audioSystem = audioSystem;
    this.handleRig = handleRig;
    this.buttonRig = buttonRig;
    this.pendulumRig = pendulumRig;
    this.bpm = clamp(bpm, METRONOME_SETTINGS.minBpm, METRONOME_SETTINGS.maxBpm);
    this.volume = clamp(volume, METRONOME_SETTINGS.minVolume, METRONOME_SETTINGS.maxVolume);
    this.playing = false;
    this.nextTickMs = null;
    this.nextBeatIndex = null;
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
    let now = null;
    if (
      this.playing &&
      Number.isFinite(this.nextTickMs) &&
      Number.isFinite(this.beatOriginMs)
    ) {
      now = performance.now();
      const previousInterval = 60000 / previousBpm;
      const nextInterval = 60000 / nextBpm;
      const beatPhase = (now - this.beatOriginMs) / previousInterval;
      const nextBeatIndex = Number.isInteger(this.nextBeatIndex)
        ? this.nextBeatIndex
        : Math.round((this.nextTickMs - this.beatOriginMs) / previousInterval);
      this.beatOriginMs = now - beatPhase * nextInterval;
      this.nextBeatIndex = nextBeatIndex;
      this.nextTickMs = this.beatOriginMs + nextBeatIndex * nextInterval;
    }
    this.bpm = nextBpm;
    this.handleRig?.setValue("bpm", this.bpm);
    if (this.playing) this.updatePendulum(now ?? performance.now());
    return this.bpm;
  }

  setVolume(value) {
    this.volume = clamp(value, METRONOME_SETTINGS.minVolume, METRONOME_SETTINGS.maxVolume);
    this.handleRig?.setValue("volume", this.volume);
    return this.volume;
  }

  play(now = performance.now()) {
    if (this.playing) {
      this.buttonRig?.setPressed(METRONOME_BUTTON_ACTIONS.pause, false);
      this.buttonRig?.press(METRONOME_BUTTON_ACTIONS.play, now);
      this.updatePendulum(now);
      return true;
    }
    this.playing = true;
    this.lastTickMs = null;
    this.nextTickMs = now;
    this.nextBeatIndex = 0;
    this.beatOriginMs = now;
    this.buttonRig?.setPressed(METRONOME_BUTTON_ACTIONS.pause, false);
    this.buttonRig?.press(METRONOME_BUTTON_ACTIONS.play, now);
    this.updatePendulum(now);
    return true;
  }

  pause() {
    this.playing = false;
    this.nextTickMs = null;
    this.nextBeatIndex = null;
    this.lastTickMs = null;
    this.beatOriginMs = null;
    this.buttonRig?.reset();
    this.pendulumRig?.reset();
    return false;
  }

  pressButton(action, now = performance.now()) {
    if (action === METRONOME_BUTTON_ACTIONS.play) return this.play(now);
    if (action === METRONOME_BUTTON_ACTIONS.pause) {
      this.pause();
      this.buttonRig?.press(METRONOME_BUTTON_ACTIONS.pause, now);
    }
    return this.playing;
  }

  toggle(now = performance.now()) {
    return this.playing ? this.pause() : this.play(now);
  }

  update(now = performance.now()) {
    this.buttonRig?.update(now);
    this.updatePendulum(now);
    if (!this.playing) return false;
    if (
      !Number.isFinite(this.nextTickMs) ||
      !Number.isFinite(this.beatOriginMs) ||
      !Number.isInteger(this.nextBeatIndex)
    ) {
      this.nextTickMs = now;
      this.nextBeatIndex = 0;
      this.beatOriginMs = now;
    }
    if (now < this.nextTickMs) return false;
    this.audioSystem?.triggerMetronomeClick?.({ volume: this.volume });
    const interval = 60000 / this.bpm;
    this.lastTickMs = this.nextTickMs;
    do {
      this.nextBeatIndex += 1;
      this.nextTickMs = this.beatOriginMs + this.nextBeatIndex * interval;
    }
    while (this.nextTickMs <= now);
    return true;
  }

  updatePendulum(now = performance.now()) {
    return this.pendulumRig?.update({
      nowMs: now,
      bpm: this.bpm,
      beatOriginMs: this.beatOriginMs,
      playing: this.playing,
    }) ?? 0;
  }

  getBeatTiming(now = performance.now()) {
    const beatIntervalMs = 60000 / this.bpm;
    if (!this.playing || !Number.isFinite(this.beatOriginMs)) {
      return {
        active: false,
        bpm: this.bpm,
        beatIntervalMs,
        beatOriginMs: null,
        nearestBeatMs: now,
      };
    }
    const beatIndex = Math.round((now - this.beatOriginMs) / beatIntervalMs);
    return {
      active: true,
      bpm: this.bpm,
      beatIntervalMs,
      beatOriginMs: this.beatOriginMs,
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
    this.handleRig?.dispose?.();
    this.handleRig = null;
    this.buttonRig?.dispose?.();
    this.buttonRig = null;
    this.pendulumRig?.dispose?.();
    this.pendulumRig = null;
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
