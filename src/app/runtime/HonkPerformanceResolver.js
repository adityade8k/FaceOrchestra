import { BEND_SMOOTHING, SQUEEZE_SENSITIVITY } from "../../config/honk.js";
import {
  REFERENCE_FRAME_MS,
  advanceHonkPresentation,
  resolvePresentationValue,
} from "./HonkPerformanceSampling.js";

// Owns visual resolution only. Audio scheduling and recording keep their own
// clocks and consume the canonical processed live state, not the visual easing.
export class HonkPerformanceResolver {
  constructor({ applyMorphState, updateColliders, applyScale }) {
    this.applyMorphState = applyMorphState;
    this.updateColliders = updateColliders;
    this.applyScale = applyScale;
    this.cache = new WeakMap();
    this.metrics = { resolved: 0, skipped: 0 };
  }

  update(honks, now) {
    this.metrics.resolved = this.metrics.skipped = 0;
    for (const state of honks) {
      if (state.kind !== "honk" || state.disposed) continue;
      const deltaMs = Number.isFinite(state.lastHonkPerformanceUpdateMs)
        ? Math.max(now - state.lastHonkPerformanceUpdateMs, 0)
        : REFERENCE_FRAME_MS;
      // Even a skipped idle Honk observes elapsed frame time: its next attack
      // must not inherit the entire idle interval and jump to full amplitude.
      state.lastHonkPerformanceUpdateMs = now;
      const cached = this.cache.get(state);
      if (cached?.settled && matches(cached, state)) {
        this.metrics.skipped++;
      } else {
        this.metrics.resolved++;
        const rawLive = state.getLivePerformanceState?.() || {};
        const processedLive = {
          ...rawLive,
          squeeze: settle(
            resolvePresentationValue(
              state.processedLivePerformance?.squeeze ?? state.hornSqueezeValue ?? 0,
              rawLive.squeeze ?? 0,
              SQUEEZE_SENSITIVITY,
              deltaMs,
              false,
            ),
            rawLive.squeeze ?? 0,
          ),
          bend: settle(
            resolvePresentationValue(
              state.processedLivePerformance?.bend ?? state.bendValue ?? 0,
              rawLive.bend ?? 0,
              BEND_SMOOTHING,
              deltaMs,
              state.liveBendSnapped && state.hornHolders.size === 1,
            ),
            rawLive.bend ?? 0,
          ),
        };
        state.processedLivePerformance = processedLive;
        const resolved =
          state.performance?.resolveWithLiveState?.(processedLive) ||
          state.getResolvedPerformanceState?.();
        state.hornSqueezeValue = resolved?.squeeze ?? processedLive.squeeze;
        state.targetBendValue = resolved?.bend ?? processedLive.bend;
        state.bendValue = state.targetBendValue;
        state.honkPresentation = advanceHonkPresentation(
          state.honkPresentation,
          { squeeze: state.hornSqueezeValue, bend: state.bendValue },
          processedLive,
          state.performance?.automationRevision ?? 0,
          deltaMs,
        );
        if (resolved) {
          state.applyMorphPerformanceState({
            ...resolved,
            squeeze: state.honkPresentation.squeeze,
            bend: state.honkPresentation.bend,
          });
          this.applyMorphState(state, resolved);
        }
        this.updateColliders(state);
        this.cache.set(state, {
          performance: state.performance,
          revision: state.performance?.revision,
          presentationRevision: state.presentationRevision,
          presentation: state.honkPresentation,
          locked: state.locked,
          pitchSnap: state.pitchSnap,
          scalePresetNote: state.scalePresetNote,
          label: state.noteLabelGroup,
          settled:
            processedLive.squeeze === (rawLive.squeeze ?? 0) &&
            processedLive.bend === (rawLive.bend ?? 0) &&
            state.honkPresentation.squeeze === state.hornSqueezeValue &&
            state.honkPresentation.bend === state.bendValue,
        });
      }
      // Placement and parent/group scaling can change between queries without
      // changing performance. Keep transform-dependent label compensation live.
      this.applyScale(state, 1 + state.hornSqueezeValue * 0.035);
    }
  }
}

function matches(cached, state) {
  return (
    Number.isFinite(state.performance?.revision) &&
    cached.performance === state.performance &&
    cached.revision === state.performance.revision &&
    cached.presentationRevision === state.presentationRevision &&
    cached.presentation === state.honkPresentation &&
    cached.locked === state.locked &&
    cached.pitchSnap === state.pitchSnap &&
    cached.scalePresetNote === state.scalePresetNote &&
    cached.label === state.noteLabelGroup
  );
}

function settle(value, target) {
  return Math.abs(value - target) < 1e-7 ? target : value;
}
