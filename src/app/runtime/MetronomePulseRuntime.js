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
    const timing = metronome?.getBeatTiming?.(now);
    let state = this.metronomePulseStates.get(key);
    if (!state) {
      state = {
        active: false,
        generation: 0,
        members: new Map(),
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
      this.syncMetronomePulseFormation(connection, state, honk);
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
    state.members ||= new Map();
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
    return this.syncMetronomePulseFormation(connection, state, honk, generation) > 0;
  },

  syncMetronomePulseFormation(connection, state, sourceHonk, generation = state?.generation) {
    if (!state?.active || !sourceHonk) return 0;
    state.members ||= new Map();
    const playableMembers = (this.getTouchingInstrumentChain?.(sourceHonk) || [sourceHonk])
      .filter((honk) => honk?.isPlayable?.());
    if (!playableMembers.some((honk) => honk.id === sourceHonk.id)) {
      playableMembers.unshift(sourceHonk);
    }
    const desiredIds = new Set(playableMembers.map((honk) => honk.id));
    for (const [honkId, honk] of [...state.members]) {
      if (desiredIds.has(honkId)) continue;
      this.releaseMetronomePulseMember(connection, honk);
      state.members.delete(honkId);
    }

    const sourceResolved = sourceHonk.getResolvedPerformanceState?.() ||
      sourceHonk.getLivePerformanceState?.() || {};
    for (const honk of playableMembers) {
      const isSource = honk.id === sourceHonk.id;
      honk.setAutomationLayer?.(
        this.getMetronomePulseLayerId(connection),
        isSource
          ? { squeeze: 1 }
          : { squeeze: 1, bend: sourceResolved.bend ?? 0 },
      );
      if (!state.members.has(honk.id)) {
        state.members.set(honk.id, honk);
        const starting = honk.startAudioVoice(
          this.getMetronomePulseVoiceId(connection, honk.id),
        );
        Promise.resolve(starting).then(() => {
          const current = this.metronomePulseStates.get(
            this.getMetronomeConnectionRuntimeKey(connection),
          );
          if (
            current !== state ||
            !state.active ||
            state.generation !== generation ||
            state.members.get(honk.id) !== honk
          ) return;
          this.updateMetronomePulseMemberVoice(connection, honk);
        }).catch(() => {
          if (
            this.metronomePulseStates.get(
              this.getMetronomeConnectionRuntimeKey(connection),
            ) === state &&
            state.members.get(honk.id) === honk
          ) {
            this.releaseMetronomePulse(connection);
          }
        });
      }
      this.updateMetronomePulseMemberVoice(connection, honk);
    }
    return state.members.size;
  },

  updateMetronomePulseMemberVoice(connection, honk) {
    if (!honk) return;
    const resolved = honk.getResolvedPerformanceState?.() ||
      honk.getLivePerformanceState?.() || {};
    honk.updateAudioVoice(this.getMetronomePulseVoiceId(connection, honk.id), {
      ...resolved,
      squeeze: 1,
    }, { gain: HONK_MASTER_GAIN });
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
    if (!state || (!state.active && !state.honk && !state.members?.size)) return false;
    state.generation += 1;
    state.active = false;
    state.releaseAtMs = 0;
    state.members ||= new Map();
    if (state.honk && !state.members.has(state.honk.id)) {
      state.members.set(state.honk.id, state.honk);
    }
    for (const honk of state.members.values()) {
      this.releaseMetronomePulseMember(connection, honk);
    }
    state.members.clear();
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

  getMetronomePulseVoiceId(connection, honkId = connection.targetId) {
    const sourceId = `metronome-${connection.metronomeId}:port-${connection.portId}:honk-${connection.targetId}`;
    return honkId === connection.targetId ? sourceId : `${sourceId}:chord-${honkId}`;
  },
};
