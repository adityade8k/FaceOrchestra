import { HONK_MASTER_GAIN } from "../../config/audio.js";
import { METRONOME_SETTINGS } from "../../config/metronome.js";
import { METRONOME_CONNECTION_TARGET_KINDS } from "../../instruments/metronome/MetronomeConnectionManager.js";

export const MetronomePulseRuntimeMethods = {
  getMetronomeConnectionRuntimeKey(connection) {
    return `${connection.metronomeId}:${connection.portId}`;
  },

  updateMetronomeHonkPulse(connection, now) {
    const key = this.getMetronomeConnectionRuntimeKey(connection);
    const metronome = this.instrumentRegistry.get(connection.metronomeId);
    const honk = this.instrumentRegistry.get(connection.targetId);
    const timing = metronome
      ? this.getCachedMetronomeTiming?.(metronome.id, now) || metronome.getBeatTiming?.(now)
      : null;
    let state = this.metronomePulseStates.get(key);
    if (!state) {
      state = {
        active: false,
        generation: 0,
        honk: null,
        lastBeatOrdinal: timing?.lastEmittedBeatOrdinal ?? null,
        releaseAtMs: 0,
      };
      this.metronomePulseStates.set(key, state);
    }
    if (!timing?.active) {
      this.releaseMetronomePulse(connection);
      return;
    }
    if (state.active) {
      if (!honk?.isPlayable?.()) {
        this.releaseMetronomePulse(connection);
        return;
      }
      if (now >= state.releaseAtMs) this.releaseMetronomePulse(connection);
    }
    const beatOrdinal = timing.lastEmittedBeatOrdinal;
    if (!Number.isInteger(beatOrdinal) || beatOrdinal === state.lastBeatOrdinal) return;
    state.lastBeatOrdinal = beatOrdinal;
    this.triggerMetronomeHonkPulse(connection, timing, now);
  },

  triggerMetronomeHonkPulse(connection, timing, now) {
    const key = this.getMetronomeConnectionRuntimeKey(connection);
    const honk = this.instrumentRegistry.get(connection.targetId);
    if (!honk?.isPlayable?.()) return false;
    const state = this.metronomePulseStates.get(key);
    if (!state) return false;
    if (state.active) this.releaseMetronomePulse(connection);
    state.active = true;
    state.honk = honk;
    state.generation += 1;
    const generation = state.generation;
    const gateSeconds = Math.min(
      METRONOME_SETTINGS.honkBeatGateMaxSeconds,
      Math.max(
        METRONOME_SETTINGS.honkBeatGateMinSeconds,
        (timing.beatIntervalMs / 1000) * METRONOME_SETTINGS.honkBeatGateRatio,
      ),
    );
    state.releaseAtMs = now + gateSeconds * 1000;
    honk.setAutomationLayer?.(
      this.getMetronomePulseLayerId(connection),
      { squeeze: 1 },
      { gain: HONK_MASTER_GAIN },
    );
    honk.startAudioVoice?.(this.getMetronomePulseVoiceId(connection));
    return state.generation === generation;
  },

  releaseMetronomePulseMember(connection, honk) {
    if (!honk) return;
    honk.clearAutomationLayer?.(this.getMetronomePulseLayerId(connection));
    honk.releaseAudioVoice?.(this.getMetronomePulseVoiceId(connection, honk.id), {
      fadeSeconds: METRONOME_SETTINGS.honkBeatReleaseFadeSeconds,
    });
  },

  releaseMetronomePulse(connection) {
    const key = this.getMetronomeConnectionRuntimeKey(connection);
    const state = this.metronomePulseStates.get(key);
    if (!state || (!state.active && !state.honk)) return false;
    state.generation += 1;
    state.active = false;
    state.releaseAtMs = 0;
    this.releaseMetronomePulseMember(connection, state.honk);
    state.honk = null;
    return true;
  },

  releaseMetronomePulsesForMetronome(metronomeId) {
    for (const connection of this.metronomeConnectionManager.getConnectionsForMetronome(metronomeId)) {
      if (connection.targetKind === METRONOME_CONNECTION_TARGET_KINDS.honk) {
        this.releaseMetronomePulse(connection);
      }
    }
  },

  getMetronomePulseLayerId(connection) {
    return `metronome-${connection.metronomeId}:port-${connection.portId}:honk-${connection.targetId}:pulse`;
  },

  getMetronomePulseVoiceId(connection) {
    return `metronome-${connection.metronomeId}:port-${connection.portId}:honk-${connection.targetId}`;
  },
};
