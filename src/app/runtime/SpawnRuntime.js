import * as THREE from "three";
import { DEBUG_SHOW_RAYS } from "../../config/debug.js";
import { FORMATION_SPAWN_SETTINGS } from "../../config/formations.js";
import {
  INSTRUMENT_BASE_SCALE,
  INSTRUMENT_SCALE_STEP,
  INTERACTION_TARGET_NAMES,
  MORPH_TARGET_NAMES,
} from "../../config/honk.js";
import { LOOPER_COMPONENT_ID } from "../../config/looper.js";
import {
  DEFAULT_INSTRUMENT_DISTANCE,
  SPAWN_DISTANCE,
  SPAWN_Y_OFFSET,
} from "../../config/spawning.js";
import {
  PENDING_SPAWN_RENDER_ORDER,
  createPendingSpawnGlassMaterial,
  disposePendingSpawnMaterials,
} from "../../spawning/pendingSpawnMaterials.js";
import {
  applyPendingSpawnVisualsToState,
  restorePendingSpawnVisualsToState,
} from "../../spawning/pendingSpawnVisuals.js";
import {
  SpawnMenuPrimaryAction,
  resolveSpawnMenuPrimaryAction,
} from "../../spawning/spawnMenuPrimaryAction.js";
import { resolveCatalogInstrumentSpawn } from "../../spawning/SpawnCatalog.js";
import { applyMetronomeSpawnOrientation } from "../../instruments/metronome/metronomeSpawnOrientation.js";
import { RAY_COLOR_HOVER } from "../../ui/interactionTargetPresentation.js";
import { ControllerMode } from "../../xr/XRInteractionCoordinator.js";
import { setControllerGripTarget } from "../../xr/controllerGripState.js";

const tempQuaternion = new THREE.Quaternion();
const tempSpawnForward = new THREE.Vector3();
const tempSpawnRight = new THREE.Vector3();
const tempSpawnTarget = new THREE.Vector3();
const tempVector = new THREE.Vector3();

export class SpawnRuntime {
  constructor(host) {
    this.host = host;
    this.spawnCatalog = null;
    this.radialSpawnMenu = null;
    this.spawnMenuController = null;
    this.formationSpawner = null;
    this.spawnPlacementController = null;
    this.pendingSpawnPlacement = null;
  }
  pulseRadialMenuStateChange(controller, change, profiles) {
    const profile = profiles?.[change?.type];
    if (!profile) return;
    const pulse = this.host.hapticsService?.pulse(
      this.host.getControllerGamepad(controller),
      profile,
    );
    pulse?.catch?.((error) => console.warn("Could not pulse radial-menu haptics:", error));
  }
  handleSpawnMenuOpenIntent(controller, gripPressed = false) {
    if (this.pendingSpawnPlacement) {
      return;
    }

    if (!this.host.instructionPanelClosed) {
      return;
    }

    const controllerState = this.host.controllerStates.get(controller);
    const primaryAction = resolveSpawnMenuPrimaryAction({ controllerState, gripPressed });
    if (primaryAction.type === SpawnMenuPrimaryAction.duplicate) {
      this.duplicateInstrumentForGrip(controller, primaryAction.source);
      return;
    }

    if (primaryAction.type === SpawnMenuPrimaryAction.suppress) {
      return;
    }

    this.host.audioSystem.ensureAudio();
    this.openRadialMenu(controller);
  }
  handleSpawnMenuConfirmIntent(controller) {
    if (this.pendingSpawnPlacement) {
      return;
    }

    const state = this.host.controllerStates.get(controller);
    if (!state?.radialMenuOpen) {
      return;
    }

    const selectedOption = this.spawnMenuController.confirm(controller, state);
    this.host.interactionCoordinator.setMode(controller, ControllerMode.IDLE);
    if (selectedOption?.action === "capture") {
      this.host.capture?.command(selectedOption.id);
      return;
    }
    if (selectedOption) {
      this.beginPendingSpawnPlacement(controller, selectedOption.id);
    }
  }
  openRadialMenu(controller) {
    const state = this.host.controllerStates.get(controller);
    this.spawnMenuController.open(controller, state);
    this.host.interactionCoordinator.setMode(controller, ControllerMode.MENU_OPEN);
  }
  closeRadialMenu(controller) {
    const state = this.host.controllerStates.get(controller);
    this.spawnMenuController.close(controller, state);
    if (state?.mode === ControllerMode.MENU_OPEN) {
      this.host.interactionCoordinator.setMode(controller, ControllerMode.IDLE);
    }
  }
  cancelRadialMenu(controller) {
    const state = this.host.controllerStates.get(controller);
    this.spawnMenuController.cancel(controller, state);
    this.host.interactionCoordinator.setMode(controller, ControllerMode.IDLE);
  }
  beginPendingSpawnPlacement(controller, componentId) {
    if (!controller) {
      return;
    }

    const requested = this.spawnCatalog.get(componentId);
    if (requested?.action === "capture") {
      this.host.capture?.command(requested.id);
      return;
    }
    const kind = resolveCatalogInstrumentSpawn(requested, componentId).componentId;
    if (kind === "metronome" && this.host.instrumentRegistry.admission) {
      const token = this.host.instrumentRegistry.admission.reserve(kind);
      if (!token) return;
      this.host.instrumentRegistry.admission.release(token);
    }
    this.deletePendingSpawnPlacement();
    const entry = this.spawnCatalog.get(componentId);
    if (!entry) {
      return;
    }
    this.disableInteractionsForPendingSpawn();
    const preview = this.spawnPlacementController.begin(controller, entry);
    if (!preview?.instruments?.length) {
      return;
    }

    for (const state of preview.instruments) {
      state.locked = false;
      this.applyPendingSpawnVisuals(state);
    }

    this.pendingSpawnPlacement = preview;
    preview.waitForTriggerRelease = Boolean(this.host.controllerStates.get(controller)?.trigger);
    this.host.tutorial?.onPreview(preview, entry, controller);
    this.host.interactionCoordinator.setMode(controller, ControllerMode.SPAWN_PREVIEW);
  }
  createPendingSpawnComponents(componentId) {
    const entry = this.spawnCatalog.get(componentId);
    if (entry?.action === "formation") {
      const instruments = this.formationSpawner.spawn(entry.recipeId);
      for (const instrument of instruments)
        this.host.setInstrumentBaseScale(instrument, INSTRUMENT_BASE_SCALE);
      return { instruments };
    }

    if (entry?.action === "equip" || entry?.action === "capture") return null;
    const spawnRequest = resolveCatalogInstrumentSpawn(entry, componentId);
    const root = this.host.createSpawnedComponent(spawnRequest.componentId, spawnRequest.options);
    const state = this.host.activeInstrumentState;
    if (!root || !state) {
      return null;
    }

    this.host.setInstrumentBaseScale(state, INSTRUMENT_BASE_SCALE);
    return { instruments: [state] };
  }
  disableInteractionsForPendingSpawn() {
    for (const controller of this.host.controllers) {
      const controllerState = this.host.controllerStates.get(controller);
      if (!controllerState) {
        continue;
      }

      if (controllerState.hoveredTarget) {
        this.host.setTargetHighlight(controllerState.hoveredTarget, false);
        controllerState.hoveredTarget = null;
      }
      controllerState.raycastContactTarget = null;

      const interaction = controllerState.activeTriggerInteraction;
      if (interaction?.type === "looperWire" || interaction?.type === "metronomeWire") {
        if (interaction.type === "metronomeWire")
          this.host.metronomeConnections.cancelMetronomeWireInteraction(interaction);
        else {
          this.host.looperConnections.disposeWireMesh(interaction.wireMesh);
          interaction.wireMesh = null;
        }
      }
      controllerState.activeTriggerInteraction = null;

      this.host.releaseRaySqueeze(controllerState);
      this.host.gripTransformSystem?.release(controller);
      this.host.deactivateStick(controller);
      this.closeRadialMenu(controller);
    }
  }
  updatePendingSpawnPreview() {
    const pending = this.pendingSpawnPlacement;
    if (!pending?.controller || !pending.group) {
      this.deletePendingSpawnPlacement();
      return;
    }

    pending.group.visible = true;
    if (pending.controller.userData.rayLine) {
      pending.controller.userData.rayLine.visible =
        DEBUG_SHOW_RAYS && Boolean(this.host.renderer.xr.isPresenting);
      pending.controller.userData.rayLine.material.color.setHex(RAY_COLOR_HOVER);
    }
  }
  handlePendingSpawnScaleThumbstick(controller, direction) {
    const pending = this.pendingSpawnPlacement;
    if (!pending || controller !== pending.controller) {
      return;
    }

    this.spawnPlacementController.scale(controller, direction, (state, stepDirection) => {
      this.host.setInstrumentBaseScale(
        state,
        state.baseScale + stepDirection * INSTRUMENT_SCALE_STEP,
      );
    });
  }
  handlePendingSpawnDistanceThumbstick(controller, direction) {
    const pending = this.pendingSpawnPlacement;
    if (!pending || controller !== pending.controller) {
      return;
    }
    this.spawnPlacementController.distance(controller, direction);
  }
  placePendingSpawnPlacement(controller) {
    const pending = this.pendingSpawnPlacement;
    if (!pending || controller !== pending.controller || pending.waitForTriggerRelease) {
      return;
    }

    const controllerState = this.host.controllerStates.get(controller);
    if (controllerState) {
      controllerState.suppressTriggerUntilRelease = true;
      controllerState.activeTriggerInteraction = null;
      this.host.releaseRaySqueeze(controllerState);
    }

    for (const state of pending.instruments) {
      this.restorePendingSpawnVisuals(state);
    }

    const placed = this.spawnPlacementController.place(controller);
    this.pendingSpawnPlacement = null;
    this.host.interactionCoordinator.setMode(controller, ControllerMode.IDLE);
    for (const state of placed) {
      state.raycastTargetsDirty = true;
      this.syncLooperTransformReference(state);
    }

    this.host.tutorial?.onPlaced(placed, pending);
    this.host.activeInstrumentState = placed.at(-1) || this.host.activeInstrumentState;
  }
  deletePendingSpawnPlacement() {
    const pending = this.pendingSpawnPlacement;
    if (!pending) {
      return;
    }

    this.pendingSpawnPlacement = null;
    this.host.interactionCoordinator.setMode(pending.controller, ControllerMode.IDLE);
    for (const state of [...pending.instruments]) {
      if (!state) {
        continue;
      }
      this.restorePendingSpawnVisuals(state);
    }
    this.spawnPlacementController.cancel((instrumentId) => {
      const instrument = this.host.instrumentRegistry.get(instrumentId);
      if (instrument) this.host.deleteInstrument(instrument);
    });
    this.host.tutorial?.onSpawnCancelled(pending);
  }
  applyPendingSpawnVisuals(state) {
    applyPendingSpawnVisualsToState(state, {
      createPreviewMaterial: createPendingSpawnGlassMaterial,
      renderOrder: PENDING_SPAWN_RENDER_ORDER,
    });
  }
  restorePendingSpawnVisuals(state) {
    restorePendingSpawnVisualsToState(state, {
      disposePreviewMaterials: disposePendingSpawnMaterials,
    });
  }
  syncLooperTransformReference(state) {
    const data = state?.looperData;
    if (!data) {
      return;
    }

    state.root.updateMatrixWorld(true);
    state.root.getWorldPosition(data.lastPosition);
    state.root.getWorldQuaternion(data.lastQuaternion);
  }
  updateRadialMenus() {
    for (const controller of this.host.controllers) {
      const state = this.host.controllerStates.get(controller);
      if (!state?.radialMenuOpen) {
        continue;
      }

      this.spawnMenuController.update(controller, state);
    }
  }
  getRadialMenuSelectedIndex(controller, state) {
    return this.spawnMenuController.view.getSelectedIndex(controller, state);
  }
  updateRadialMenuVisuals(controller) {
    const state = this.host.controllerStates.get(controller);
    this.spawnMenuController.view.updateVisuals(controller, state);
  }
  duplicateInstrumentForGrip(controller, sourceState) {
    if (!sourceState?.root?.visible) {
      return;
    }

    const componentId = sourceState.componentId || "honk";
    const duplicateRoot = this.host.createSpawnedComponent(componentId, {
      tuning: sourceState.kind === "honk" ? { ...sourceState.tuning } : undefined,
      bpm: sourceState.kind === "metronome" ? sourceState.bpm : undefined,
      volume: sourceState.kind === "metronome" ? sourceState.volume : undefined,
    });
    const duplicateState = this.host.activeInstrumentState;
    if (!duplicateRoot || !duplicateState) {
      return;
    }
    if (this.host.capture?.active)
      this.host.capture.event("duplicate", {
        sourceId: sourceState.id,
        entityId: duplicateState.id,
      });

    duplicateRoot.position.copy(sourceState.root.position);
    duplicateRoot.quaternion.copy(sourceState.root.quaternion);
    this.host.setInstrumentBaseScale(duplicateState, sourceState.baseScale);
    duplicateState.pitchSnap = sourceState.pitchSnap || null;
    duplicateState.scalePresetNote = sourceState.scalePresetNote || null;

    if (duplicateState.kind === "honk") {
      this.copyInstrumentMorphState(sourceState, duplicateState);
    }
    if (sourceState.kind === "looper" && duplicateState.kind === "looper") {
      this.copyLooperState(sourceState, duplicateState);
    }
    if (sourceState.kind === "metronome" && duplicateState.kind === "metronome") {
      this.host.presentation.positionMetronomeControls(duplicateState);
      this.host.presentation.updateMetronomeLabel(duplicateState);
    }

    const controllerState = this.host.controllerStates.get(controller);
    if (!controllerState) {
      return;
    }

    const duplicateGripTarget =
      this.host.transformTargetResolver?.resolve?.(duplicateState) || duplicateState;
    setControllerGripTarget(controllerState, duplicateGripTarget, duplicateState);
    this.host.interactionCoordinator.setMode(controller, ControllerMode.GRIP_TRANSFORMING);
    controller.updateMatrixWorld(true);
    duplicateGripTarget.root.updateMatrixWorld(true);
    controllerState.gripOffsetMatrix
      .copy(controller.matrixWorld)
      .invert()
      .multiply(duplicateGripTarget.root.matrixWorld);
  }
  copyInstrumentMorphState(sourceState, targetState) {
    const vowelLetter =
      sourceState.currentVowelLetter === "neutral" ? null : sourceState.currentVowelLetter;
    targetState.applyVowelMorph(vowelLetter);
    targetState.currentVowelIndex = sourceState.currentVowelIndex;
    targetState.currentVowelLetter = sourceState.currentVowelLetter;

    const leftEar = sourceState.getEarAmount("left");
    const rightEar = sourceState.getEarAmount("right");
    const nose = sourceState.getMorphValue(MORPH_TARGET_NAMES.nose);
    targetState.setLivePerformance?.({
      squeeze: 0,
      bend: 0,
      earLeft: leftEar,
      earRight: rightEar,
      nose,
      vowel: targetState.currentVowelLetter,
    });
    targetState.applyMorphPerformanceState(targetState.getLivePerformanceState());

    const targetLeftEar = targetState.hitTargets[INTERACTION_TARGET_NAMES.leftEar];
    const targetRightEar = targetState.hitTargets[INTERACTION_TARGET_NAMES.rightEar];
    const targetNose = targetState.hitTargets[INTERACTION_TARGET_NAMES.nose];
    if (targetLeftEar?.userData.isProceduralMorphTarget) {
      this.host.presentation.setSpherePositionFromSignedValue(targetLeftEar, leftEar);
    }
    if (targetRightEar?.userData.isProceduralMorphTarget) {
      this.host.presentation.setSpherePositionFromSignedValue(targetRightEar, rightEar);
    }
    if (targetNose?.userData.isProceduralMorphTarget) {
      this.host.presentation.setSpherePositionFromMorph(targetNose, nose);
    }

    targetState.hornSqueezeValue = 0;
    targetState.bendValue = 0;
    targetState.targetBendValue = 0;
    this.host.updateBendAlignedColliders(targetState);
    this.host.presentation.updateNoteLabel(targetState);
  }
  copyLooperState(sourceState, targetState) {
    const sourceLooper = this.host.getLooperRuntimeState(sourceState);
    const targetLooper = this.host.getLooperRuntimeState(targetState);
    if (!sourceLooper?.looperData || !targetLooper?.looperData || !targetLooper.looperController) {
      return;
    }

    const sourceData = sourceLooper.looperData;
    const targetData = targetLooper.looperData;
    const targetController = targetLooper.looperController;
    this.host.clearLooperRuntimeState(targetState);
    targetData.timeline = sourceData.timeline?.clone?.() || targetController.createTimeline();
    targetData.hasRecording = targetData.timeline.hasRecording();
    targetData.durationMs = targetData.timeline.durationMs;

    for (const targetTrack of targetData.tracks) {
      targetController.disconnectTrack(targetLooper, targetTrack.index);
      targetTrack.resetRuntimeState();
      targetTrack.active = Boolean(targetData.timeline.getTrack(targetTrack.trackId)?.active);
      this.host.looperConnections.disposeWireMesh(targetTrack.wireMesh);
      targetTrack.wireMesh = null;
    }

    this.host.setLooperControlValue(targetState, "volume", sourceData.volumeControlValue);
    this.host.setLooperControlValue(targetState, "gap", sourceData.gapControlValue);
    this.host.setLooperControlValue(
      targetState,
      "recordLength",
      sourceData.recordLengthControlValue ?? 1,
    );
    this.host.looperConnections.updateLooperVisuals(targetState);
  }
  spawnInstrumentInFrontOfCamera() {
    this.spawnComponentInFrontOfCamera("honk");
  }
  spawnComponentInFrontOfCamera(componentId) {
    const entry = this.spawnCatalog.get(componentId) || this.spawnCatalog.get("honk");
    if (entry?.action === "formation") {
      const states = this.formationSpawner.spawn(entry.recipeId);
      this.positionSpawnedFormationInFrontOfCamera(states);
      return;
    }

    if (entry?.action === "equip") return;
    const spawnRequest = resolveCatalogInstrumentSpawn(entry, componentId);
    const component = this.host.createSpawnedComponent(
      spawnRequest.componentId,
      spawnRequest.options,
    );
    if (!component) {
      return;
    }

    this.positionObjectInFrontOfCamera(component, SPAWN_DISTANCE);
    this.host.setInstrumentBaseScale(this.host.activeInstrumentState, INSTRUMENT_BASE_SCALE);
  }
  spawnScalePreset(scalePreset, namePrefix = "Honk") {
    const states = [];
    for (const [index, tuning] of scalePreset.entries()) {
      const root = this.host.createSpawnedComponent("honk", {
        name: `${namePrefix}_${tuning.label}_${index + 1}`,
        tuning,
      });
      if (!root || !this.host.activeInstrumentState) continue;
      this.host.setInstrumentBaseScale(this.host.activeInstrumentState, INSTRUMENT_BASE_SCALE);
      states.push(this.host.activeInstrumentState);
    }
    this.positionSpawnedFormationInFrontOfCamera(states);
  }
  positionSpawnedFormationInFrontOfCamera(states) {
    if (!states?.length) return;
    const userCamera = this.host.getUserCamera();
    userCamera.updateMatrixWorld(true);
    userCamera.getWorldPosition(tempVector);
    userCamera.getWorldDirection(tempSpawnForward);
    userCamera.getWorldQuaternion(tempQuaternion);

    tempSpawnForward.y = 0;
    if (tempSpawnForward.lengthSq() < 0.0001) {
      tempSpawnForward.set(0, 0, -1);
    } else {
      tempSpawnForward.normalize();
    }

    tempSpawnRight.set(1, 0, 0).applyQuaternion(tempQuaternion);
    tempSpawnRight.y = 0;
    if (tempSpawnRight.lengthSq() < 0.0001) {
      tempSpawnRight.crossVectors(tempSpawnForward, new THREE.Vector3(0, 1, 0)).normalize();
    } else {
      tempSpawnRight.normalize();
    }

    const rowCenter = tempVector.clone().addScaledVector(tempSpawnForward, SPAWN_DISTANCE);
    rowCenter.y = tempVector.y + SPAWN_Y_OFFSET;
    const spacing = FORMATION_SPAWN_SETTINGS.memberSpacing;
    const firstOffset = -((states.length - 1) * spacing) * 0.5;

    for (const [index, state] of states.entries()) {
      const instrument = state?.root;
      if (!instrument) continue;
      instrument.position
        .copy(rowCenter)
        .addScaledVector(tempSpawnRight, firstOffset + index * spacing);
      this.host.setInstrumentBaseScale(state, INSTRUMENT_BASE_SCALE);

      tempSpawnTarget.copy(tempVector);
      tempSpawnTarget.y = instrument.position.y;
      instrument.lookAt(tempSpawnTarget);
    }
  }
  applyScalePresetNote(state, note) {
    if (state?.kind !== "honk") {
      return;
    }

    const tuning = state.applyTuning?.(note) || state.tuning;
    const pitchAmount = tuning?.pitchControl ?? 0;
    const octaveAmount = tuning?.octaveControl ?? 0;
    state.scalePresetNote = note.label;
    state.scalePresetNoteConfig = {
      label: note.label,
      semitonesFromF: note.semitonesFromF,
      octaveOffset: note.octaveOffset || 0,
    };
    const leftEar = state.hitTargets[INTERACTION_TARGET_NAMES.leftEar];
    const rightEar = state.hitTargets[INTERACTION_TARGET_NAMES.rightEar];
    if (leftEar?.userData.isProceduralMorphTarget) {
      this.host.presentation.setSpherePositionFromSignedValue(leftEar, pitchAmount);
    }
    if (rightEar?.userData.isProceduralMorphTarget) {
      this.host.presentation.setSpherePositionFromSignedValue(rightEar, octaveAmount);
    }
    this.host.presentation.updateNoteLabel(state);
  }
  spawnDefaultInstrumentPreview() {
    if (
      !this.host.componentTemplates.get("metronome")?.template ||
      this.host.instrumentRegistry.getByKind("metronome").length > 0
    ) {
      return;
    }

    const defaultComponentId = "metronome";
    const instrument = this.host.createSpawnedComponent(defaultComponentId);
    const state = this.host.activeInstrumentState;
    if (!instrument || state?.kind !== "metronome") {
      console.warn(
        "Default metronome spawn failed: the metronome template did not create a metronome.",
      );
      return;
    }
    this.positionObjectInFrontOfCamera(instrument, DEFAULT_INSTRUMENT_DISTANCE);
    instrument.position.y -= defaultComponentId === LOOPER_COMPONENT_ID ? 0.18 : 0.38;
    this.host.setInstrumentBaseScale(state, INSTRUMENT_BASE_SCALE);
  }
  createSpawnedInstrument() {
    return this.host.createSpawnedComponent("honk");
  }
  positionObjectInFrontOfCamera(object, distance) {
    const userCamera = this.host.getUserCamera();
    userCamera.updateMatrixWorld(true);
    userCamera.getWorldPosition(tempVector);
    userCamera.getWorldDirection(tempSpawnForward);

    tempSpawnForward.y = 0;
    if (tempSpawnForward.lengthSq() < 0.0001) {
      tempSpawnForward.set(0, 0, -1);
    } else {
      tempSpawnForward.normalize();
    }

    object.position.copy(tempVector).addScaledVector(tempSpawnForward, distance);
    object.position.y = tempVector.y + SPAWN_Y_OFFSET;

    tempSpawnTarget.copy(tempVector);
    tempSpawnTarget.y = object.position.y;
    object.lookAt(tempSpawnTarget);
    if (object.userData.componentId === "metronome") {
      applyMetronomeSpawnOrientation(object, { relative: true });
    }
  }
  updateLooperPlaybackDuringPendingSpawn(now = performance.now()) {
    this.host.metronomeConnections.validateMetronomeConnections();
    this.host.clearLiveHornInteractionState();
    this.host.presentation.updateMetronomes(now);
    this.host.updateClockedLooperTransports(now);
    this.host.updateLooperRecordings(now);
    this.host.updateLooperPlayback(now);
    this.host.metronomeConnections.updateMetronomeConnections(now);
    this.host.applyResolvedHonkPerformanceStates(now);
    this.host.updateLooperPlaybackAudio();
    this.host.updateLooperMorphAnimations(now);
    this.host.looperConnections.updateLooperWires();
    this.host.metronomeConnections.updateMetronomeConnectionWires();
  }
}
