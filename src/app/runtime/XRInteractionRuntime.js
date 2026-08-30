import * as THREE from "three";
import { DEBUG_SHOW_COLLIDERS, DEBUG_SHOW_RAYS } from "../../config/debug.js";
import {
  EAR_DRAG_SENSITIVITY,
  INTERACTION_TARGET_NAMES,
  MORPH_TARGET_NAMES,
  NOSE_DRAG_SENSITIVITY,
} from "../../config/honk.js";
import { HONK_INTERACTION_PROFILE } from "../../instruments/honk/HonkInteractionProfile.js";
import {
  HIT_MARKER_OPACITY,
  RAY_COLOR_DEFAULT,
  RAY_COLOR_HOVER,
  getInteractionTargetColor,
} from "../../ui/interactionTargetPresentation.js";
import { ControllerMode } from "../../xr/XRInteractionCoordinator.js";
import { releaseControllerHonkVoice } from "./ControllerHonkRelease.js";
const tempScale = new THREE.Vector3();
const tempMetronomeRayOrigin = new THREE.Vector3();
const tempMetronomeRayDirection = new THREE.Vector3();
const tempMetronomeRayQuaternion = new THREE.Quaternion();


export const XRInteractionRuntimeMethods = {
    handleContextSecondaryIntent(controller) {
      if (this.pendingSpawnPlacement) {
        return;
      }
  
      const instrumentState = this.getPointedInstrumentState(controller);
      if (!this.isLockableInstrumentState(instrumentState)) {
        return;
      }
  
      if (instrumentState.kind === "honk") {
        if (this.honkLockService.getGroupForMember(instrumentState.id)) {
          this.unlockHonkFormation(instrumentState);
        } else {
          this.lockConnectedChordStates(instrumentState);
        }
      } else if (instrumentState.kind === "looper" || instrumentState.kind === "metronome") {
        instrumentState.locked = !instrumentState.locked;
        this.updateLockVisual(instrumentState);
      }
    },
    isLockableInstrumentState(instrumentState) {
      return Boolean(
        instrumentState?.root?.visible &&
        !instrumentState.pendingPlacement &&
        (instrumentState.kind === "honk" || instrumentState.kind === "looper" || instrumentState.kind === "metronome"),
      );
    },
    handleTriggerBeginIntent(controller) {
      if (this.pendingSpawnPlacement) {
        this.placePendingSpawnPlacement(controller);
        return;
      }
  
      if (this.isControllerStickActive(controller)) {
        return;
      }
  
      this.audioSystem.ensureAudio();
      const controllerState = this.controllerStates.get(controller);
      this.initializeRaySqueeze(controller);
      const hit = this.getCurrentHit(controller);
  
      if (hit?.object?.userData.isCloseButton) {
        this.closeInstructionPanel();
        return;
      }

      const metronomeState = this.instrumentRegistry.getFromObject3D(hit?.object);
      const metronomePortId = hit?.object?.userData.metronomePortId;
      if (metronomeState?.kind === "metronome" && metronomePortId) {
        controllerState.activeTriggerInteraction = this.startMetronomeWireInteraction(
          controller,
          metronomeState,
          metronomePortId,
        );
        this.activeInstrumentState = metronomeState;
        return;
      }
      const metronomeButtonAction = hit?.object?.userData.metronomeButtonAction;
      if (metronomeState?.kind === "metronome" && metronomeButtonAction) {
        const now = performance.now();
        metronomeState.pressButton(metronomeButtonAction, now);
        if (metronomeButtonAction === "pause") {
          this.updateClockedLooperTransports(now);
          this.updateMetronomeConnections(now);
        }
        controllerState.activeTriggerInteraction = null;
        this.activeInstrumentState = metronomeState;
        return;
      }
  
      const lockedInstrumentState = this.getLockedInstrumentStateFromRay(controller);
      if (lockedInstrumentState?.kind === "looper") {
        this.toggleLockedLooperPlayback(lockedInstrumentState);
        controllerState.activeTriggerInteraction = null;
        this.activeInstrumentState = lockedInstrumentState;
        return;
      }
      if (lockedInstrumentState?.kind === "metronome") {
        controllerState.activeTriggerInteraction = null;
        this.activeInstrumentState = lockedInstrumentState;
        return;
      }
  
      if (this.handleLooperTriggerPress(controller, hit)) {
        return;
      }

      if (metronomeState?.kind === "metronome" && !metronomeState.locked) {
        this.activeInstrumentState = metronomeState;
        const control = hit.object.userData.metronomeControl;
        if (control) {
          const ray = this.getMetronomeControllerRay(controller);
          const drag = metronomeState.handleRig?.beginDrag(control, ray.origin, ray.direction);
          if (!drag) return;
          controllerState.activeTriggerInteraction = {
            type: "metronomeControlDrag", instrumentState: metronomeState, drag,
          };
          return;
        }
        controllerState.activeTriggerInteraction = null;
        return;
      }
  
      if (lockedInstrumentState?.kind === "honk") {
        controllerState.activeTriggerInteraction = null;
        controllerState.raySqueezeInstrumentState = lockedInstrumentState;
        this.activeInstrumentState = lockedInstrumentState;
        return;
      }
  
      const targetName = hit?.object?.name;
      const config = HONK_INTERACTION_PROFILE[targetName];
      if (!config) {
        return;
      }
  
      const instrumentState = this.instrumentRegistry.getFromObject3D(hit.object);
      if (!instrumentState) {
        return;
      }
      this.activeInstrumentState = instrumentState;
  
      if (config.type === "clickCycleVowel") {
        this.cycleVowel(instrumentState);
        controllerState.activeTriggerInteraction = null;
        return;
      }
  
      if (config.type === "holdSqueeze") {
        controllerState.activeTriggerInteraction = null;
        return;
      }
  
      if (config.type === "verticalDragMorph") {
        controllerState.activeTriggerInteraction = {
          type: "verticalDragMorph",
          targetName,
          instrumentState,
          morph: config.morph,
          dragType: config.dragType,
          side: config.side,
          sphere: hit.object.userData.isProceduralMorphTarget ? hit.object : null,
          dragStartY: controller.position.y,
          dragStartMorphValue: this.getInteractionValue(config, instrumentState),
          dragStartSphereY: hit.object.userData.isProceduralMorphTarget ? hit.object.position.y : null,
        };
      }
    },
    handleTriggerEndIntent(controller) {
      if (this.pendingSpawnPlacement) {
        return;
      }
  
      const controllerState = this.controllerStates.get(controller);
      if (controllerState?.suppressTriggerUntilRelease) {
        controllerState.suppressTriggerUntilRelease = false;
        controllerState.activeTriggerInteraction = null;
        this.releaseRaySqueeze(controllerState);
        return;
      }
  
      const interaction = controllerState?.activeTriggerInteraction;
  
      if (interaction?.type === "looperWire") {
        this.finishLooperWireInteraction(controller, interaction);
        controllerState.activeTriggerInteraction = null;
        return;
      }

      if (interaction?.type === "metronomeWire") {
        this.finishMetronomeWireInteraction(controller, interaction);
        controllerState.activeTriggerInteraction = null;
        return;
      }
  
      if (interaction?.type === "looperControlDrag") {
        controllerState.activeTriggerInteraction = null;
        return;
      }
  
      this.releaseRaySqueeze(controllerState);
      if (interaction?.type === "holdSqueeze") {
        for (const activeVoiceId of interaction.activeVoiceIds || []) {
          releaseControllerHonkVoice(this, activeVoiceId);
        }
        interaction.instrumentState?.activeBends?.delete(interaction.voiceId);
      }
      controllerState.activeTriggerInteraction = null;
    },
    initializeRaySqueeze(controller) {
      const controllerState = this.controllerStates.get(controller);
      if (!controllerState) {
        return;
      }
  
      controllerState.raySqueezeVoiceId = this.getControllerVoiceId(controller);
      this.resetRaySqueezeReference(controller, controllerState);
    },
    resetRaySqueezeReference(controller, controllerState) {
      controller.updateMatrixWorld(true);
      controller.getWorldQuaternion(controllerState.raySqueezeStartQuaternion);
      controllerState.raySqueezeStartInverseQuaternion.copy(controllerState.raySqueezeStartQuaternion).invert();
    },
    releaseRaySqueeze(controllerState) {
      if (!controllerState) {
        return;
      }
  
      for (const activeVoiceId of controllerState.raySqueezeActiveVoiceIds || []) {
        releaseControllerHonkVoice(this, activeVoiceId);
      }
      controllerState.raySqueezeActiveVoiceIds.clear();
      controllerState.raySqueezeInstrumentState = null;
    },
    updateTriggerInteraction() {
      for (const controller of this.controllers) {
        const controllerState = this.controllerStates.get(controller);
        const interaction = controllerState?.activeTriggerInteraction;
        if (!interaction) {
          continue;
        }
  
        if (interaction.type === "looperWire") {
          this.updateActiveLooperWire(controller, interaction);
          continue;
        }

        if (interaction.type === "metronomeWire") {
          this.updateActiveMetronomeWire(controller, interaction);
          continue;
        }
  
        if (interaction.type === "looperControlDrag") {
          this.updateLooperControlDrag(controller, interaction);
          continue;
        }

        if (interaction.type === "metronomeControlDrag") {
          const ray = this.getMetronomeControllerRay(controller);
          const result = interaction.instrumentState.handleRig?.updateDrag(
            interaction.drag,
            ray.origin,
            ray.direction,
          );
          if (result?.parameter === "bpm") {
            interaction.instrumentState.setBpm(result.value);
            this.updateMetronomeLabel(interaction.instrumentState);
          } else if (result?.parameter === "volume") {
            interaction.instrumentState.setVolume(result.value);
          }
          continue;
        }
  
        if (interaction.type !== "verticalDragMorph") {
          continue;
        }
  
        const deltaY = controller.position.y - interaction.dragStartY;
  
        if (interaction.sphere) {
          const sphere = interaction.sphere;
          const localDeltaY = deltaY / this.getInstrumentWorldScaleY(interaction.instrumentState);
          const nextY = THREE.MathUtils.clamp(
            interaction.dragStartSphereY + localDeltaY,
            sphere.userData.minY,
            sphere.userData.maxY,
          );
          const nextValue = THREE.MathUtils.mapLinear(
            nextY,
            sphere.userData.minY,
            sphere.userData.maxY,
            interaction.dragType === "ear" ? -1 : sphere.userData.invertVerticalMorph ? 1 : 0,
            interaction.dragType === "ear" ? 1 : sphere.userData.invertVerticalMorph ? 0 : 1,
          );
  
          sphere.position.y = nextY;
          this.applyInteractionValue(interaction, nextValue);
          continue;
        }
  
        const sensitivity = interaction.dragType === "nose" ? NOSE_DRAG_SENSITIVITY : EAR_DRAG_SENSITIVITY;
        const nextValue = interaction.dragStartMorphValue + deltaY * sensitivity;
        this.applyInteractionValue(interaction, nextValue);
      }
    },
    getMetronomeControllerRay(controller) {
      controller.updateMatrixWorld(true);
      controller.getWorldPosition(tempMetronomeRayOrigin);
      controller.getWorldQuaternion(tempMetronomeRayQuaternion);
      tempMetronomeRayDirection.set(0, 0, -1).applyQuaternion(tempMetronomeRayQuaternion).normalize();
      return {
        origin: tempMetronomeRayOrigin,
        direction: tempMetronomeRayDirection,
      };
    },
    getInteractionValue(config, instrumentState) {
      if (config.dragType === "ear") {
        return instrumentState.getEarAmount(config.side);
      }
  
      if (config.dragType === "nose") {
        return instrumentState.getMorphValue(MORPH_TARGET_NAMES.nose);
      }
  
      return this.getMorphValue(config.morph, instrumentState);
    },
    applyInteractionValue(interaction, value) {
      if (interaction.dragType === "ear") {
        interaction.instrumentState.scalePresetNote = null;
        interaction.instrumentState.setEar(interaction.side, value);
        this.updateNoteLabel(interaction.instrumentState);
        return;
      }
  
      if (interaction.dragType === "nose") {
        interaction.instrumentState.setNose(value);
        return;
      }
  
      this.setMorph(interaction.morph, value, interaction.instrumentState);
    },
    getInstrumentWorldScaleY(state) {
      if (!state?.root) {
        return 1;
      }
  
      state.root.getWorldScale(tempScale);
      return Math.max(Math.abs(tempScale.y), 0.0001);
    },
    handleGripBeginIntent(controller) {
      if (this.pendingSpawnPlacement) {
        this.deletePendingSpawnPlacement();
        return;
      }
  
      const gripHit = this.getGripHit(controller);
      if (gripHit) {
        if (this.gripTransformSystem?.begin(controller, gripHit)) {
          this.interactionCoordinator.setMode(controller, ControllerMode.GRIP_TRANSFORMING);
        }
        return;
      }
  
      const rayHit = this.getCurrentHit(controller);
      const lockedInstrumentState = this.getLockedInstrumentStateFromRay(controller);
      if (!this.isStickBlockingRayHit(rayHit, lockedInstrumentState)) {
        this.activateStick(controller);
        return;
      }
    },
    handleGripEndIntent(controller) {
      this.deactivateStick(controller);
  
      if (this.pendingSpawnPlacement) {
        return;
      }

      const controllerState = this.controllerStates.get(controller);
      this.resetShakeDisconnectTracking(controllerState);
      this.gripTransformSystem?.release(controller);
      this.interactionCoordinator.setMode(controller, ControllerMode.IDLE);
    },
    handleHorizontalScaleStepIntent(controller, direction) {
      if (this.pendingSpawnPlacement) {
        this.handlePendingSpawnScaleThumbstick(controller, direction);
        return;
      }
      if (this.isControllerStickActive(controller)) {
        return;
      }
      this.gripTransformSystem?.handleScaleStep(controller, direction);
    },
    handlePreviewDistanceStepIntent(controller, direction) {
      if (this.pendingSpawnPlacement) {
        this.handlePendingSpawnDistanceThumbstick(controller, direction);
      }
    },
    updateGripTransform() {
      this.gripTransformSystem?.update();
    },
    updateRaycastHover() {
      for (const controller of this.controllers) {
        const controllerState = this.controllerStates.get(controller);
        if (controllerState?.stickActive) {
          this.clearControllerHover(controllerState);
          if (controller.userData.rayLine) {
            controller.userData.rayLine.visible = false;
          }
          continue;
        }
  
        const hit = this.getCurrentHit(controller);
        const nextTarget = hit?.object?.userData.isHitTarget ? hit.object : null;
        const lockedInstrumentState = this.getLockedInstrumentStateFromRay(controller);
        const hitInstrumentState = this.instrumentRegistry.getFromObject3D(nextTarget);
        const unlockedInteractionTarget =
          nextTarget &&
          !nextTarget.userData.isBodyGripTarget &&
          hitInstrumentState &&
          !hitInstrumentState?.locked
            ? nextTarget
            : null;
        const lockedGrabTarget =
          lockedInstrumentState?.hitTargets?.[INTERACTION_TARGET_NAMES.body] || null;
        const hapticContactTarget = lockedGrabTarget || unlockedInteractionTarget;
  
        if (hapticContactTarget && controllerState.raycastContactTarget !== hapticContactTarget) {
          this.triggerRaycastHitHaptics(controller, controllerState);
        }
        controllerState.raycastContactTarget = hapticContactTarget;
  
        if (controllerState.hoveredTarget && controllerState.hoveredTarget !== nextTarget) {
          this.setTargetHighlight(controllerState.hoveredTarget, false);
        }
        if (nextTarget && controllerState.hoveredTarget !== nextTarget) {
          this.setTargetHighlight(nextTarget, true);
        }
  
        controllerState.hoveredTarget = nextTarget;
  
        if (controller.userData.rayLine) {
          controller.userData.rayLine.visible = DEBUG_SHOW_RAYS && Boolean(this.renderer.xr.isPresenting);
          controller.userData.rayLine.material.color.setHex(
            this.isStickBlockingRayHit(hit, lockedInstrumentState)
              ? RAY_COLOR_HOVER
              : RAY_COLOR_DEFAULT,
          );
        }
      }
    },
    setTargetHighlight(target, highlighted) {
      if (!target?.material || target.userData?.usesVisibleMeshForGrip) {
        return;
      }
  
      const baseOpacity =
        typeof target.userData.baseHitOpacity === "number" ? target.userData.baseHitOpacity : HIT_MARKER_OPACITY;
      const showColliderHighlight = target.userData.isMetronomeTarget
        ? this.debugMode
        : DEBUG_SHOW_COLLIDERS;
      target.material.opacity =
        showColliderHighlight && highlighted ? Math.max(baseOpacity, 0.52) : baseOpacity;
      target.material.transparent = true;
      target.material.depthWrite = false;
      target.material.color.setHex(highlighted ? 0xffffff : getInteractionTargetColor(target));
    },
    isLooperColliderTarget(target) {
      return Boolean(target?.userData.isLooperCollider);
    },
    getPointedInstrumentState(controller) {
      const hit = this.getGripHit(controller) || this.getCurrentHit(controller);
      const instrumentState = this.instrumentRegistry.getFromObject3D(hit?.object);
      if (instrumentState?.root?.visible && !instrumentState.pendingPlacement) {
        return instrumentState;
      }
  
      return this.getLockedInstrumentStateFromRay(controller);
    },
    getLockedInstrumentStateFromRay(controller) {
      if (this.isControllerStickActive(controller)) {
        return null;
      }
  
      return this.raycastSystem.getLockedInstrumentFromRay(controller);
    },
    getGripHit(controller) {
      if (this.isControllerStickActive(controller)) {
        return null;
      }
  
      return this.raycastSystem.getGripHit(controller);
    },
    getCurrentHit(controller) {
      if (this.isControllerStickActive(controller)) {
        return null;
      }
  
      return this.raycastSystem.getCurrentHit(controller);
    },
    setRaycasterFromController(controller) {
      this.raycastSystem.setFromController(controller);
    },
};
