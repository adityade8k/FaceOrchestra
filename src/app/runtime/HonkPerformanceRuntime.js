import * as THREE from "three";
import { HONK_MASTER_GAIN } from "../../config/audio.js";
import {
  BEND_COLLIDER_ROTATION_DEGREES,
  BEND_SENSITIVITY,
  BEND_SMOOTHING,
  INTERACTION_TARGET_NAMES,
  SQUEEZE_SENSITIVITY,
} from "../../config/honk.js";
import { LOOPER_SQUEEZE_GATE_OPEN_THRESHOLD } from "../../config/looper.js";
import { isHonkSqueezeTarget } from "../../instruments/honk/HonkInteractionProfile.js";
import { releaseControllerHonkVoice } from "./ControllerHonkRelease.js";
import {
  REFERENCE_FRAME_MS,
  captureCanonicalHonkPerformance,
  advanceHonkPresentation,
  resolvePresentationValue,
} from "./HonkPerformanceSampling.js";

const tempBendQuaternion = new THREE.Quaternion();
const tempBendEuler = new THREE.Euler();

export const HonkPerformanceRuntimeMethods = {
    updateHorn(now = performance.now()) {
      for (const state of this.instrumentStates) {
        state.hornHolders.clear();
        state.activeBends.clear();
      }
  
      const activeHoldInteractions = [];
      for (const controller of this.controllers) {
        const controllerState = this.controllerStates.get(controller);
        if (controllerState?.stickActive) {
          this.clearControllerTriggerInteraction(controllerState);
          continue;
        }
  
        if (controllerState?.suppressTriggerUntilRelease) {
          this.releaseRaySqueeze(controllerState);
          continue;
        }
  
        if (!controllerState?.trigger) {
          this.releaseRaySqueeze(controllerState);
          continue;
        }
        const interaction = controllerState?.activeTriggerInteraction;
        if (interaction?.type === "holdSqueeze") {
          if (isHonkSqueezeTarget(interaction.instrumentState, interaction.target) &&
              this.instrumentRegistry.get(interaction.instrumentState.id) === interaction.instrumentState) {
            activeHoldInteractions.push({ interaction, controller });
            continue;
          }
          for (const voiceId of interaction.activeVoiceIds || []) {
            releaseControllerHonkVoice(this, voiceId, interaction.instrumentState);
          }
          controllerState.activeTriggerInteraction = null;
        }
        const looperInteractionActive =
          interaction?.type === "looperWire" ||
          interaction?.type === "looperControlDrag" ||
          interaction?.type === "metronomeWire";
        // Share this selection only across the adjacent, read-only routing work.
        // Hover runs before grip/relationship transforms, so its hit cannot be reused here.
        const hit = controllerState?.trigger ? this.getCurrentHit(controller) : null;
        const triggerBlockedByLooper =
          controllerState?.trigger && this.isLooperColliderTarget(hit?.object);
        if (controllerState?.trigger && (looperInteractionActive || triggerBlockedByLooper)) {
          this.releaseRaySqueeze(controllerState);
        }
        if (
          controllerState?.trigger &&
          interaction?.type !== "verticalDragMorph" &&
          !looperInteractionActive &&
          !triggerBlockedByLooper
        ) {
          const raySqueezeInteraction = this.getRaySqueezeInteraction(controller, controllerState, hit);
          if (raySqueezeInteraction) {
            activeHoldInteractions.push({ interaction: raySqueezeInteraction, controller });
          }
        }
      }
  
      for (const { interaction, controller } of activeHoldInteractions) {
        const chain = this.getTouchingInstrumentChain(interaction.instrumentState);
        const playableChain = chain.filter((chainState) => chainState.isPlayable());
        const desiredVoiceIds = new Set();
        const bendAmount = this.getControllerRollBend(controller, interaction);
  
        for (const chainState of playableChain) {
          const voiceId = this.getInstrumentVoiceId(interaction.voiceId, chainState);
          desiredVoiceIds.add(voiceId);
          chainState.hornHolders.add(voiceId);
          chainState.activeBends.set(voiceId, bendAmount);
          if (!interaction.activeVoiceIds?.has(voiceId) || !chainState.hasAudioVoice(voiceId)) {
            // The service is authoritative for pending/failed/cancelled starts;
            // membership alone is insufficient after an asynchronous failure.
            Promise.resolve(chainState.startAudioVoice(voiceId)).catch(() => {
              // Startup removed its pending token. Retry while still owned on
              // the next performance pass, never after this gesture releases.
            });
          }
        }
  
        for (const activeVoiceId of interaction.activeVoiceIds || []) {
          if (!desiredVoiceIds.has(activeVoiceId)) {
            releaseControllerHonkVoice(this, activeVoiceId);
          }
        }
  
        if (interaction.isRaySqueeze) {
          interaction.activeVoiceIds.clear();
          for (const voiceId of desiredVoiceIds) {
            interaction.activeVoiceIds.add(voiceId);
          }
        } else {
          interaction.activeVoiceIds = desiredVoiceIds;
        }
        interaction.activeChain = playableChain;
      }
  
      for (const state of this.instrumentStates) {
        if (state.kind !== "honk") {
          continue;
        }
  
        let bendSum = 0;
        for (const value of state.activeBends.values()) {
          bendSum += value;
        }
        const liveSqueeze = state.hornHolders.size > 0 ? 1 : 0;
        const liveBend = liveSqueeze > 0 ? THREE.MathUtils.clamp(bendSum, -1, 1) : 0;
        state.setLivePerformance?.({
          squeeze: liveSqueeze,
          bend: liveBend,
        });
      }
  
      this.updateLooperPlayback(now);
      this.applyResolvedHonkPerformanceStates(now);
  
      for (const { interaction } of activeHoldInteractions) {
        for (const synthState of interaction.activeChain || []) {
          const voiceId = this.getInstrumentVoiceId(interaction.voiceId, synthState);
          const livePerformance = synthState.getProcessedLivePerformanceState?.() ||
            synthState.getLivePerformanceState?.() || {};
          synthState.updateAudioVoice(voiceId, {
            squeeze: livePerformance.squeeze,
            bend: livePerformance.bend,
            earLeft: livePerformance.earLeft,
            earRight: livePerformance.earRight,
            nose: livePerformance.nose,
            vowel: livePerformance.vowel,
          }, { gain: HONK_MASTER_GAIN });
        }
      }
  
      this.updateLooperPlaybackAudio();
    },
    clearLiveHornInteractionState() {
      for (const state of this.instrumentStates) {
        if (state.kind !== "honk") {
          continue;
        }
  
        state.hornHolders.clear();
        state.activeBends.clear();
        state.setLivePerformance?.({
          squeeze: 0,
          bend: 0,
        });
      }
    },
    applyResolvedHonkPerformanceStates(now = performance.now()) {
      for (const state of this.instrumentStates) {
        if (state.kind !== "honk") {
          continue;
        }
  
        const rawLive = state.getLivePerformanceState?.() || {};
        const deltaMs = Number.isFinite(state.lastHonkPerformanceUpdateMs)
          ? Math.max(now - state.lastHonkPerformanceUpdateMs, 0)
          : REFERENCE_FRAME_MS;
        state.lastHonkPerformanceUpdateMs = now;
        const processedLive = {
          ...rawLive,
          squeeze: resolvePresentationValue(
            state.processedLivePerformance?.squeeze ?? state.hornSqueezeValue ?? 0,
            rawLive.squeeze ?? 0,
            SQUEEZE_SENSITIVITY,
            deltaMs,
            false,
          ),
          bend: resolvePresentationValue(
            state.processedLivePerformance?.bend ?? state.bendValue ?? 0,
            rawLive.bend ?? 0,
            BEND_SMOOTHING,
            deltaMs,
            false,
          ),
        };
        state.processedLivePerformance = processedLive;
        const resolved = state.performance?.resolveWithLiveState?.(processedLive) ||
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
          this.applyResolvedHonkMorphState(state, resolved);
        }
        this.updateBendAlignedColliders(state);
  
        const pulse = 1 + state.hornSqueezeValue * 0.035;
        this.applyInstrumentVisualScale(state, pulse);
      }
    },
    releaseHonkVoice(voiceId, options = {}) {
      for (const honk of this.instrumentRegistry.getByKind("honk")) {
        if (!honk.activeVoiceIds?.has(voiceId)) continue;
        honk.releaseAudioVoice(voiceId, options);
        return true;
      }
      return false;
    },
    captureLooperActionFromHonk(honkState) {
      return captureCanonicalHonkPerformance(
        honkState,
        LOOPER_SQUEEZE_GATE_OPEN_THRESHOLD,
      );
    },
    setHonkAutomationLayer(honkState, layerId, snapshot) {
      if (!honkState?.setAutomationLayer) {
        return;
      }
      honkState.setAutomationLayer(layerId, snapshot);
    },
    clearHonkAutomationLayer(honkState, layerId) {
      honkState?.clearAutomationLayer?.(layerId);
    },
    getLooperAutomationLayerId(looperState, track) {
      return `looper-${looperState.id}:track-${track.index}`;
    },
    getLooperActionVoiceId(looperState, track, honkState) {
      return `${this.getLooperAutomationLayerId(looperState, track)}:instrument-${honkState.id}:action`;
    },
    updateLooperActionVoice(voiceId, honkState, snapshot, volume, options = {}) {
      if (honkState?.kind !== "honk" || !honkState.root?.visible) {
        this.releaseHonkVoice(voiceId);
        return;
      }
      const livePerformance = honkState.getProcessedLivePerformanceState?.() ||
        honkState.getLivePerformanceState?.() || {};
      honkState.updateAudioVoice(voiceId, {
        squeeze: THREE.MathUtils.clamp(snapshot.squeeze || 0, 0, 1),
        bend: snapshot.bend ?? 0,
        earLeft: snapshot.earLeft ?? livePerformance.earLeft,
        earRight: snapshot.earRight ?? livePerformance.earRight,
        nose: snapshot.nose ?? livePerformance.nose,
        vowel: snapshot.vowel ?? livePerformance.vowel,
      }, {
        gain: HONK_MASTER_GAIN * volume,
        scheduledTime: options.scheduledTime,
      });
    },
    applyResolvedHonkMorphState(honkState, resolved) {
      this.applyVowelLetterToState(resolved.vowel, honkState, { updateLiveState: false, updateAudio: false });
  
      const leftEar = honkState.hitTargets[INTERACTION_TARGET_NAMES.leftEar];
      const rightEar = honkState.hitTargets[INTERACTION_TARGET_NAMES.rightEar];
      const nose = honkState.hitTargets[INTERACTION_TARGET_NAMES.nose];
      if (leftEar?.userData.isProceduralMorphTarget) {
        this.setSpherePositionFromSignedValue(leftEar, resolved.earLeft);
      }
      if (rightEar?.userData.isProceduralMorphTarget) {
        this.setSpherePositionFromSignedValue(rightEar, resolved.earRight);
      }
      if (nose?.userData.isProceduralMorphTarget) {
        this.setSpherePositionFromMorph(nose, resolved.nose);
      }
      this.updateNoteLabel(honkState);
    },
    getRaySqueezeInteraction(controller, controllerState, hit = this.getCurrentHit(controller)) {
      if (!controllerState?.trigger) {
        this.releaseRaySqueeze(controllerState);
        return null;
      }
      const captured = controllerState.raySqueezeInstrumentState;
      if (captured && (!isHonkSqueezeTarget(captured, controllerState.raySqueezeTarget) ||
          this.instrumentRegistry.get(captured.id) !== captured)) {
        this.releaseRaySqueeze(controllerState);
      }
      // A fresh sphere hit may acquire/retarget during Trigger hold. Otherwise
      // retain the validated capture so roll-bending can move away from it.
      this.captureRaySqueezeTarget(controller, controllerState, hit);
      const instrumentState = controllerState.raySqueezeInstrumentState;
      if (!instrumentState) return null;
      return {
        type: "holdSqueeze",
        target: controllerState.raySqueezeTarget,
        targetName: INTERACTION_TARGET_NAMES.horn,
        instrumentState,
        voiceId: controllerState.raySqueezeVoiceId || this.getControllerVoiceId(controller),
        activeVoiceIds: controllerState.raySqueezeActiveVoiceIds,
        bendStartInverseQuaternion: controllerState.raySqueezeStartInverseQuaternion,
        isRaySqueeze: true,
      };
    },
    updateBendAlignedColliders(state) {
      if (!state.bendAlignedColliderGroup) {
        return;
      }
  
      state.bendAlignedColliderGroup.rotation.z =
        state.bendValue * THREE.MathUtils.degToRad(BEND_COLLIDER_ROTATION_DEGREES);
    },
    getControllerRollBend(controller, interaction) {
      controller.updateMatrixWorld(true);
      controller.getWorldQuaternion(tempBendQuaternion);
      tempBendQuaternion.premultiply(interaction.bendStartInverseQuaternion);
      tempBendEuler.setFromQuaternion(tempBendQuaternion, "XYZ");
      return THREE.MathUtils.clamp(tempBendEuler.z * BEND_SENSITIVITY, -1, 1);
    },
    getTouchingInstrumentChain(startState) {
      if (startState?.kind !== "honk") return [];
      const memberIds = this.honkContactGraph.getConnectedComponent(startState.id);
      if (memberIds.size === 0 && startState.root?.visible) memberIds.add(startState.id);
      return [...memberIds]
        .map((id) => this.instrumentRegistry.get(id))
        .filter((honk) => honk?.kind === "honk" && honk.root?.visible);
    },
};
