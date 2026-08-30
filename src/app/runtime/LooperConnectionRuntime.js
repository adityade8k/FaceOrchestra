import * as THREE from "three";
import { DEBUG_MODE } from "../../config/debug.js";
import {
  HONK_CONNECTION_TARGET_NAME,
  LOOPER_BUTTON_ACTIONS,
  LOOPER_COLLIDER_OPACITY,
  LOOPER_DEBUG_COLORS,
  LOOPER_SHAKE_DISCONNECT_SETTINGS,
  LOOPER_WIRE_SETTINGS,
} from "../../config/looper.js";
import {
  getLooperButtonName,
  getLooperControlName,
} from "../../instruments/looper/looperNames.js";
import {
  createWireMaterial,
  disposeWireMesh as disposeWireMeshUtility,
  updateWireMeshGeometry as updateWireMeshGeometryUtility,
} from "../../instruments/looper/view/wireUtils.js";
import { getWireSocketTangent } from "../../instruments/core/view/connectionWirePresentation.js";

const tempLooperCurrentPosition = new THREE.Vector3();
const tempLooperCurrentQuaternion = new THREE.Quaternion();
const tempLooperDeltaQuaternion = new THREE.Quaternion();
const tempLooperPreviousPosition = new THREE.Vector3();
const tempLooperPreviousQuaternion = new THREE.Quaternion();
const tempShakeBounds = new THREE.Box3();
const tempShakePosition = new THREE.Vector3();
const tempShakeRange = new THREE.Vector3();
const tempWireEnd = new THREE.Vector3();
const tempWireEndTangent = new THREE.Vector3();
const tempWireStart = new THREE.Vector3();
const tempWireStartTangent = new THREE.Vector3();


export const LooperConnectionRuntimeMethods = {
    startLooperWireInteraction(controller, looperState, track) {
      const wireColor = this.getLooperWireColor(track.index);
      const wireMesh = new THREE.Mesh(
        new THREE.BufferGeometry(),
        this.createLooperWireMaterial(wireColor),
      );
      wireMesh.name = `LOOPER_wire_preview_${looperState.id}_${track.index}`;
      wireMesh.renderOrder = 15;
      this.scene.add(wireMesh);
  
      const interaction = {
        type: "looperWire",
        looperState,
        track,
        wireMesh,
      };
      this.updateActiveLooperWire(controller, interaction);
      return interaction;
    },
    updateActiveLooperWire(controller, interaction) {
      if (!interaction?.wireMesh || !interaction.track?.nodeTarget) {
        return;
      }
  
      interaction.track.nodeTarget.getWorldPosition(tempWireStart);
      this.setRaycasterFromController(controller);
  
      const hit = this.getCurrentHit(controller);
      if (hit?.object?.userData.isHonkConnectionTarget) {
        tempWireEnd.copy(hit.point);
        const honkState = this.instrumentRegistry?.getFromObject3D?.(hit.object) || null;
        getWireSocketTangent(
          hit.object,
          honkState?.root,
          tempWireEnd,
          tempWireEndTangent,
          true,
        );
      } else {
        tempWireEnd.copy(this.raycaster.ray.origin).addScaledVector(this.raycaster.ray.direction, 0.85);
        tempWireEndTangent.copy(tempWireEnd).sub(tempWireStart).normalize();
      }

      getWireSocketTangent(
        interaction.track.nodeTarget,
        interaction.looperState?.root,
        tempWireStart,
        tempWireStartTangent,
      );
      this.updateWireMeshGeometry(
        interaction.wireMesh,
        tempWireStart,
        tempWireEnd,
        tempWireStartTangent,
        tempWireEndTangent,
      );
    },
    finishLooperWireInteraction(controller, interaction) {
      const hit = this.getCurrentHit(controller);
      const target = hit?.object?.userData.isHonkConnectionTarget ? hit.object : null;
      const honkState = target
        ? this.instrumentRegistry?.getFromObject3D?.(target) || null
        : null;
      if (this.isLooperConnectableHonk(honkState)) {
        this.connectLooperTrackToHonk(interaction.looperState, interaction.track.index, honkState.id);
      }
  
      this.disposeWireMesh(interaction.wireMesh);
      interaction.wireMesh = null;
    },
    updateShakeDisconnect(now = performance.now()) {
      const settings = LOOPER_SHAKE_DISCONNECT_SETTINGS;
      if (!settings?.enabled) {
        return;
      }
  
      for (const controller of this.controllers) {
        const controllerState = this.controllerStates.get(controller);
        const honkState = this.getShakeDisconnectHonkState(controllerState);
        if (!honkState) {
          this.resetShakeDisconnectTracking(controllerState);
          continue;
        }
  
        const connections = this.getLooperConnectionsForHonk(honkState);
        if (connections.length === 0) {
          this.resetShakeDisconnectTracking(controllerState);
          continue;
        }
  
        if (now < (controllerState.shakeDisconnectCooldownUntilMs || 0)) {
          continue;
        }
  
        this.recordShakeDisconnectSample(controllerState, honkState, now);
        if (!this.isShakeDisconnectTriggered(controllerState, settings, now)) {
          continue;
        }
  
        for (const { looperState, track } of connections) {
          this.disconnectLooperTrack(looperState, track.index);
        }
        controllerState.shakeDisconnectCooldownUntilMs = now + Math.max(settings.cooldownMs || 0, 0);
        this.resetShakeDisconnectTracking(controllerState);
      }
    },
    getShakeDisconnectHonkState(controllerState) {
      if (!controllerState?.gripHeld) {
        return null;
      }
  
      const sourceState = controllerState.gripSourceInstrumentState;
      if (this.isShakeDisconnectHonkState(sourceState)) {
        return sourceState;
      }
  
      const gripState = controllerState.gripInstrumentState;
      if (this.isShakeDisconnectHonkState(gripState)) {
        return gripState;
      }
  
      return null;
    },
    isShakeDisconnectHonkState(state) {
      return Boolean(this.isLooperConnectableHonk(state) && !state.pendingPlacement);
    },
    isLooperConnectableHonk(honkState) {
      return Boolean(
        honkState &&
        honkState.kind === "honk" &&
        !honkState.disposed &&
        honkState.root?.visible,
      );
    },
    getLooperConnectionsForHonk(honkState) {
      const connections = [];
      const honkId = this.getStableInstrumentId(honkState);
      if (honkId === null || honkId === undefined) {
        return connections;
      }
  
      for (const looperState of this.instrumentStates) {
        const data = this.getLooperData(looperState);
        if (!data || !looperState.root?.visible) {
          continue;
        }
  
        for (const track of data.tracks) {
          if (track.connectedHonkId === honkId) {
            connections.push({ looperState, track });
          }
        }
      }
      return connections;
    },
    recordShakeDisconnectSample(controllerState, honkState, now) {
      if (controllerState.shakeDisconnectTargetState !== honkState) {
        this.resetShakeDisconnectTracking(controllerState);
        controllerState.shakeDisconnectTargetState = honkState;
      }
  
      if (!controllerState.shakeDisconnectSamples) {
        controllerState.shakeDisconnectSamples = [];
      }
      if (!controllerState.shakeDisconnectLastPosition) {
        controllerState.shakeDisconnectLastPosition = new THREE.Vector3();
      }
  
      honkState.root.updateMatrixWorld(true);
      honkState.root.getWorldPosition(tempShakePosition);
  
      const samples = controllerState.shakeDisconnectSamples;
      if (!controllerState.shakeDisconnectHasLastPosition) {
        controllerState.shakeDisconnectLastPosition.copy(tempShakePosition);
        controllerState.shakeDisconnectLastSampleTime = now;
        controllerState.shakeDisconnectHasLastPosition = true;
        samples.push({ time: now, position: tempShakePosition.clone(), velocity: 0 });
        return;
      }
  
      const elapsedSeconds = Math.max((now - controllerState.shakeDisconnectLastSampleTime) / 1000, 0.0001);
      const velocity = tempShakePosition.distanceTo(controllerState.shakeDisconnectLastPosition) / elapsedSeconds;
      samples.push({ time: now, position: tempShakePosition.clone(), velocity });
      controllerState.shakeDisconnectLastPosition.copy(tempShakePosition);
      controllerState.shakeDisconnectLastSampleTime = now;
  
      const durationMs = Math.max(LOOPER_SHAKE_DISCONNECT_SETTINGS.durationMs || 0, 0);
      if (durationMs > 0) {
        const oldestAllowedTime = now - durationMs;
        while (samples.length > 0 && samples[0].time < oldestAllowedTime) {
          samples.shift();
        }
      } else {
        while (samples.length > 2) {
          samples.shift();
        }
      }
    },
    isShakeDisconnectTriggered(controllerState, settings, now) {
      const samples = controllerState.shakeDisconnectSamples || [];
      if (samples.length < 2) {
        return false;
      }
  
      const durationMs = Math.max(settings.durationMs || 0, 0);
      const elapsedMs = samples[samples.length - 1].time - samples[0].time;
      if (elapsedMs < durationMs) {
        return false;
      }
  
      let velocitySum = 0;
      for (const sample of samples) {
        velocitySum += sample.velocity || 0;
      }
      const averageVelocity = velocitySum / Math.max(samples.length - 1, 1);
      if (averageVelocity < Math.max(settings.intensity || 0, 0)) {
        return false;
      }
  
      tempShakeBounds.makeEmpty();
      for (const sample of samples) {
        tempShakeBounds.expandByPoint(sample.position);
      }
      tempShakeBounds.getSize(tempShakeRange);
      const range = tempShakeRange.length();
      return range >= Math.max(settings.range || 0, 0);
    },
    resetShakeDisconnectTracking(controllerState) {
      if (!controllerState) {
        return;
      }
  
      controllerState.shakeDisconnectTargetState = null;
      controllerState.shakeDisconnectHasLastPosition = false;
      controllerState.shakeDisconnectLastSampleTime = 0;
      if (controllerState.shakeDisconnectSamples) {
        controllerState.shakeDisconnectSamples.length = 0;
      }
    },
    updateLooperFollowerTransforms() {
      for (const looperState of this.instrumentStates) {
        const data = this.getLooperData(looperState);
        if (!data || !looperState.root?.visible) {
          continue;
        }
  
        looperState.root.updateMatrixWorld(true);
        looperState.root.getWorldPosition(tempLooperCurrentPosition);
        looperState.root.getWorldQuaternion(tempLooperCurrentQuaternion);
  
        tempLooperPreviousPosition.copy(data.lastPosition);
        tempLooperPreviousQuaternion.copy(data.lastQuaternion);
        tempLooperDeltaQuaternion.copy(tempLooperCurrentQuaternion).multiply(tempLooperPreviousQuaternion.invert());
  
        const positionChanged = tempLooperCurrentPosition.distanceToSquared(tempLooperPreviousPosition) > 0.0000001;
        const rotationChanged = Math.abs(tempLooperDeltaQuaternion.w) < 0.999999;
        if (positionChanged || rotationChanged) {
          const followerHonks = this.getLooperFollowerHonks(looperState);
  
          for (const honkState of followerHonks) {
            if (this.isInstrumentStateCurrentlyGripped(honkState)) {
              continue;
            }
  
            honkState.root.position
              .sub(tempLooperPreviousPosition)
              .applyQuaternion(tempLooperDeltaQuaternion)
              .add(tempLooperCurrentPosition);
            honkState.root.quaternion.premultiply(tempLooperDeltaQuaternion);
          }
        }
  
        data.lastPosition.copy(tempLooperCurrentPosition);
        data.lastQuaternion.copy(tempLooperCurrentQuaternion);
      }
    },
    getLooperFollowerHonks(looperState) {
      const followerHonks = new Set();
      for (const connection of this.getLooperData(looperState)?.tracks || []) {
        const honkState = this.resolveHonkStateById(connection.connectedHonkId);
        if (!this.isLooperConnectableHonk(honkState)) {
          continue;
        }
        for (const followerHonk of this.getLooperFollowerHonkChain(honkState)) {
          followerHonks.add(followerHonk);
        }
      }
      return followerHonks;
    },
    getLooperFollowerHonkChain(honkState) {
      if (!this.isLooperConnectableHonk(honkState)) {
        return [];
      }
  
      const chain = this.getTouchingInstrumentChain(honkState).filter((state) =>
        this.isLooperConnectableHonk(state),
      );
      return chain.length > 0 ? chain : [honkState];
    },
    getLooperPlaybackHonkTargetIds(track, honkId = track?.connectedHonkId) {
      const honkState = this.resolveHonkStateById(honkId);
      return this.getLooperFollowerHonkChain(honkState)
        .map((targetState) => targetState.id)
        .filter((targetId) => targetId !== null && targetId !== undefined);
    },
    getLooperPlaybackHonkTargets(honkOrId) {
      const honkId = this.getStableInstrumentId(honkOrId);
      return this.getLooperFollowerHonkChain(this.resolveHonkStateById(honkId));
    },
    isInstrumentStateCurrentlyGripped(instrumentState) {
      for (const controllerState of this.controllerStates.values()) {
        if (controllerState.gripHeld && controllerState.gripInstrumentState === instrumentState) {
          return true;
        }
      }
      return false;
    },
    updateLooperWires() {
      for (const looperState of this.instrumentStates) {
        const data = this.getLooperData(looperState);
        if (!data || !looperState.root?.visible) {
          continue;
        }
  
        for (const track of data.tracks) {
          const honkState = this.resolveHonkStateById(track.connectedHonkId);
          if (!this.isLooperConnectableHonk(honkState)) {
            if (track.wireMesh) {
              this.disposeWireMesh(track.wireMesh);
              track.wireMesh = null;
            }
            continue;
          }
          this.updateLooperWireForTrack(looperState, track);
        }
      }
    },
    updateLooperWireForTrack(looperState, track) {
      const honkState = this.resolveHonkStateById(track?.connectedHonkId);
      if (!track?.nodeTarget || !this.isLooperConnectableHonk(honkState)) {
        return;
      }
  
      const honkTarget =
        honkState.hitTargets?.[HONK_CONNECTION_TARGET_NAME] ||
        honkState.getTarget?.("honk.looper-connector");
      if (!honkTarget) {
        return;
      }
  
      if (!track.wireMesh) {
        const color = this.getLooperWireColor(track.index);
        track.wireMesh = new THREE.Mesh(new THREE.BufferGeometry(), this.createLooperWireMaterial(color));
        track.wireMesh.name = `LOOPER_wire_${looperState.id}_${track.index}`;
        track.wireMesh.renderOrder = 14;
        this.scene.add(track.wireMesh);
      }
  
      track.nodeTarget.getWorldPosition(tempWireStart);
      honkTarget.getWorldPosition(tempWireEnd);
      getWireSocketTangent(
        track.nodeTarget,
        looperState.root,
        tempWireStart,
        tempWireStartTangent,
      );
      getWireSocketTangent(
        honkTarget,
        honkState.root,
        tempWireEnd,
        tempWireEndTangent,
        true,
      );
      this.updateWireMeshGeometry(
        track.wireMesh,
        tempWireStart,
        tempWireEnd,
        tempWireStartTangent,
        tempWireEndTangent,
      );
    },
    createLooperWireMaterial(color) {
      return createWireMaterial(color, this.instrumentMaterialTextures);
    },
    updateWireMeshGeometry(wireMesh, start, end, startTangent, endTangent) {
      updateWireMeshGeometryUtility(wireMesh, start, end, {
        startTangent,
        endTangent,
        settings: LOOPER_WIRE_SETTINGS,
      });
    },
    disposeWireMesh(wireMesh) {
      disposeWireMeshUtility(wireMesh);
    },
    updateAllLooperVisuals() {
      for (const state of this.instrumentStates) {
        if (state.kind === "looper") {
          this.updateLooperVisuals(state);
        }
      }
    },
    updateLooperVisuals(looperState) {
      const data = this.getLooperData(looperState);
      if (!data) {
        return;
      }

      for (const [control, value] of [
        ["volume", data.volumeControlValue],
        ["gap", data.gapControlValue],
      ]) {
        this.applyLooperControlMorphValue(looperState, control, value);
        const sphere = looperState.hitTargets[getLooperControlName(control)];
        if (sphere?.userData.isLooperControl) {
          this.positionControlColliderFromValue(sphere, value);
        }
      }

      this.setLooperButtonMorph(looperState, "record", data.recording || data.recordArmed ? 1 : 0);
      this.setLooperButtonMorph(
        looperState,
        "play",
        (data.playing && !data.paused) || data.playArmed ? 1 : 0,
      );
  
      for (const action of LOOPER_BUTTON_ACTIONS) {
        const target = looperState.hitTargets[getLooperButtonName(action)];
        const active =
          (action === "record" && (data.recording || data.recordArmed)) ||
          (action === "play" && ((data.playing && !data.paused) || data.playArmed)) ||
          (action === "pause" && (data.paused || data.pauseArmed)) ||
          (action === "stop" && !data.playing && !data.paused && !data.recording && !data.armed);
        this.setHitTargetDebugColor(
          target,
          active ? LOOPER_DEBUG_COLORS.buttonActive : LOOPER_DEBUG_COLORS.button[action],
          active ? 0.48 : LOOPER_COLLIDER_OPACITY,
        );
      }
  
      for (const track of data.tracks) {
        const connected = track.connectedHonkId !== null && track.connectedHonkId !== undefined;
        let nodeColor = connected ? this.getLooperWireColor(track.index) : LOOPER_DEBUG_COLORS.nodeOpen;
        let opacity = connected ? 0.5 : LOOPER_COLLIDER_OPACITY;
        if (track.isRecording) {
          nodeColor = LOOPER_DEBUG_COLORS.recording;
          opacity = 0.58;
        } else if (track.isPlaying) {
          nodeColor = LOOPER_DEBUG_COLORS.playing;
          opacity = 0.58;
        } else if (data.hasRecording && track.active) {
          nodeColor = LOOPER_DEBUG_COLORS.recorded;
          opacity = 0.5;
        }
        this.setHitTargetDebugColor(track.nodeTarget, nodeColor, opacity);
      }
  
      this.setHitTargetDebugColor(
        looperState.hitTargets[getLooperControlName("volume")],
        LOOPER_DEBUG_COLORS.controlVolume,
        LOOPER_COLLIDER_OPACITY,
      );
      this.setHitTargetDebugColor(
        looperState.hitTargets[getLooperControlName("gap")],
        LOOPER_DEBUG_COLORS.controlGap,
        LOOPER_COLLIDER_OPACITY,
      );
    },
    setHitTargetDebugColor(target, color, opacity = null) {
      if (!target?.material) {
        return;
      }
  
      target.userData.currentHitColor = color;
      target.material.color.setHex(color);
      if (typeof opacity === "number") {
        const visibleOpacity = DEBUG_MODE ? opacity : 0;
        target.userData.baseHitOpacity = visibleOpacity;
        target.material.opacity = visibleOpacity;
      }
    },
};
