import * as THREE from "three";
import {
  LOOPER_BUTTON_MORPH_TARGETS,
  LOOPER_CONTROL_MORPH_TARGETS,
  LOOPER_MORPH_SETTINGS,
  LOOPER_MORPH_TARGET_NAMES,
  LOOPER_WIRE_COLORS,
} from "../../config/looper.js";
import { LooperControlMapping } from "../../instruments/looper/looperControlMapping.js";
import {
  getLooperButtonName,
  getLooperControlName,
} from "../../instruments/looper/looperNames.js";

const tempControlDragPosition = new THREE.Vector3();


export const LooperTransportRuntimeMethods = {
    handleLooperTriggerPress(controller, hit) {
      const target = hit?.object;
      if (!target?.userData?.isLooperCollider) {
        return false;
      }
  
      const controllerState = this.controllerStates.get(controller);
      const looperState = this.instrumentRegistry?.getFromObject3D?.(target) || null;
      if (!controllerState || !this.isLooperRuntimeState(looperState) || !looperState.root?.visible) {
        return false;
      }
  
      this.activeInstrumentState = looperState;
  
      if (target.userData.isLooperButton) {
        this.pressLooperButton(looperState, target.userData.looperButtonAction, target.userData.looperMorphName);
        controllerState.activeTriggerInteraction = null;
        return true;
      }
  
      if (target.userData.isLooperNode) {
        const track = this.getLooperTrack(looperState, target.userData.looperTrackIndex);
        if (track) {
          controllerState.activeTriggerInteraction = this.startLooperWireInteraction(controller, looperState, track);
        }
        return true;
      }
  
      if (target.userData.isLooperControl) {
        controllerState.activeTriggerInteraction = {
          type: "looperControlDrag",
          looperState,
          control: target.userData.looperControl,
          morphTargets: target.userData.looperMorphTargets || null,
          sphere: target,
          dragStartY: controller.position.y,
          dragStartLocalPosition: this.getControllerLocalPosition(controller, looperState).clone(),
          dragStartValue: this.getLooperControlValue(looperState, target.userData.looperControl),
          dragStartSphereY: target.position.y,
        };
        return true;
      }
  
      return false;
    },
    toggleLockedLooperPlayback(looperState) {
      const data = looperState?.looperData;
      if (!data) {
        return;
      }
  
      if (data.playing && !data.paused) {
        this.pressLooperButton(
          looperState,
          "pause",
          looperState.hitTargets[getLooperButtonName("pause")]?.userData.looperMorphName,
        );
        return;
      }
  
      this.pressLooperButton(
        looperState,
        "play",
        looperState.hitTargets[getLooperButtonName("play")]?.userData.looperMorphName,
      );
    },
    pressLooperButton(looperState, action, morphName = null) {
      if (!this.isLooperRuntimeState(looperState)) {
        return;
      }
  
      if (action === "record") {
        this.setLooperButtonMorph(looperState, "record", 1, morphName);
        this.setLooperButtonMorph(looperState, "play", 0);
        this.startRecording(looperState);
        this.updateLooperVisuals(looperState);
        return;
      }
  
      if (action === "stop") {
        const wasIdle =
          !looperState.looperData.recording &&
          !looperState.looperData.playing &&
          !looperState.looperData.paused;
        this.triggerLooperButtonMorph(looperState, "stop", performance.now(), morphName);
        this.setLooperButtonMorph(looperState, "record", 0);
        this.setLooperButtonMorph(looperState, "play", 0);
        if (wasIdle) {
          this.clearRecording(looperState);
        } else {
          this.stopRecording(looperState);
          this.stopPlayback(looperState);
        }
        this.updateLooperVisuals(looperState);
        return;
      }
  
      if (action === "play") {
        this.setLooperButtonMorph(looperState, "play", 1, morphName);
        this.setLooperButtonMorph(looperState, "record", 0);
        this.startPlayback(looperState);
        this.updateLooperVisuals(looperState);
        return;
      }
  
      if (action === "pause") {
        this.triggerLooperButtonMorph(looperState, "pause", performance.now(), morphName);
        this.setLooperButtonMorph(looperState, "play", 0);
        this.pausePlayback(looperState);
        this.updateLooperVisuals(looperState);
      }
    },
    updateLooperControlDrag(controller, interaction) {
      const sphere = interaction.sphere;
      const looperState = interaction.looperState;
      if (!sphere || !this.isLooperRuntimeState(looperState)) {
        return;
      }
  
      const deltaY = controller.position.y - interaction.dragStartY;
      const dragDelta = sphere.userData.movementMode === "arc"
        ? this.getArcControlDragDelta(controller, looperState, sphere, interaction)
        : deltaY / this.getInstrumentWorldScaleY(looperState);
      const nextValue = this.getControlValueFromDrag(sphere, interaction, dragDelta);
  
      this.positionControlColliderFromValue(sphere, nextValue);
      this.setLooperControlValue(looperState, interaction.control, nextValue, false, interaction.morphTargets);
    },
    getControlValueFromDrag(sphere, interaction, dragDelta) {
      const scaledDragDelta = dragDelta * (sphere.userData.dragSensitivity ?? 1);
      if (sphere.userData.movementMode === "arc") {
        const dragRange = Math.max(Math.abs(sphere.userData.dragRange || sphere.userData.maxY - sphere.userData.minY), 0.0001);
        return THREE.MathUtils.clamp(interaction.dragStartValue + scaledDragDelta / dragRange, -1, 1);
      }
  
      const nextY = THREE.MathUtils.clamp(
        interaction.dragStartSphereY + scaledDragDelta,
        sphere.userData.minY,
        sphere.userData.maxY,
      );
      return THREE.MathUtils.mapLinear(nextY, sphere.userData.minY, sphere.userData.maxY, -1, 1);
    },
    getControllerLocalPosition(controller, instrumentState) {
      controller.updateMatrixWorld(true);
      instrumentState.root.updateMatrixWorld(true);
      controller.getWorldPosition(tempControlDragPosition);
      instrumentState.root.worldToLocal(tempControlDragPosition);
      return tempControlDragPosition;
    },
    getArcControlDragDelta(controller, instrumentState, sphere, interaction) {
      const startPosition = interaction.dragStartLocalPosition;
      if (!startPosition) {
        return (controller.position.y - interaction.dragStartY) / this.getInstrumentWorldScaleY(instrumentState);
      }
  
      const currentPosition = this.getControllerLocalPosition(controller, instrumentState);
      const midpointAngle = THREE.MathUtils.lerp(sphere.userData.arcMinAngle, sphere.userData.arcMaxAngle, 0.5);
      const localAxisX = sphere.userData.arcSide * Math.sin(midpointAngle);
      const localAxisY = Math.cos(midpointAngle);
      const rotationZ = sphere.userData.arcRotationZ || 0;
      const rotationCos = Math.cos(rotationZ);
      const rotationSin = Math.sin(rotationZ);
      const axisX = localAxisX * rotationCos - localAxisY * rotationSin;
      const axisY = localAxisX * rotationSin + localAxisY * rotationCos;
      const axisLength = Math.hypot(axisX, axisY) || 1;
      const deltaX = currentPosition.x - startPosition.x;
      const deltaY = currentPosition.y - startPosition.y;
  
      return (deltaX * axisX + deltaY * axisY) / axisLength;
    },
    positionControlColliderFromValue(sphere, value) {
      if (!sphere) {
        return;
      }
  
      const clamped = THREE.MathUtils.clamp(value, -1, 1);
      if (sphere.userData.movementMode === "arc") {
        const angle = THREE.MathUtils.mapLinear(
          clamped,
          -1,
          1,
          sphere.userData.arcMinAngle,
          sphere.userData.arcMaxAngle,
        );
        const midpointAngle = THREE.MathUtils.lerp(sphere.userData.arcMinAngle, sphere.userData.arcMaxAngle, 0.5);
        const midpointX = -sphere.userData.arcSide * Math.cos(midpointAngle) * sphere.userData.arcRadius;
        const midpointY = Math.sin(midpointAngle) * sphere.userData.arcRadius;
        const localX = -sphere.userData.arcSide * Math.cos(angle) * sphere.userData.arcRadius - midpointX;
        const localY = Math.sin(angle) * sphere.userData.arcRadius - midpointY;
        const rotationZ = sphere.userData.arcRotationZ || 0;
        const rotationCos = Math.cos(rotationZ);
        const rotationSin = Math.sin(rotationZ);
        sphere.position.set(
          sphere.userData.neutralX + localX * rotationCos - localY * rotationSin,
          sphere.userData.neutralY + localX * rotationSin + localY * rotationCos,
          sphere.userData.neutralZ,
        );
        return;
      }
  
      sphere.position.y = THREE.MathUtils.mapLinear(clamped, -1, 1, sphere.userData.minY, sphere.userData.maxY);
    },
    isLooperRuntimeState(instrumentState) {
      return Boolean(
        instrumentState &&
        instrumentState.kind === "looper" &&
        instrumentState.looperData,
      );
    },
    getLooperRuntimeState(looperState) {
      if (!looperState) {
        return null;
      }

      return this.instrumentRegistry?.get?.(looperState.id) || looperState;
    },
    getLooperControllerForState(looperState) {
      return this.getLooperRuntimeState(looperState)?.looperController || null;
    },
    getLooperData(looperState) {
      return this.getLooperRuntimeState(looperState)?.looperData || null;
    },
    getStableInstrumentId(instrumentOrId) {
      if (typeof instrumentOrId === "string" || typeof instrumentOrId === "number") {
        return instrumentOrId;
      }
      return instrumentOrId?.id ?? null;
    },
    resolveHonkStateById(honkId) {
      if (honkId === null || honkId === undefined) {
        return null;
      }

      return (
        this.instrumentRegistry?.get?.(honkId) ||
        this.instrumentStates?.find?.((instrumentState) => instrumentState.id === honkId) ||
        null
      );
    },
    getLooperRuntimeEntries() {
      const candidates = [
        ...(this.instrumentStates || []),
        ...(this.instrumentRegistry?.getByKind?.("looper") || []),
      ];
      const seen = new Set();
      const entries = [];
      for (const candidate of candidates) {
        const looperState = this.getLooperRuntimeState(candidate);
        if (!this.isLooperRuntimeState(looperState) || seen.has(looperState)) {
          continue;
        }
        const controller = looperState.looperController;
        if (!controller) {
          continue;
        }
        seen.add(looperState);
        entries.push({ looperState, controller });
      }
      return entries;
    },
    getLooperTrack(looperState, trackIndexOrId) {
      const runtimeState = this.getLooperRuntimeState(looperState);
      const controller = runtimeState?.looperController;
      if (!runtimeState?.looperData) {
        return null;
      }

      return controller?.getTrack?.(runtimeState, trackIndexOrId) ||
        runtimeState.looperData.tracks[trackIndexOrId] ||
        null;
    },
    getLooperWireColor(padIndex) {
      return LOOPER_WIRE_COLORS[Math.abs(padIndex) % LOOPER_WIRE_COLORS.length];
    },
    getLooperControlValue(looperState, control) {
      const data = this.getLooperData(looperState);
      if (!data) {
        return 0;
      }
  
      if (control === "speed") {
        return data.speedControlValue;
      }
      if (control === "gap") {
        return data.gapControlValue;
      }
      return data.volumeControlValue;
    },
    setLooperControlValue(looperState, control, value, updateSphere = true, morphTargetsOverride = null) {
      const runtimeState = this.getLooperRuntimeState(looperState);
      const controller = runtimeState?.looperController;
      if (!runtimeState?.looperData || !controller) {
        return;
      }
  
      const clamped = THREE.MathUtils.clamp(value, -1, 1);
      if (controller.setControlValue(runtimeState, control, clamped) === null) {
        return;
      }
  
      this.applyLooperControlMorphValue(looperState, control, clamped, morphTargetsOverride);
  
      if (updateSphere) {
        const sphere = looperState.hitTargets[getLooperControlName(control)];
        if (sphere?.userData.isLooperControl) {
          this.positionControlColliderFromValue(sphere, clamped);
        }
      }
    },
    getLooperVolumeFromControl(value) {
      return LooperControlMapping.getVolumeFromControl(value);
    },
    getLooperSpeedFromControl(value) {
      return LooperControlMapping.getSpeedFromControl(value);
    },
    getLooperGapFromControl(value) {
      return LooperControlMapping.getGapFromControl(value);
    },
    applyLooperControlMorphValue(looperState, control, value, morphTargetsOverride = null) {
      const morphTargets = morphTargetsOverride || looperState?.hitTargets?.[getLooperControlName(control)]?.userData.looperMorphTargets || LOOPER_CONTROL_MORPH_TARGETS[control];
      if (!this.isLooperRuntimeState(looperState) || !morphTargets) {
        return;
      }
  
      const clamped = THREE.MathUtils.clamp(value, -1, 1);
      this.setMorph(morphTargets.up, Math.max(clamped, 0), looperState);
      this.setMorph(morphTargets.down, Math.max(-clamped, 0), looperState);
    },
    setLooperButtonMorph(looperState, action, value, morphNameOverride = null) {
      const data = this.getLooperData(looperState);
      const morphName = this.getLooperButtonMorphName(looperState, action, morphNameOverride);
      if (!data || !morphName) {
        return;
      }
  
      this.setMorph(morphName, value, looperState);
      if (value <= 0) {
        data.buttonMorphReleaseTimes?.delete(action);
      }
    },
    getLooperButtonMorphName(looperState, action, morphNameOverride = null) {
      return (
        morphNameOverride ||
        looperState?.hitTargets?.[getLooperButtonName(action)]?.userData.looperMorphName ||
        LOOPER_BUTTON_MORPH_TARGETS[action]
      );
    },
    triggerLooperButtonMorph(looperState, action, now = performance.now(), morphNameOverride = null) {
      const data = this.getLooperData(looperState);
      const morphName = this.getLooperButtonMorphName(looperState, action, morphNameOverride);
      if (!data || !morphName) {
        return;
      }
  
      this.setMorph(morphName, 1, looperState);
      data.buttonMorphReleaseTimes.set(action, {
        releaseTimeMs: now + LOOPER_MORPH_SETTINGS.buttonPressDurationMs,
        morphName,
      });
    },
    updateLooperMorphAnimations(now = performance.now()) {
      for (const looperState of this.instrumentStates) {
        const data = this.getLooperData(looperState);
        if (!data || !looperState.root?.visible) {
          continue;
        }
  
        this.updateLooperButtonMorphs(looperState, now);
        this.updateLooperPlayingMorph(looperState, now);
      }
    },
    updateLooperButtonMorphs(looperState, now) {
      const data = this.getLooperData(looperState);
      if (!data?.buttonMorphReleaseTimes) {
        return;
      }
  
      for (const [action, releaseEntry] of data.buttonMorphReleaseTimes) {
        if (now < releaseEntry.releaseTimeMs) {
          continue;
        }
        if (releaseEntry.morphName) {
          this.setMorph(releaseEntry.morphName, 0, looperState);
        }
        data.buttonMorphReleaseTimes.delete(action);
      }
    },
    updateLooperPlayingMorph(looperState, now) {
      const data = this.getLooperData(looperState);
      if (!data) {
        return;
      }
  
      const settings = LOOPER_MORPH_SETTINGS.playingHead;
      const min = settings.min ?? 0;
      const max = settings.max ?? 1;
      if (data.playing && !data.paused) {
        const previousUpdateMs = data.lastPlayingHeadMorphUpdateMs || now;
        const deltaMs = Math.max(now - previousUpdateMs, 0);
        const averageIncrement = Math.max(
          ((settings.minIncrement ?? 0.06) + (settings.maxIncrement ?? 0.18)) * 0.5,
          0.0001,
        );
        const cycleMs = Math.max((settings.changeIntervalMs ?? 90) / averageIncrement, 1);
        data.playingHeadMorphPhase =
          (data.playingHeadMorphPhase || 0) + (deltaMs / cycleMs) * Math.PI * 2;
        data.playingHeadMorphTarget = THREE.MathUtils.lerp(
          min,
          max,
          0.5 - Math.cos(data.playingHeadMorphPhase) * 0.5,
        );
        data.playingHeadMorphValue = THREE.MathUtils.lerp(
          data.playingHeadMorphValue ?? min,
          data.playingHeadMorphTarget,
          0.24,
        );
        data.lastPlayingHeadMorphUpdateMs = now;
      } else {
        data.playingHeadMorphValue = THREE.MathUtils.lerp(data.playingHeadMorphValue ?? min, min, 0.24);
        data.lastPlayingHeadMorphUpdateMs = now;
      }
  
      this.setMorph(LOOPER_MORPH_TARGET_NAMES.playingHead, data.playingHeadMorphValue, looperState);
    },
    clearLooperRuntimeState(looperState) {
      const data = this.getLooperData(looperState);
      if (!data) {
        return;
      }
  
      const runtimeState = this.getLooperRuntimeState(looperState);
      runtimeState?.looperController?.clearRuntimeState(runtimeState);
      data.buttonMorphReleaseTimes.clear();
      for (const morphName of Object.values(LOOPER_BUTTON_MORPH_TARGETS)) {
        this.setMorph(morphName, 0, looperState);
      }
      data.playingHeadMorphValue = 0;
      data.playingHeadMorphTarget = 0;
      data.playingHeadMorphPhase = 0;
      data.lastPlayingHeadMorphUpdateMs = 0;
      this.setMorph(LOOPER_MORPH_TARGET_NAMES.playingHead, 0, looperState);
    },
    startRecording(looperState, now = performance.now()) {
      const runtimeState = this.getLooperRuntimeState(looperState);
      return runtimeState?.looperController?.startRecording(runtimeState, now) ?? false;
    },
    stopRecording(looperState, now = performance.now()) {
      const runtimeState = this.getLooperRuntimeState(looperState);
      return runtimeState?.looperController?.stopRecording(runtimeState, now) ?? false;
    },
    clearRecording(looperState) {
      const runtimeState = this.getLooperRuntimeState(looperState);
      return runtimeState?.looperController?.clearRecording(runtimeState);
    },
    startPlayback(looperState, now = performance.now()) {
      const runtimeState = this.getLooperRuntimeState(looperState);
      return runtimeState?.looperController?.startPlayback(runtimeState, now) ?? false;
    },
    pausePlayback(looperState) {
      const runtimeState = this.getLooperRuntimeState(looperState);
      return runtimeState?.looperController?.pausePlayback(runtimeState) ?? false;
    },
    stopPlayback(looperState) {
      const runtimeState = this.getLooperRuntimeState(looperState);
      return runtimeState?.looperController?.stopPlayback(runtimeState) ?? false;
    },
    updatePlayback(delta = 0, time = performance.now()) {
      this.updateLooperPlayback(time);
      this.updateLooperPlaybackAudio();
    },
    updateLooperPlaybackDuringPendingSpawn(now = performance.now()) {
      this.clearLiveHornInteractionState();
      this.updateLooperPlayback(now);
      this.applyResolvedHonkPerformanceStates();
      this.updateLooperPlaybackAudio();
      this.updateLooperMorphAnimations(now);
    },
    updateLooperRecordings(now = performance.now()) {
      for (const { looperState, controller } of this.getLooperRuntimeEntries()) {
        controller.updateRecordings([looperState], now);
      }
    },
    updateLooperPlayback(now = performance.now()) {
      for (const { looperState, controller } of this.getLooperRuntimeEntries()) {
        controller.updatePlayback([looperState], now);
      }
    },
    updateLooperPlaybackAudio() {
      const updatedControllers = new Set();
      for (const { controller } of this.getLooperRuntimeEntries()) {
        if (!updatedControllers.has(controller)) {
          controller.updateAutomationAudio();
          updatedControllers.add(controller);
        }
      }
    },
    connectLooperTrackToHonk(looperState, trackIndexOrId, honkOrId) {
      const runtimeState = this.getLooperRuntimeState(looperState);
      const honkId = this.getStableInstrumentId(honkOrId);
      if (!runtimeState?.looperController || honkId === null || honkId === undefined) {
        return false;
      }
      return Boolean(runtimeState.looperController.connectTrackToHonk(runtimeState, trackIndexOrId, honkId));
    },
    disconnectLooperTrack(looperState, trackIndexOrId) {
      const runtimeState = this.getLooperRuntimeState(looperState);
      return runtimeState?.looperController?.disconnectTrack(runtimeState, trackIndexOrId) || null;
    },
};
