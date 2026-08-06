import * as THREE from "three";
import { INSTRUMENT_MAX_SCALE, INSTRUMENT_MIN_SCALE, INSTRUMENT_SCALE_STEP } from "../../config/honk.js";
import { AssetRepository } from "../../scene/AssetRepository.js";
import { InstrumentFactory } from "../../instruments/core/InstrumentFactory.js";
import { InstrumentLifecycleService } from "../../instruments/core/InstrumentLifecycleService.js";
import { InstrumentRegistry } from "../../instruments/core/InstrumentRegistry.js";
import { InteractionTargetRegistry } from "../../instruments/core/InteractionTargetRegistry.js";
import { TransformTargetResolver } from "../../instruments/core/TransformTargetResolver.js";
import { ChordFormationService } from "../../instruments/formations/ChordFormationService.js";
import { FormationTransformResolver } from "../../instruments/formations/FormationTransformResolver.js";
import { HonkContactGraph } from "../../instruments/formations/HonkContactGraph.js";
import { HonkContactSystem } from "../../instruments/formations/HonkContactSystem.js";
import { HonkLockService } from "../../instruments/formations/HonkLockService.js";
import { getFormationRecipe } from "../../instruments/formations/formationRecipes.js";
import { HonkColliderFactory } from "../../instruments/honk/HonkColliderFactory.js";
import { HonkInstrument } from "../../instruments/honk/HonkInstrument.js";
import { METRONOME_SETTINGS } from "../../config/metronome.js";
import { LooperInstrument } from "../../instruments/looper/LooperInstrument.js";
import { MetronomeColliderFactory } from "../../instruments/metronome/MetronomeColliderFactory.js";
import { MetronomeConnectionManager } from "../../instruments/metronome/MetronomeConnectionManager.js";
import { MetronomeInstrument } from "../../instruments/metronome/MetronomeInstrument.js";
import { StickColliderFactory } from "../../instruments/stick/StickColliderFactory.js";
import { StickCollisionSystem, ThreeStickCollisionAdapter } from "../../instruments/stick/StickCollisionSystem.js";
import { StickEquipmentSystem } from "../../instruments/stick/StickEquipmentSystem.js";
import { StickHapticsAdapter } from "../../instruments/stick/StickHapticsAdapter.js";
import { StickInstrument } from "../../instruments/stick/StickInstrument.js";
import { PersistenceStore } from "../../persistence/PersistenceStore.js";
import { ScenePersistence } from "../../persistence/ScenePersistence.js";
import { SceneRestorer } from "../../persistence/SceneRestorer.js";
import { SceneSerializer } from "../../persistence/SceneSerializer.js";
import { FormationSpawner } from "../../spawning/FormationSpawner.js";
import { SpawnCatalog } from "../../spawning/SpawnCatalog.js";
import { SpawnMenuController } from "../../spawning/SpawnMenuController.js";
import { SpawnPlacementController } from "../../spawning/SpawnPlacementController.js";
import { SpawnPreview } from "../../spawning/SpawnPreview.js";
import { RadialSpawnMenu } from "../../ui/RadialSpawnMenu.js";
import { GripTransformSystem } from "../../xr/GripTransformSystem.js";
import { HapticsService } from "../../xr/HapticsService.js";
import { RaycastSystem } from "../../xr/RaycastSystem.js";
import { XRInputSourceManager } from "../../xr/XRInputSourceManager.js";
import { XRIntentMapper } from "../../xr/XRIntentMapper.js";
import { XRInteractionCoordinator } from "../../xr/XRInteractionCoordinator.js";
import { HonkPerformanceRuntimeMethods } from "./HonkPerformanceRuntime.js";
import { HonkPresentationRuntimeMethods } from "./HonkPresentationRuntime.js";
import { InstrumentAssetRuntimeMethods } from "./InstrumentAssetRuntime.js";
import { LifecycleRuntimeMethods } from "./LifecycleRuntime.js";
import { LooperConnectionRuntimeMethods } from "./LooperConnectionRuntime.js";
import { LooperTransportRuntimeMethods } from "./LooperTransportRuntime.js";
import { MetronomeConnectionRuntimeMethods } from "./MetronomeConnectionRuntime.js";
import { MetronomePulseRuntimeMethods } from "./MetronomePulseRuntime.js";
import { PendingSpawnSafeRuntimeMethods } from "./PendingSpawnSafeRuntime.js";
import { RelationshipRuntimeMethods } from "./RelationshipRuntime.js";
import { SessionRuntimeMethods } from "./SessionRuntime.js";
import { SpawnRuntimeMethods } from "./SpawnRuntime.js";
import { StickRuntimeMethods } from "./StickRuntime.js";
import { XRInteractionRuntimeMethods } from "./XRInteractionRuntime.js";

/**
 * Presentation/runtime bridge used by the composition root.
 *
 * It owns no second instrument collection: every object exposed to the
 * behavior-preserving presentation modules is the InstrumentEntity stored in
 * InstrumentRegistry. Domain services remain independently testable.
 */
export class RuntimeHost {
  constructor({ scene, camera, renderer, audioSystem, assetRepository = null, storage = globalThis.localStorage } = {}) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.audioSystem = audioSystem;

    this.assetRepository = assetRepository || new AssetRepository();

    this.instrumentRegistry = new InstrumentRegistry();
    this.runtimeInstrumentStates = [];
    this.honkRuntimeStates = [];
    this.looperRuntimeStates = [];
    this.metronomeRuntimeStates = [];
    this.looperRuntimeEntries = [];
    this.looperTimingFrameCache = new Map();
    this.metronomeTimingFrameCache = new Map();
    this.runtimeIndexRevision = 0;
    this.runtimeFrameSequence = 0;
    this.runtimePerformanceCounters = {
      frames: 0,
      runtimeIndexRebuilds: 0,
      looperEntryReads: 0,
    };
    this.runtimeProfilingEnabled = false;
    this.unsubscribeRuntimeIndexes = this.instrumentRegistry.subscribe(() => {
      this.rebuildRuntimeIndexes();
    });
    this.interactionTargetRegistry = new InteractionTargetRegistry();
    this.instrumentFactory = new InstrumentFactory({
      registry: this.instrumentRegistry,
      interactionTargetRegistry: this.interactionTargetRegistry,
    });
    this.metronomeConnectionWires = new Map();
    this.metronomeConnectionRuntimeEntries = new Map();
    this.metronomeConnectionsNeedValidation = false;
    this.lastMetronomeSafetyValidationMs = -Infinity;
    this.metronomePulseStates = new Map();
    this.metronomeConnectionManager = new MetronomeConnectionManager({
      registry: this.instrumentRegistry,
      onConnectionAdded: (connection) => this.handleMetronomeConnectionAdded(connection),
      onConnectionRemoved: (connection, reason) =>
        this.handleMetronomeConnectionRemoved(connection, reason),
    });

    this.honkContactGraph = new HonkContactGraph();
    this.honkContactSystem = new HonkContactSystem({
      graph: this.honkContactGraph,
      instrumentRegistry: this.instrumentRegistry,
    });
    this.chordFormationService = new ChordFormationService({ contactGraph: this.honkContactGraph });
    this.honkLockService = new HonkLockService({
      instrumentRegistry: this.instrumentRegistry,
      formationService: this.chordFormationService,
    });
    this.formationTransformResolver = new FormationTransformResolver({ lockService: this.honkLockService });
    this.transformTargetResolver = new TransformTargetResolver({
      instrumentRegistry: this.instrumentRegistry,
      formationTransformResolver: this.formationTransformResolver,
      profileResolver: (_target, source) => this.getTransformProfile(source),
    });

    this.honkColliderFactory = new HonkColliderFactory({ THREE });
    this.metronomeColliderFactory = new MetronomeColliderFactory({ THREE });
    this.stickColliderFactory = new StickColliderFactory({ THREE });
    this.stickEquipmentSystem = new StickEquipmentSystem({
      controllerResolver: (controllerId) => this.controllers.find(
        (controller) => controller.userData.controllerId === controllerId,
      ),
    });
    this.stickCollisionAdapter = new ThreeStickCollisionAdapter({ THREE });
    this.stickCollisionSystem = new StickCollisionSystem({
      getSticks: () => this.instrumentRegistry.getByKind("stick"),
      getTargets: () => this.instrumentStates,
      collisionTester: (context) => this.stickCollisionAdapter.intersects(context),
    });
    this.instrumentLifecycle = new InstrumentLifecycleService({
      instrumentRegistry: this.instrumentRegistry,
      contactSystem: this.honkContactSystem,
      lockService: this.honkLockService,
      stickEquipmentSystem: this.stickEquipmentSystem,
      releaseInstrumentAudio: (instrument) => {
        instrument.releaseAllAudioVoices?.();
      },
      sessionResetters: [() => this.resetMetronomeConnectionRuntime({ clearRelationships: true })],
    });

    this.spawnCatalog = new SpawnCatalog();
    this.radialSpawnMenu = new RadialSpawnMenu(this.spawnCatalog.getRadialEntries());
    this.spawnMenuController = new SpawnMenuController({
      view: this.radialSpawnMenu,
      catalog: this.spawnCatalog,
    });
    this.formationSpawner = new FormationSpawner({
      recipes: { get: getFormationRecipe },
      spawnHonk: ({ tuning, name }) => {
        this.createSpawnedComponent("honk", { tuning, name });
        return this.activeInstrumentState;
      },
    });
    this.spawnPlacementController = new SpawnPlacementController({
      scene: this.scene,
      createEntry: (entry) => this.createPendingSpawnComponents(entry?.id)?.instruments || [],
      previewFactory: (options) => new SpawnPreview(options),
    });

    this.instrumentTemplate = null;
    this.componentTemplates = new Map();
    this.stickTemplate = null;
    this.stickMaterialTextures = null;
    this.instrumentMaterialTextures = null;
    this.looperMaterialTextures = null;
    this.looperMaterialTexturePromise = null;
    this.noteFont = null;
    this.noteFontLoadPromise = null;
    this.activeInstrumentState = null;
    this.pendingSpawnPlacement = null;
    this.xrSessionActive = false;
    this.currentVowelIndex = -1;
    this.currentVowelLetter = "neutral";
    this.instructionPanelView = null;
    this.instructionPanel = null;
    this.closeButton = null;
    this.panelVisible = false;
    this.instructionPanelClosed = false;
    this.pendingPanelPlacementFrames = 0;

    this.configureInstrumentFactory();
    this.configureXR();
    this.configurePersistence(storage);
    this.configureStickEvents();
    this.configureRelationshipEvents();
  }

  get instrumentStates() {
    return this.runtimeInstrumentStates;
  }

  rebuildRuntimeIndexes() {
    this.runtimeInstrumentStates.length = 0;
    this.honkRuntimeStates.length = 0;
    this.looperRuntimeStates.length = 0;
    this.metronomeRuntimeStates.length = 0;
    this.looperRuntimeEntries.length = 0;
    this.looperTimingFrameCache.clear();
    this.metronomeTimingFrameCache.clear();
    for (const instrument of this.instrumentRegistry.values()) {
      if (
        instrument.kind !== "honk" &&
        instrument.kind !== "looper" &&
        instrument.kind !== "metronome"
      ) continue;
      this.runtimeInstrumentStates.push(instrument);
      if (instrument.kind === "honk") {
        this.honkRuntimeStates.push(instrument);
      } else if (instrument.kind === "looper") {
        this.looperRuntimeStates.push(instrument);
        if (instrument.looperController && instrument.looperData) {
          this.looperRuntimeEntries.push({
            looperState: instrument,
            controller: instrument.looperController,
          });
        }
      } else {
        this.metronomeRuntimeStates.push(instrument);
      }
    }
    this.runtimeIndexRevision += 1;
    if (this.runtimeProfilingEnabled) this.runtimePerformanceCounters.runtimeIndexRebuilds += 1;
  }

  beginRuntimeFrame() {
    this.runtimeFrameSequence += 1;
    if (this.runtimeProfilingEnabled) this.runtimePerformanceCounters.frames += 1;
    return this.runtimeIndexRevision;
  }

  getRuntimePerformanceCounters() {
    return { ...this.runtimePerformanceCounters, runtimeIndexRevision: this.runtimeIndexRevision };
  }

  setRuntimeProfilingEnabled(enabled = true) {
    this.runtimeProfilingEnabled = Boolean(enabled);
    this.runtimePerformanceCounters.frames = 0;
    this.runtimePerformanceCounters.runtimeIndexRebuilds = 0;
    this.runtimePerformanceCounters.looperEntryReads = 0;
    return this.runtimeProfilingEnabled;
  }

  getCachedLooperTiming(looperId, now) {
    let entry = this.looperTimingFrameCache.get(looperId);
    if (!entry) {
      entry = { frame: -1, timing: {} };
      this.looperTimingFrameCache.set(looperId, entry);
    }
    if (entry.frame !== this.runtimeFrameSequence) {
      this.metronomeConnectionManager.getTimingForLooper(looperId, now, entry.timing);
      entry.frame = this.runtimeFrameSequence;
    }
    return entry.timing;
  }

  getCachedMetronomeTiming(metronomeId, now) {
    let entry = this.metronomeTimingFrameCache.get(metronomeId);
    if (!entry) {
      entry = { frame: -1, timing: {} };
      this.metronomeTimingFrameCache.set(metronomeId, entry);
    }
    if (entry.frame !== this.runtimeFrameSequence) {
      this.instrumentRegistry.get(metronomeId)?.getBeatTiming?.(now, entry.timing);
      entry.frame = this.runtimeFrameSequence;
    }
    return entry.timing;
  }

  get controllers() {
    return this.inputSourceManager?.controllers || [];
  }

  get controllerStates() {
    return this.interactionCoordinator?.controllerStates || new Map();
  }

  configureInstrumentFactory() {
    this.instrumentFactory
      .register("honk", (options) => new HonkInstrument({
        ...options,
        voiceService: this.audioSystem,
      }))
      .register("looper", (options) => new LooperInstrument({
        ...options,
        instrumentRegistry: this.instrumentRegistry,
        looperAdapter: this.createLooperAdapter(),
      }))
      .register("stick", (options) => new StickInstrument(options))
      .register("metronome", (options) => new MetronomeInstrument({
        ...options,
        audioSystem: this.audioSystem,
        onTransportChange: ({ metronome, playing }) => {
          if (playing) return;
          this.releaseMetronomePulsesForMetronome(metronome.id);
        },
      }));
  }

  configureXR() {
    this.intentMapper = new XRIntentMapper();
    this.interactionCoordinator = new XRInteractionCoordinator({
      intentMapper: this.intentMapper,
      handlers: {
        onSpawnMenuOpen: (controller, gripPressed) => this.handleSpawnMenuOpenIntent(controller, gripPressed),
        onSpawnMenuConfirm: (controller) => this.handleSpawnMenuConfirmIntent(controller),
        onContextSecondary: (controller) => this.handleContextSecondaryIntent(controller),
        onInstrumentDelete: (controller) => this.handleInstrumentDeleteIntent(controller),
        onTriggerBegin: (controller) => this.handleTriggerBeginIntent(controller),
        onTriggerEnd: (controller) => this.handleTriggerEndIntent(controller),
        onSpawnMenuCancel: (controller) => this.cancelRadialMenu(controller),
        onGripBegin: (controller) => this.handleGripBeginIntent(controller),
        onGripEnd: (controller) => this.handleGripEndIntent(controller),
        onScaleStep: (controller, direction) => this.handleScaleStepIntent(controller, direction),
      },
    });
    this.inputSourceManager = new XRInputSourceManager({
      renderer: this.renderer,
      scene: this.scene,
      createRayLine: () => this.createRayLine(),
      createRadialMenu: () => this.createRadialMenu(),
      onInput: (event) => this.interactionCoordinator.enqueueInput(event),
    });
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 1.6;
    this.raycastSystem = new RaycastSystem({
      raycaster: this.raycaster,
      getInstruments: () => this.instrumentStates,
      getCloseButton: () => this.closeButton,
      isPanelVisible: () => this.panelVisible,
      resolveOwner: (object) => this.instrumentRegistry.getFromObject3D(object),
      getTargets: (instrument) => instrument.hitTargetList || [],
      isLooperTarget: (target) => this.isLooperColliderTarget(target),
      canLock: (instrument) => this.isLockableInstrumentState(instrument),
    });
    this.gripTransformSystem = new GripTransformSystem({
      controllers: this.inputSourceManager.controllers,
      controllerStates: this.interactionCoordinator.controllerStates,
      resolveOwner: (object) => this.instrumentRegistry.getFromObject3D(object),
      getPointedTarget: (controller) => this.getPointedInstrumentState(controller),
      transformTargetResolver: this.transformTargetResolver,
    });
    this.hapticsService = new HapticsService({
      gamepadResolver: (controller) => this.getControllerGamepad(controller),
    });
    this.stickHaptics = new StickHapticsAdapter({
      gamepadResolver: (controllerId) => this.getControllerGamepad(
        this.controllers.find((controller) => controller.userData.controllerId === controllerId),
      ),
    });
  }

  configurePersistence(storage) {
    this.persistenceStore = new PersistenceStore({ storage });
    this.sceneSerializer = new SceneSerializer({
      registry: this.instrumentRegistry,
      lockService: this.honkLockService,
      metronomeConnectionManager: this.metronomeConnectionManager,
      getEquipment: () => this.stickEquipmentSystem.getEquipmentPreference(),
    });
    this.sceneRestorer = new SceneRestorer({
      registry: this.instrumentRegistry,
      lockService: this.honkLockService,
      metronomeConnectionManager: this.metronomeConnectionManager,
      createInstrument: async (saved) => {
        const componentId = saved.kind === "looper" || saved.kind === "metronome"
          ? saved.kind
          : saved.componentId || "honk";
        const baseScale = getSerializedUniformScale(saved.transform?.scale);
        this.createSpawnedComponent(componentId, {
          id: saved.id,
          tuning: saved.tuning,
          bpm: saved.bpm,
          volume: saved.volume,
          ...(baseScale === null ? {} : { baseScale }),
        });
        return this.activeInstrumentState;
      },
      onEquipment: (equipment) => this.stickEquipmentSystem.restoreEquipmentPreference(equipment),
      onInstrumentRestored: (instrument, saved) => {
        if (instrument.kind === "looper") this.updateLockVisual(instrument);
        if (instrument.kind === "honk") {
          const resolved = instrument.getResolvedPerformanceState?.();
          if (resolved) this.applyResolvedHonkMorphState(instrument, resolved);
          this.syncMorphColliderTravel(instrument);
          this.updateBendAlignedColliders(instrument);
        }
        const baseScale = getSerializedUniformScale(saved.transform?.scale);
        if (baseScale !== null) {
          instrument.baseScale = baseScale;
          this.applyInstrumentVisualScale(instrument, 1);
        }
        this.syncLooperTransformReference(instrument);
      },
    });
    this.scenePersistence = new ScenePersistence({
      store: this.persistenceStore,
      serializer: this.sceneSerializer,
      restorer: this.sceneRestorer,
    });
  }

  configureStickEvents() {
    this.stickCollisionSystem.subscribe((event, context) => {
      this.stickHaptics.handleStrike(event)?.catch?.((error) => console.warn("Stick haptics failed:", error));
      this.playStickPercussion(event.percussionType, { volume: 1 });
      const target = context.target;
      if (target?.kind === "looper") {
        target.recordSelfDrumHit(event.percussionType, event.timestamp);
        return;
      }
      for (const looper of this.instrumentRegistry.getByKind("looper")) {
        const track = looper.tracks.find(({ connectedHonkId }) => connectedHonkId === target?.id);
        if (track) looper.recordTrackDrumHit(track.trackId, event.percussionType, event.timestamp);
      }
    });
  }

  configureRelationshipEvents() {
    this.honkLockService.subscribe((event) => {
      if (event.type === "honk-lock.created") this.applyLockGroupVisualState(event.group, true);
      if (event.type === "honk-lock.removed") this.applyLockGroupVisualState(event.group, false);
    });
    this.instrumentLifecycle.subscribe((event) => {
      if (event.type === "instrument.deleting") {
        this.metronomeConnectionManager.disconnectInstrument(event.instrumentId, "endpoint-deleting");
      }
    });
  }

  createLooperAdapter() {
    return {
      ensureAudio: () => this.audioSystem.ensureAudio(),
      resolveHonk: (honkId) => this.instrumentRegistry.get(honkId),
      isPlayableHonkId: (honkId) => this.instrumentRegistry.get(honkId)?.isPlayable?.() || false,
      captureActionByHonkId: (honkId) => this.captureLooperActionFromHonk(this.instrumentRegistry.get(honkId)),
      getPlaybackTargetIds: (track, honkId) =>
        this.getCachedLooperPlaybackTargetIds(track, honkId),
      getAutomationLayerId: (looper, track) => this.getLooperAutomationLayerId(looper, track),
      setAutomationLayerByHonkId: (honkId, layerId, snapshot, gain) =>
        this.instrumentRegistry.get(honkId)?.setAutomationLayer(layerId, snapshot, gain),
      clearAutomationLayerByHonkId: (honkId, layerId) =>
        this.instrumentRegistry.get(honkId)?.clearAutomationLayer(layerId),
      requestAudioRetriggerByHonkId: (honkId) =>
        this.instrumentRegistry.get(honkId)?.requestAudioRetrigger?.(),
      playStickPercussion: (type, options) => this.playStickPercussion(type, options),
      getTimingForLooper: (looperId, now) =>
        this.getCachedLooperTiming(looperId, now),
      updateWireForTrack: (looper, track) => this.updateLooperWireForTrack(looper, track),
      onTrackConnectionChanged: (looper, track) =>
        this.cacheLooperTrackConnectionTargets(looper, track),
      disposeWireMesh: (wire) => this.disposeWireMesh(wire),
      updateVisuals: (looper) => this.updateLooperVisuals(looper),
    };
  }

  getTransformProfile(instrument) {
    if (instrument?.kind === "looper") {
      return { minScale: 0.5, maxScale: 6, scaleStep: 0.25 };
    }
    if (instrument?.kind === "metronome") {
      return {
        minScale: METRONOME_SETTINGS.minScale,
        maxScale: METRONOME_SETTINGS.maxScale,
        scaleStep: METRONOME_SETTINGS.scaleStep,
      };
    }
    return {
      minScale: INSTRUMENT_MIN_SCALE,
      maxScale: INSTRUMENT_MAX_SCALE,
      scaleStep: INSTRUMENT_SCALE_STEP,
    };
  }

  setupControllers() {
    if (this.inputSourceManager.controllers.length > 0) return;
    this.inputSourceManager.setup((controller) => this.interactionCoordinator.registerController(controller));
  }

  async initialize() {
    this.setupControllers();
    this.createInstructionPanel();
    await this.loadInstrument();
    await this.loadStick();
    await this.loadNoteFont();
    await this.restorePersistedScene();
    this.onRuntimeInitialized();
    return this;
  }

  savePersistedSceneOnXRExit() {
    return this.scenePersistence.save();
  }

  async restorePersistedScene() {
    return this.scenePersistence.restore();
  }

  resetSubsystemsAfterSession() {
    for (const controller of this.controllers) {
      const state = this.controllerStates.get(controller);
      if (!state) continue;
      if (state.hoveredTarget) this.setTargetHighlight(state.hoveredTarget, false);
      this.releaseRaySqueeze(state);
      this.closeRadialMenu(controller);
    }
    for (const looper of this.instrumentRegistry.getByKind("looper")) looper.stop();
    this.resetMetronomeConnectionRuntime({ clearRelationships: true });
    for (const honk of this.instrumentRegistry.getByKind("honk")) {
      honk.hornHolders?.clear();
      honk.activeBends?.clear();
      honk.targetBendValue = 0;
      honk.resetLivePerformance();
      honk.releaseAllAudioVoices();
    }
    for (const metronome of this.instrumentRegistry.getByKind("metronome")) metronome.pause();
    this.gripTransformSystem.reset();
    this.stickEquipmentSystem.reset();
    this.inputSourceManager.resetSession();
    this.interactionCoordinator.resetSession();
    this.stickHaptics.reset();
    this.hapticsService.reset?.();
    this.audioSystem.releaseAll();
  }

  dispose() {
    this.resetSubsystemsAfterSession();
    this.honkContactSystem.reset();
    this.honkLockService.dispose();
    this.metronomeConnectionManager.dispose();
    this.instrumentLifecycle.dispose();
    this.instrumentRegistry.clear();
    this.unsubscribeRuntimeIndexes?.();
    this.unsubscribeRuntimeIndexes = null;
    this.interactionTargetRegistry.clear();
    this.assetRepository.clear();
    this.audioSystem.dispose?.();
  }
}

Object.assign(
  RuntimeHost.prototype,
  InstrumentAssetRuntimeMethods,
  SessionRuntimeMethods,
  SpawnRuntimeMethods,
  LifecycleRuntimeMethods,
  XRInteractionRuntimeMethods,
  StickRuntimeMethods,
  LooperTransportRuntimeMethods,
  MetronomeConnectionRuntimeMethods,
  MetronomePulseRuntimeMethods,
  PendingSpawnSafeRuntimeMethods,
  LooperConnectionRuntimeMethods,
  HonkPerformanceRuntimeMethods,
  HonkPresentationRuntimeMethods,
  RelationshipRuntimeMethods,
);

function getSerializedUniformScale(scale) {
  if (!Array.isArray(scale) || scale.length !== 3 || !scale.every(Number.isFinite)) {
    return null;
  }
  return (Math.abs(scale[0]) + Math.abs(scale[1]) + Math.abs(scale[2])) / 3;
}
