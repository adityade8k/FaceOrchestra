import {
  METRONOME_BUTTON_ACTIONS,
  METRONOME_CONNECTION_ROLE,
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
  connectionPort: METRONOME_CONNECTION_ROLE,
});

export class MetronomeInstrument extends InstrumentEntity {
  constructor({ id, root, interactionTargetRegistry = null, targets = {}, audioSystem = null,
    bpm = METRONOME_SETTINGS.defaultBpm, volume = METRONOME_SETTINGS.defaultVolume,
    componentId = "metronome", handleRig = null, buttonRig = null, pendulumRig = null,
    onTransportChange = null, metadata = {} } = {}) {
    super({ id, kind: INSTRUMENT_KINDS.metronome, root, interactionTargetRegistry, metadata });
    this.componentId = componentId;
    this.audioSystem = audioSystem;
    this.handleRig = handleRig;
    this.buttonRig = buttonRig;
    this.pendulumRig = pendulumRig;
    this.onTransportChange = onTransportChange;
    this.bpm = clamp(bpm, METRONOME_SETTINGS.minBpm, METRONOME_SETTINGS.maxBpm);
    this.volume = clamp(volume, METRONOME_SETTINGS.minVolume, METRONOME_SETTINGS.maxVolume);
    this.handleRig?.setValue("bpm", this.bpm);
    this.handleRig?.setValue("volume", this.volume);
    this.playing = false;
    this.nextTickMs = null;
    this.nextBeatIndex = null;
    this.lastTickMs = null;
    this.lastEmittedBeatOrdinal = null;
    this.beatOriginMs = null;
    this.targetsByRole = new Map();
    this.connectionPorts = new Map();
    for (const [role, target] of Object.entries(targets)) {
      if (!target) continue;
      const interactionRole = target.userData?.interactionRole || role;
      this.targetsByRole.set(role, target);
      if (target.userData?.isMetronomeConnectionPort && target.userData.metronomePortId) {
        this.connectionPorts.set(target.userData.metronomePortId, target);
      }
      if (interactionTargetRegistry) this.registerInteractionTarget(interactionRole, target);
    }
  }

  setBpm(value) {
    const previousBpm = this.bpm;
    const nextBpm = Math.round(clamp(value, METRONOME_SETTINGS.minBpm, METRONOME_SETTINGS.maxBpm));
    let now = null;
    if (Number.isFinite(this.beatOriginMs)) {
      now = performance.now();
      const previousInterval = 60000 / previousBpm;
      const nextInterval = 60000 / nextBpm;
      const beatPhase = (now - this.beatOriginMs) / previousInterval;
      this.beatOriginMs = now - beatPhase * nextInterval;
      if (this.playing) {
        this.nextBeatIndex = Math.ceil(beatPhase - 1e-9);
        this.nextTickMs = this.beatOriginMs + this.nextBeatIndex * nextInterval;
      }
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
    this.lastEmittedBeatOrdinal = null;
    const beatIntervalMs = 60000 / this.bpm;
    if (Number.isFinite(this.beatOriginMs)) {
      const beatPosition = (now - this.beatOriginMs) / beatIntervalMs;
      this.nextBeatIndex = Math.ceil(beatPosition - 1e-9);
      this.nextTickMs = this.beatOriginMs + this.nextBeatIndex * beatIntervalMs;
    } else {
      this.nextTickMs = now;
      this.nextBeatIndex = 0;
      this.beatOriginMs = now;
    }
    this.buttonRig?.setPressed(METRONOME_BUTTON_ACTIONS.pause, false);
    this.buttonRig?.press(METRONOME_BUTTON_ACTIONS.play, now);
    this.updatePendulum(now);
    this.onTransportChange?.({ metronome: this, playing: true, now });
    return true;
  }

  pause(now = performance.now()) {
    const wasPlaying = this.playing;
    this.playing = false;
    this.nextTickMs = null;
    this.nextBeatIndex = null;
    this.lastTickMs = null;
    this.lastEmittedBeatOrdinal = null;
    this.buttonRig?.reset();
    this.pendulumRig?.reset();
    if (wasPlaying) this.onTransportChange?.({ metronome: this, playing: false, now });
    return false;
  }

  pressButton(action, now = performance.now()) {
    if (action === METRONOME_BUTTON_ACTIONS.play) return this.play(now);
    if (action === METRONOME_BUTTON_ACTIONS.pause) {
      this.pause(now);
      this.buttonRig?.press(METRONOME_BUTTON_ACTIONS.pause, now);
    }
    return this.playing;
  }

  toggle(now = performance.now()) {
    return this.playing ? this.pause(now) : this.play(now);
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
    const interval = 60000 / this.bpm;
    const dueBeatOrdinal = Math.max(
      this.nextBeatIndex,
      Math.floor((now - this.beatOriginMs) / interval + 1e-9),
    );
    this.lastEmittedBeatOrdinal = dueBeatOrdinal;
    this.lastTickMs = this.beatOriginMs + dueBeatOrdinal * interval;
    this.nextBeatIndex = dueBeatOrdinal + 1;
    this.nextTickMs = this.beatOriginMs + this.nextBeatIndex * interval;
    this.audioSystem?.triggerMetronomeClick?.({ volume: this.volume });
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
    if (!Number.isFinite(this.beatOriginMs)) {
      return {
        active: false,
        clockAvailable: false,
        bpm: this.bpm,
        beatIntervalMs,
        beatOriginMs: null,
        nearestBeatMs: now,
        beatPosition: null,
        lastBeatMs: null,
        lastEmittedBeatOrdinal: null,
      };
    }
    const beatPosition = (now - this.beatOriginMs) / beatIntervalMs;
    const beatIndex = Math.round(beatPosition);
    const currentBeatOrdinal = Math.floor(beatPosition + 1e-9);
    return {
      active: this.playing,
      clockAvailable: true,
      bpm: this.bpm,
      beatIntervalMs,
      beatOriginMs: this.beatOriginMs,
      nearestBeatMs: this.beatOriginMs + beatIndex * beatIntervalMs,
      beatPosition,
      lastBeatMs: this.beatOriginMs + currentBeatOrdinal * beatIntervalMs,
      lastEmittedBeatOrdinal: this.lastEmittedBeatOrdinal,
    };
  }

  getConnectionPortTarget(portId) {
    return this.connectionPorts.get(portId) || null;
  }

  hasConnectionPort(portId) {
    return this.connectionPorts.has(portId);
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
    this.connectionPorts.clear();
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
