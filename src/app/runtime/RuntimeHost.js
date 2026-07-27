import * as THREE from "three";
import { LOOPER_ACTION_RELEASE_FADE_SECONDS } from "../../config/audio.js";
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
    this.interactionTargetRegistry = new InteractionTargetRegistry();
    this.instrumentFactory = new InstrumentFactory({
      registry: this.instrumentRegistry,
      interactionTargetRegistry: this.interactionTargetRegistry,
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
    return [...this.instrumentRegistry.values()].filter(
      ({ kind }) => kind === "honk" || kind === "looper" || kind === "metronome",
    );
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
      getEquipment: () => this.stickEquipmentSystem.getEquipmentPreference(),
    });
    this.sceneRestorer = new SceneRestorer({
      registry: this.instrumentRegistry,
      lockService: this.honkLockService,
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
  }

  createLooperAdapter() {
    return {
      ensureAudio: () => this.audioSystem.ensureAudio(),
      resolveHonk: (honkId) => this.instrumentRegistry.get(honkId),
      isPlayableHonkId: (honkId) => this.instrumentRegistry.get(honkId)?.isPlayable?.() || false,
      captureActionByHonkId: (honkId) => this.captureLooperActionFromHonk(this.instrumentRegistry.get(honkId)),
      getPlaybackTargetIds: (_track, honkId) => {
        const component = this.honkContactGraph.getConnectedComponent(honkId);
        return component.size > 0 ? [...component] : [honkId];
      },
      getAutomationLayerId: (looper, track) => this.getLooperAutomationLayerId(looper, track),
      getActionVoiceIdForHonkId: (looper, track, honkId) =>
        `${this.getLooperAutomationLayerId(looper, track)}:instrument-${honkId}:action`,
      setAutomationLayerByHonkId: (honkId, layerId, snapshot) =>
        this.instrumentRegistry.get(honkId)?.setAutomationLayer(layerId, snapshot),
      clearAutomationLayerByHonkId: (honkId, layerId) =>
        this.instrumentRegistry.get(honkId)?.clearAutomationLayer(layerId),
      startActionVoice: (voiceId, honkId) =>
        this.instrumentRegistry.get(honkId)?.startAudioVoice(voiceId),
      releaseActionVoice: (voiceId, honkId) => {
        const honk = this.instrumentRegistry.get(honkId);
        if (honk?.activeVoiceIds?.has(voiceId)) {
          honk.releaseAudioVoice(voiceId, { fadeSeconds: LOOPER_ACTION_RELEASE_FADE_SECONDS });
        }
        else this.releaseHonkVoice(voiceId);
      },
      updateActionVoiceByHonkId: (voiceId, honkId, snapshot, volume) =>
        this.updateLooperActionVoice(voiceId, this.instrumentRegistry.get(honkId), snapshot, volume),
      playStickPercussion: (type, options) => this.playStickPercussion(type, options),
      getMetronomeTiming: (now) => {
        const metronomes = this.instrumentRegistry.getByKind("metronome").filter(
          (metronome) => !metronome.disposed && metronome.root?.visible,
        );
        return metronomes.length === 1 ? metronomes[0].getBeatTiming(now) : null;
      },
      updateWireForTrack: (looper, track) => this.updateLooperWireForTrack(looper, track),
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
    this.instrumentLifecycle.dispose();
    this.instrumentRegistry.clear();
    this.interactionTargetRegistry.clear();
    this.assetRepository.clear();
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
