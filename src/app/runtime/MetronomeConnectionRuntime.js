import * as THREE from "three";
import { METRONOME_SETTINGS } from "../../config/metronome.js";
import {
  createConnectionWireMesh,
  disposeWireMesh,
  updateConnectionWireTargets,
  updateConnectionWireToPoint,
} from "../../instruments/core/view/connectionWirePresentation.js";
import {
  HONK_METRONOME_TARGET_PORT_ID,
  METRONOME_CONNECTION_TARGET_KINDS,
} from "../../instruments/metronome/MetronomeConnectionManager.js";

const previewEnd = new THREE.Vector3();

export const MetronomeConnectionRuntimeMethods = {
  startMetronomeWireInteraction(controller, metronome, portId) {
    const portTarget = metronome?.getConnectionPortTarget?.(portId);
    if (!portTarget) return null;
    const wireMesh = createConnectionWireMesh({
      scene: this.scene,
      name: `METRONOME_wire_preview_${metronome.id}_${portId}`,
      color: METRONOME_SETTINGS.connectionWirePreviewColor,
      textures: this.instrumentMaterialTextures,
      renderOrder: METRONOME_SETTINGS.connectionWirePreviewRenderOrder,
    });
    const interaction = { type: "metronomeWire", metronomeId: metronome.id, portId, wireMesh };
    this.updateActiveMetronomeWire(controller, interaction);
    return interaction;
  },

  updateActiveMetronomeWire(controller, interaction) {
    const metronome = this.instrumentRegistry.get(interaction?.metronomeId);
    const portTarget = metronome?.getConnectionPortTarget?.(interaction?.portId);
    if (!interaction?.wireMesh || !portTarget) {
      this.cancelMetronomeWireInteraction(interaction);
      return;
    }
    this.setRaycasterFromController(controller);
    const hit = this.getCurrentHit(controller);
    const releaseTarget = this.resolveMetronomeWireReleaseTarget(hit?.object);
    if (releaseTarget) {
      updateConnectionWireToPoint({
        wireMesh: interaction.wireMesh,
        startTarget: portTarget,
        startOwnerRoot: metronome.root,
        endPoint: hit.point,
        endTarget: hit.object,
        endOwnerRoot: releaseTarget.target.root,
      });
      return;
    }
    previewEnd.copy(this.raycaster.ray.origin).addScaledVector(this.raycaster.ray.direction, 0.85);
    updateConnectionWireToPoint({
      wireMesh: interaction.wireMesh,
      startTarget: portTarget,
      startOwnerRoot: metronome.root,
      endPoint: previewEnd,
    });
  },

  finishMetronomeWireInteraction(controller, interaction) {
    try {
      const hit = this.getCurrentHit(controller);
      const releaseTarget = this.resolveMetronomeWireReleaseTarget(hit?.object);
      if (!releaseTarget) return null;
      return this.metronomeConnectionManager.connect({
        metronomeId: interaction.metronomeId,
        portId: interaction.portId,
        targetKind: releaseTarget.target.kind,
        targetId: releaseTarget.target.id,
        targetPortId: releaseTarget.targetPortId,
      });
    } finally {
      this.cancelMetronomeWireInteraction(interaction);
    }
  },

  cancelMetronomeWireInteraction(interaction) {
    if (!interaction?.wireMesh) return false;
    disposeWireMesh(interaction.wireMesh);
    interaction.wireMesh = null;
    return true;
  },

  cancelAllMetronomeWireInteractions() {
    for (const controllerState of this.controllerStates.values()) {
      const interaction = controllerState.activeTriggerInteraction;
      if (interaction?.type !== "metronomeWire") continue;
      this.cancelMetronomeWireInteraction(interaction);
      controllerState.activeTriggerInteraction = null;
    }
  },

  resolveMetronomeWireReleaseTarget(object) {
    const target = this.instrumentRegistry.getFromObject3D(object);
    if (object?.userData?.isLooperNode && target?.kind === "looper") {
      const track = target.tracks?.[object.userData.looperTrackIndex] || null;
      return track ? { target, targetPortId: track.trackId } : null;
    }
    if (object?.userData?.isHonkConnectionTarget && target?.kind === "honk") {
      return { target, targetPortId: HONK_METRONOME_TARGET_PORT_ID };
    }
    return null;
  },

  handleMetronomeConnectionAdded(connection) {
    const key = this.getMetronomeConnectionRuntimeKey(connection);
    this.metronomeConnectionRuntimeEntries ||= new Map();
    this.metronomeConnectionRuntimeEntries.set(
      key,
      this.createMetronomeConnectionRuntimeEntry(connection),
    );
    if (connection.targetKind === METRONOME_CONNECTION_TARGET_KINDS.honk) {
      const timing = this.instrumentRegistry.get(connection.metronomeId)?.getBeatTiming?.() || null;
      this.metronomePulseStates.set(key, {
        active: false,
        generation: 0,
        honk: null,
        lastBeatOrdinal: timing?.lastEmittedBeatOrdinal ?? null,
        releaseAtMs: 0,
      });
    }
    this.metronomeConnectionsNeedValidation = false;
    this.updateMetronomeConnectionWire(connection);
  },

  handleMetronomeConnectionRemoved(connection) {
    const key = this.getMetronomeConnectionRuntimeKey(connection);
    const wireMesh = this.metronomeConnectionWires.get(key);
    if (wireMesh) disposeWireMesh(wireMesh);
    this.metronomeConnectionWires.delete(key);
    this.metronomeConnectionRuntimeEntries?.delete(key);
    this.releaseMetronomePulse(connection);
    this.metronomePulseStates.delete(key);
    if (connection.targetKind === METRONOME_CONNECTION_TARGET_KINDS.looper) {
      const looper = this.instrumentRegistry.get(connection.targetId);
      looper?.looperController?.handleClockDisconnected?.(looper);
    }
  },

  validateMetronomeConnections(now = performance.now()) {
    const lastValidation = this.lastMetronomeSafetyValidationMs;
    if (
      !this.metronomeConnectionsNeedValidation &&
      Number.isFinite(lastValidation) &&
      now - lastValidation < 250
    ) return false;
    this.metronomeConnectionsNeedValidation = false;
    this.lastMetronomeSafetyValidationMs = now;
    for (const entry of this.metronomeConnectionRuntimeEntries?.values?.() || []) {
      const connection = entry.connection;
      if (!this.isMetronomeConnectionUsable(connection, entry)) {
        this.metronomeConnectionManager.disconnectPort(
          connection.metronomeId,
          connection.portId,
          "endpoint-unavailable",
        );
      }
    }
    return true;
  },

  updateMetronomeConnections(now = performance.now()) {
    for (const entry of this.metronomeConnectionRuntimeEntries?.values?.() || []) {
      const connection = entry.connection;
      if (connection.targetKind === METRONOME_CONNECTION_TARGET_KINDS.honk) {
        this.updateMetronomeHonkPulse(connection, now);
      }
    }
  },

  isMetronomeConnectionUsable(connection, runtimeEntry = null) {
    const metronome = runtimeEntry?.metronome || this.instrumentRegistry.get(connection.metronomeId);
    const target = runtimeEntry?.target || this.instrumentRegistry.get(connection.targetId);
    return Boolean(
      metronome?.kind === "metronome" &&
      !metronome.disposed &&
      !metronome.pendingPlacement &&
      metronome.root?.visible !== false &&
      metronome.hasConnectionPort?.(connection.portId) &&
      target?.kind === connection.targetKind &&
      !target.disposed &&
      !target.pendingPlacement &&
      target.root?.visible !== false &&
      (runtimeEntry?.endTarget || this.resolveMetronomeConnectionTarget(connection)),
    );
  },

  updateMetronomeConnectionWires() {
    for (const entry of this.metronomeConnectionRuntimeEntries?.values?.() || []) {
      this.updateMetronomeConnectionWire(entry.connection, entry);
    }
  },

  updateMetronomeConnectionWire(connection, runtimeEntry = null) {
    const key = this.getMetronomeConnectionRuntimeKey(connection);
    const entry = runtimeEntry || this.metronomeConnectionRuntimeEntries?.get(key) ||
      this.createMetronomeConnectionRuntimeEntry(connection);
    const { metronome, target, startTarget, endTarget } = entry;
    if (!startTarget || !endTarget || !target) return false;
    let wireMesh = this.metronomeConnectionWires.get(key);
    if (!wireMesh) {
      wireMesh = createConnectionWireMesh({
        scene: this.scene,
        name: `METRONOME_wire_${connection.metronomeId}_${connection.portId}`,
        color: METRONOME_SETTINGS.connectionWireColor,
        textures: this.instrumentMaterialTextures,
        renderOrder: METRONOME_SETTINGS.connectionWireRenderOrder,
      });
      this.metronomeConnectionWires.set(key, wireMesh);
    }
    return updateConnectionWireTargets(
      wireMesh,
      startTarget,
      metronome.root,
      endTarget,
      target.root,
    );
  },

  resolveMetronomeConnectionTarget(connection) {
    const cached = this.metronomeConnectionRuntimeEntries?.get(
      this.getMetronomeConnectionRuntimeKey(connection),
    );
    if (cached?.endTarget) return cached.endTarget;
    const target = this.instrumentRegistry.get(connection.targetId);
    if (connection.targetKind === METRONOME_CONNECTION_TARGET_KINDS.looper) {
      return target?.tracks?.find((track) => track.trackId === connection.targetPortId)?.nodeTarget || null;
    }
    if (connection.targetKind === METRONOME_CONNECTION_TARGET_KINDS.honk) {
      return target?.getTarget?.(HONK_METRONOME_TARGET_PORT_ID) ||
        target?.targetsByRole?.get?.(HONK_METRONOME_TARGET_PORT_ID) || null;
    }
    return null;
  },

  createMetronomeConnectionRuntimeEntry(connection) {
    const metronome = this.instrumentRegistry.get(connection.metronomeId);
    const target = this.instrumentRegistry.get(connection.targetId);
    let endTarget = null;
    if (connection.targetKind === METRONOME_CONNECTION_TARGET_KINDS.looper) {
      for (const track of target?.tracks || []) {
        if (track.trackId === connection.targetPortId) {
          endTarget = track.nodeTarget || null;
          break;
        }
      }
    } else if (connection.targetKind === METRONOME_CONNECTION_TARGET_KINDS.honk) {
      endTarget = target?.getTarget?.(HONK_METRONOME_TARGET_PORT_ID) ||
        target?.targetsByRole?.get?.(HONK_METRONOME_TARGET_PORT_ID) || null;
    }
    return {
      connection,
      metronome,
      target,
      startTarget: metronome?.getConnectionPortTarget?.(connection.portId) || null,
      endTarget,
    };
  },

  resetMetronomeConnectionRuntime({ clearRelationships = true } = {}) {
    this.cancelAllMetronomeWireInteractions();
    for (const entry of this.metronomeConnectionRuntimeEntries?.values?.() || []) {
      this.releaseMetronomePulse(entry.connection);
    }
    if (clearRelationships) this.metronomeConnectionManager.clear("session-reset");
    for (const wireMesh of this.metronomeConnectionWires.values()) disposeWireMesh(wireMesh);
    this.metronomeConnectionWires.clear();
    this.metronomeConnectionRuntimeEntries?.clear();
    this.metronomePulseStates.clear();
  },
};
