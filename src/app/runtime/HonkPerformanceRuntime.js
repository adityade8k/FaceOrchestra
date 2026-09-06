import * as THREE from "three";
import { HONK_MASTER_GAIN } from "../../config/audio.js";
import {
  BEND_COLLIDER_ROTATION_DEGREES,
  BEND_SENSITIVITY,
  BEND_SMOOTHING,
  INTERACTION_TARGET_NAMES,
  MORPH_TARGET_NAMES,
  SQUEEZE_SENSITIVITY,
} from "../../config/honk.js";
import { LOOPER_SQUEEZE_GATE_OPEN_THRESHOLD } from "../../config/looper.js";
import { HONK_INTERACTION_PROFILE } from "../../instruments/honk/HonkInteractionProfile.js";
import { releaseControllerHonkVoice } from "./ControllerHonkRelease.js";
import {
  REFERENCE_FRAME_MS,
  captureCanonicalHonkPerformance,
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
  
        const interaction = controllerState?.activeTriggerInteraction;
        if (
          interaction?.type === "holdSqueeze" &&
          interaction.instrumentState?.kind === "honk" &&
          interaction.instrumentState.root?.visible
        ) {
          activeHoldInteractions.push({ interaction, controller });
        }
        const looperInteractionActive =
          interaction?.type === "looperWire" ||
          interaction?.type === "looperControlDrag" ||
          interaction?.type === "metronomeWire";
        const triggerBlockedByLooper =
          controllerState?.trigger && this.isLooperColliderTarget(this.getCurrentHit(controller)?.object);
        if (controllerState?.trigger && (looperInteractionActive || triggerBlockedByLooper)) {
          this.releaseRaySqueeze(controllerState);
        }
        if (
          controllerState?.trigger &&
          interaction?.type !== "verticalDragMorph" &&
          !looperInteractionActive &&
          !triggerBlockedByLooper
        ) {
          const raySqueezeInteraction = this.getRaySqueezeInteraction(controller, controllerState);
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
          chainState.startAudioVoice(voiceId);
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
          synthState.updateAudioVoice(voiceId, {
            squeeze: synthState.hornSqueezeValue,
            bend: synthState.bendValue,
            earLeft: synthState.getEarAmount("left"),
            earRight: synthState.getEarAmount("right"),
            nose: synthState.getMorphValue(MORPH_TARGET_NAMES.nose),
            vowel: synthState.currentVowelLetter,
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
  
        const resolved = state.getResolvedPerformanceState?.();
        const targetSqueeze = resolved?.squeeze ?? (state.hornHolders.size > 0 ? 1 : 0);
        const targetBend = resolved?.bend ?? 0;
        const deltaMs = Number.isFinite(state.lastHonkPerformanceUpdateMs)
          ? Math.max(now - state.lastHonkPerformanceUpdateMs, 0)
          : REFERENCE_FRAME_MS;
        state.lastHonkPerformanceUpdateMs = now;
        const hasAutomation = state.hasAutomation?.() ?? state.performance?.hasAutomation?.() ?? false;

        state.hornSqueezeValue = resolvePresentationValue(
          state.hornSqueezeValue,
          targetSqueeze,
          SQUEEZE_SENSITIVITY,
          deltaMs,
          hasAutomation,
        );
        state.targetBendValue = targetBend;
        state.bendValue = resolvePresentationValue(
          state.bendValue,
          state.targetBendValue,
          BEND_SMOOTHING,
          deltaMs,
          hasAutomation,
        );
        if (resolved) {
          state.applyMorphPerformanceState({
            ...resolved,
            squeeze: state.hornSqueezeValue,
            bend: state.bendValue,
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
    updateLooperActionVoice(voiceId, honkState, snapshot, volume) {
      if (honkState?.kind !== "honk" || !honkState.root?.visible) {
        this.releaseHonkVoice(voiceId);
        return;
      }
  
      honkState.updateAudioVoice(voiceId, {
        squeeze: THREE.MathUtils.clamp(snapshot.squeeze || 0, 0, 1),
        bend: honkState.bendValue,
        earLeft: honkState.getEarAmount("left"),
        earRight: honkState.getEarAmount("right"),
        nose: honkState.getMorphValue(MORPH_TARGET_NAMES.nose),
        vowel: honkState.currentVowelLetter,
      }, { gain: HONK_MASTER_GAIN * volume });
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
    getRaySqueezeInteraction(controller, controllerState) {
      const gripInstrumentState =
        controllerState.gripHeld &&
          controllerState.gripInstrumentState?.kind === "honk" &&
          controllerState.gripInstrumentState.root?.visible
          ? controllerState.gripInstrumentState
          : null;
  
      if (gripInstrumentState) {
        if (controllerState.raySqueezeInstrumentState !== gripInstrumentState) {
          this.resetRaySqueezeReference(controller, controllerState);
        }
        controllerState.raySqueezeInstrumentState = gripInstrumentState;
        this.activeInstrumentState = gripInstrumentState;
      }
  
      const lockedInstrumentState = this.getLockedInstrumentStateFromRay(controller);
      if (!gripInstrumentState && lockedInstrumentState?.kind === "honk" && lockedInstrumentState.root?.visible) {
        if (controllerState.raySqueezeInstrumentState !== lockedInstrumentState) {
          this.resetRaySqueezeReference(controller, controllerState);
        }
        controllerState.raySqueezeInstrumentState = lockedInstrumentState;
        this.activeInstrumentState = lockedInstrumentState;
      }
  
      const hit = this.getCurrentHit(controller);
      const targetName = hit?.object?.name;
      const config = HONK_INTERACTION_PROFILE[targetName];
      const hitInstrumentState = this.instrumentRegistry.getFromObject3D(hit?.object);
      if (
        !gripInstrumentState &&
        !lockedInstrumentState &&
        config?.type === "holdSqueeze" &&
        hitInstrumentState?.kind === "honk" &&
        hitInstrumentState.root?.visible
      ) {
        if (controllerState.raySqueezeInstrumentState !== hitInstrumentState) {
          this.resetRaySqueezeReference(controller, controllerState);
        }
        controllerState.raySqueezeInstrumentState = hitInstrumentState;
        this.activeInstrumentState = hitInstrumentState;
      }
  
      const instrumentState = controllerState.raySqueezeInstrumentState;
      if (instrumentState?.kind !== "honk" || !instrumentState.root?.visible) {
        return null;
      }
  
      return {
        type: "holdSqueeze",
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
