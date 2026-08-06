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
import { HONK_INTERACTION_PROFILE } from "../../instruments/honk/HonkInteractionProfile.js";

const tempBendQuaternion = new THREE.Quaternion();
const tempBendEuler = new THREE.Euler();

export const HonkPerformanceRuntimeMethods = {
    updateHorn(now = performance.now()) {
      for (const state of this.honkRuntimeStates || this.instrumentStates) {
        if (state.kind !== "honk") continue;
        state.hornHolders.clear();
        state.activeBends.clear();
      }
  
      const activeHoldInteractions = this.activeHonkHoldInteractions ||
        (this.activeHonkHoldInteractions = []);
      activeHoldInteractions.length = 0;
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
          const entry = controllerState.runtimeDirectHonkHoldEntry ||
            (controllerState.runtimeDirectHonkHoldEntry = {});
          entry.interaction = interaction;
          entry.controller = controller;
          activeHoldInteractions.push(entry);
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
            const entry = controllerState.runtimeRayHonkHoldEntry ||
              (controllerState.runtimeRayHonkHoldEntry = {});
            entry.interaction = raySqueezeInteraction;
            entry.controller = controller;
            activeHoldInteractions.push(entry);
          }
        }
      }
  
      for (const entry of activeHoldInteractions) {
        const { interaction, controller } = entry;
        const playableChain = interaction.runtimePlayableChain ||
          (interaction.runtimePlayableChain = []);
        const memberIds = interaction.runtimeMemberIds ||
          (interaction.runtimeMemberIds = new Set());
        const memberQueue = interaction.runtimeMemberQueue ||
          (interaction.runtimeMemberQueue = []);
        this.getTouchingInstrumentChain(
          interaction.instrumentState,
          playableChain,
          memberIds,
          memberQueue,
        );
        const previousVoiceIds = interaction.activeVoiceIds || new Set();
        let desiredVoiceIds = interaction.runtimeNextVoiceIds;
        if (!desiredVoiceIds || desiredVoiceIds === previousVoiceIds) {
          desiredVoiceIds = new Set();
          interaction.runtimeNextVoiceIds = desiredVoiceIds;
        }
        desiredVoiceIds.clear();
        const bendAmount = this.getControllerRollBend(controller, interaction);
  
        for (const chainState of playableChain) {
          const voiceId = this.getInstrumentVoiceId(interaction.voiceId, chainState);
          desiredVoiceIds.add(voiceId);
          chainState.hornHolders.add(voiceId);
          chainState.activeBends.set(voiceId, bendAmount);
          chainState.startAudioVoice(voiceId);
        }
  
        for (const activeVoiceId of previousVoiceIds) {
          if (!desiredVoiceIds.has(activeVoiceId)) {
            this.releaseHonkVoice(activeVoiceId);
          }
        }
  
        if (interaction.isRaySqueeze) {
          interaction.activeVoiceIds.clear();
          for (const voiceId of desiredVoiceIds) {
            interaction.activeVoiceIds.add(voiceId);
          }
        } else {
          interaction.activeVoiceIds = desiredVoiceIds;
          interaction.runtimeNextVoiceIds = previousVoiceIds;
        }
        interaction.activeChain = playableChain;
      }
  
      for (const state of this.honkRuntimeStates || this.instrumentStates) {
        if (state.kind !== "honk") {
          continue;
        }
  
        let bendSum = 0;
        for (const value of state.activeBends.values()) {
          bendSum += value;
        }
        const liveSqueeze = state.hornHolders.size > 0 ? 1 : 0;
        const liveBend = liveSqueeze > 0 ? THREE.MathUtils.clamp(bendSum, -1, 1) : 0;
        if (state.setLiveGateAndBend) {
          state.setLiveGateAndBend(liveSqueeze, liveBend);
        } else {
          const liveState = state.runtimeLiveGateState ||
            (state.runtimeLiveGateState = { squeeze: 0, bend: 0 });
          liveState.squeeze = liveSqueeze;
          liveState.bend = liveBend;
          state.setLivePerformance?.(liveState);
        }
      }
  
      this.updateLooperPlayback(now);
      this.applyResolvedHonkPerformanceStates();
    },
    clearLiveHornInteractionState() {
      for (const state of this.honkRuntimeStates || this.instrumentStates) {
        if (state.kind !== "honk") {
          continue;
        }
  
        state.hornHolders.clear();
        state.activeBends.clear();
        if (state.setLiveGateAndBend) {
          state.setLiveGateAndBend(0, 0);
        } else {
          const liveState = state.runtimeLiveGateState ||
            (state.runtimeLiveGateState = { squeeze: 0, bend: 0 });
          liveState.squeeze = 0;
          liveState.bend = 0;
          state.setLivePerformance?.(liveState);
        }
      }
    },
    applyResolvedHonkPerformanceStates() {
      for (const state of this.honkRuntimeStates || this.instrumentStates) {
        if (state.kind !== "honk") {
          continue;
        }
  
        const resolved = state.resolvePerformanceState?.() ||
          state.getResolvedPerformanceState?.();
        const targetSqueeze = resolved?.squeeze ?? (state.hornHolders.size > 0 ? 1 : 0);
        const targetBend = resolved?.bend ?? 0;
  
        state.hornSqueezeValue = THREE.MathUtils.lerp(
          state.hornSqueezeValue,
          targetSqueeze,
          SQUEEZE_SENSITIVITY,
        );
        state.targetBendValue = targetBend;
        state.bendValue = THREE.MathUtils.lerp(state.bendValue, state.targetBendValue, BEND_SMOOTHING);
        if (resolved) {
          const visualState = state.resolvedVisualPerformanceState ||
            (state.resolvedVisualPerformanceState = {});
          visualState.squeeze = state.hornSqueezeValue;
          visualState.bend = state.bendValue;
          visualState.earLeft = resolved.earLeft;
          visualState.earRight = resolved.earRight;
          visualState.nose = resolved.nose;
          visualState.vowel = resolved.vowel;
          state.applyMorphPerformanceState(visualState);
          this.applyResolvedHonkMorphState(state, resolved);
        }
        this.updateBendAlignedColliders(state);
  
        const pulse = 1 + state.hornSqueezeValue * 0.035;
        this.applyInstrumentVisualScale(state, pulse);
        state.updateResolvedAudioRenderer?.(resolved, HONK_MASTER_GAIN);
      }
    },
    releaseHonkVoice(voiceId, options = {}) {
      for (const honk of this.honkRuntimeStates || this.instrumentRegistry.getByKind("honk")) {
        if (!honk.activeVoiceIds?.has(voiceId)) continue;
        honk.releaseAudioVoice(voiceId, options);
        return true;
      }
      return false;
    },
    captureLooperActionFromHonk(honkState) {
      if (honkState?.kind !== "honk" || !honkState.root?.visible) {
        return null;
      }
  
      const live = honkState.readLivePerformanceState?.() ||
        honkState.getLivePerformanceState?.();
      const capture = honkState.looperCaptureState ||
        (honkState.looperCaptureState = {});
      capture.musicalOnset = Boolean(
        (live?.squeeze || 0) > 0 || honkState.hornHolders?.size > 0,
      );
      capture.squeeze = honkState.hornSqueezeValue || 0;
      capture.bend = honkState.bendValue || 0;
      capture.earLeft = live?.earLeft ?? honkState.getEarAmount("left");
      capture.earRight = live?.earRight ?? honkState.getEarAmount("right");
      capture.nose = live?.nose ?? honkState.getMorphValue(MORPH_TARGET_NAMES.nose);
      capture.vowel = live?.vowel ?? honkState.currentVowelLetter ?? "neutral";
      return capture;
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
  
      const interaction = controllerState.raySqueezeInteraction ||
        (controllerState.raySqueezeInteraction = {});
      interaction.type = "holdSqueeze";
      interaction.targetName = INTERACTION_TARGET_NAMES.horn;
      interaction.instrumentState = instrumentState;
      interaction.voiceId = controllerState.raySqueezeVoiceId || this.getControllerVoiceId(controller);
      interaction.activeVoiceIds = controllerState.raySqueezeActiveVoiceIds;
      interaction.bendStartInverseQuaternion = controllerState.raySqueezeStartInverseQuaternion;
      interaction.isRaySqueeze = true;
      return interaction;
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
    getTouchingInstrumentChain(startState, output = [], memberIds = new Set(), queue = []) {
      output.length = 0;
      if (startState?.kind !== "honk") return output;
      if (this.honkContactGraph.fillConnectedComponent) {
        this.honkContactGraph.fillConnectedComponent(startState.id, memberIds, queue);
      } else {
        memberIds.clear();
        for (const id of this.honkContactGraph.getConnectedComponent(startState.id)) {
          memberIds.add(id);
        }
      }
      if (memberIds.size === 0 && startState.root?.visible) memberIds.add(startState.id);
      for (const id of memberIds) {
        const honk = this.instrumentRegistry.get(id);
        if (honk?.kind === "honk" && honk.root?.visible && honk.isPlayable()) output.push(honk);
      }
      return output;
    },
};
