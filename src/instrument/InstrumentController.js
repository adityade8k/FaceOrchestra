import * as THREE from "three";
import { FontLoader } from "three/addons/loaders/FontLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { TextGeometry } from "three/addons/geometries/TextGeometry.js";
import { clone as cloneSkeletonAware } from "three/addons/utils/SkeletonUtils.js";
import {
  BEND_COLLIDER_ROTATION_DEGREES,
  BEND_ALIGNED_COLLIDER_GROUP_NAME,
  BEND_SENSITIVITY,
  BEND_SMOOTHING,
  DEBUG_LOG_MORPHS,
  DEBUG_LOG_RAYCAST,
  DEBUG_SHOW_BOUNDING_BOXES,
  DEBUG_SHOW_COLLIDERS,
  DEBUG_SHOW_RAYS,
  DEFAULT_INSTRUMENT_DISTANCE,
  EAR_DRAG_SENSITIVITY,
  INSTRUMENT_BASE_SCALE,
  INSTRUMENT_MAX_SCALE,
  INSTRUMENT_MIN_SCALE,
  INSTRUMENT_TEXTURE_PATHS,
  HONK_CONNECTION_TARGET_NAME,
  LEGACY_LOOPER_COMPONENT_ID,
  LOOPER_BUTTON_MORPH_TARGETS,
  LOOPER_BUTTON_ACTIONS,
  LOOPER_COLLIDER_OPACITY,
  LOOPER_CONTROL_MORPH_TARGETS,
  LOOPER_COMPONENT_ID,
  LOOPER_DEBUG_COLORS,
  LOOPER_MIN_CLIP_DURATION_MS,
  LOOPER_MORPH_SETTINGS,
  LOOPER_MORPH_TARGET_NAMES,
  LOOPER_PAD_COUNT,
  LOOPER_TEXTURE_PATHS,
  LOOPER_WIRE_COLORS,
  LOOPER_WIRE_RADIUS,
  LOOPER_WIRE_SEGMENTS,
  INTERACTION_TARGET_NAMES,
  MAX_PITCH_BEND_SEMITONES,
  MODEL_PATH,
  MORPH_TARGET_NAMES,
  NOTE_LABEL_SETTINGS,
  NOSE_DRAG_SENSITIVITY,
  SHOW_INSTRUCTION_PANEL,
  SPATIAL_AUDIO_SETTINGS,
  SPAWN_COMPONENT_OPTIONS,
  SPAWN_DISTANCE,
  SPAWN_Y_OFFSET,
  RECORDER_CHANNEL_COUNT,
  RECORDER_COMPONENT_ID,
  RECORDER_MIN_EVENT_DURATION_MS,
  SQUEEZE_COLLIDER_MIN_OVERLAP,
  SQUEEZE_SENSITIVITY,
} from "../config.js";
import { LooperAudioEngine } from "../audio/LooperAudioEngine.js";
import { DebugVisuals } from "../debug/DebugVisuals.js";
import { XRControllerManager } from "../input/XRControllerManager.js";
import { GripTransformSystem } from "../interaction/GripTransformSystem.js";
import { RaycastInteractionSystem } from "../interaction/RaycastInteractionSystem.js";
import {
  createBodyGripTarget as createBodyGripTargetObject,
  createHonkConnectionTarget as createHonkConnectionTargetObject,
  createLooperColliders as createLooperColliderTargets,
  createMorphTargetSpheres as createMorphTargetSphereColliders,
  createRecorderColliders as createRecorderColliderTargets,
} from "../instruments/colliderBuilders.js";
import { createInstrumentObject } from "../instruments/instrumentFactory.js";
import {
  getLooperButtonName,
  getLooperControlName,
  getLooperNodeName,
  getLooperPadName,
  getRecorderButtonName,
  getRecorderControlName,
  getRecorderNodeName,
} from "../instruments/looperNames.js";
import { InstructionPanel } from "../ui/InstructionPanel.js";
import { RadialSpawnMenu } from "../ui/RadialSpawnMenu.js";
import {
  applyStandardInstrumentMaterials,
  loadMaterialTextureSet,
} from "../utils/materialUtils.js";
import { findMorphMesh } from "../utils/morphUtils.js";
import {
  createWireMaterial,
  disposeWireMesh as disposeWireMeshUtility,
  updateWireMeshGeometry as updateWireMeshGeometryUtility,
} from "../utils/wireUtils.js";
import { MorphTargetController } from "./MorphTargetController.js";

export { applyStandardInstrumentMaterials } from "../utils/materialUtils.js";
export { findMorphMesh } from "../utils/morphUtils.js";

export const DEBUG_SHOW_HIT_TARGETS = DEBUG_SHOW_COLLIDERS;
export const DEBUG_RAYCAST = DEBUG_LOG_RAYCAST;

export const MORPH_TARGETS = {
  nose: MORPH_TARGET_NAMES.nose,
  mouthO: MORPH_TARGET_NAMES.vowels.O,
  mouthE: MORPH_TARGET_NAMES.vowels.E,
  earRight: MORPH_TARGET_NAMES.ears.rightUp,
  earLeft: MORPH_TARGET_NAMES.ears.leftUp,
  hornSqueeze: MORPH_TARGET_NAMES.squeeze,
  mouthI: MORPH_TARGET_NAMES.vowels.I,
  mouthA: MORPH_TARGET_NAMES.vowels.A,
  mouthU: MORPH_TARGET_NAMES.vowels.U,
  bendRight: MORPH_TARGET_NAMES.bendRight,
  bendLeft: MORPH_TARGET_NAMES.bendLeft,
};

export const INTERACTION_MAP = {
  [INTERACTION_TARGET_NAMES.mouth]: {
    type: "clickCycleVowel",
    morphs: [
      MORPH_TARGET_NAMES.vowels.A,
      MORPH_TARGET_NAMES.vowels.E,
      MORPH_TARGET_NAMES.vowels.I,
      MORPH_TARGET_NAMES.vowels.O,
      MORPH_TARGET_NAMES.vowels.U,
    ],
  },
  [INTERACTION_TARGET_NAMES.horn]: {
    type: "holdSqueeze",
    morph: MORPH_TARGET_NAMES.squeeze,
  },
  [INTERACTION_TARGET_NAMES.nose]: {
    type: "verticalDragMorph",
    morph: MORPH_TARGET_NAMES.nose,
    dragType: "nose",
  },
  [INTERACTION_TARGET_NAMES.leftEar]: {
    type: "verticalDragMorph",
    dragType: "ear",
    side: "left",
  },
  [INTERACTION_TARGET_NAMES.rightEar]: {
    type: "verticalDragMorph",
    dragType: "ear",
    side: "right",
  },
  [INTERACTION_TARGET_NAMES.body]: {
    type: "gripTransform",
  },
};

const EXPECTED_HIT_TARGETS = Object.keys(INTERACTION_MAP);
const VOWEL_MORPHS = INTERACTION_MAP.HIT_mouth.morphs;
const VOWEL_LETTERS_BY_MORPH = {
  [MORPH_TARGET_NAMES.vowels.A]: "A",
  [MORPH_TARGET_NAMES.vowels.E]: "E",
  [MORPH_TARGET_NAMES.vowels.I]: "I",
  [MORPH_TARGET_NAMES.vowels.O]: "O",
  [MORPH_TARGET_NAMES.vowels.U]: "U",
};

const HIT_MARKER_OPACITY = DEBUG_SHOW_COLLIDERS ? 0.24 : 0;
const RAY_COLOR_DEFAULT = 0xf6d878;
const RAY_COLOR_SPHERE_HOVER = 0x45f6ff;
const C_MAJOR_SCALE_PRESET = [
  { label: "C", semitonesFromF: -5 },
  { label: "D", semitonesFromF: -3 },
  { label: "E", semitonesFromF: -1 },
  { label: "F", semitonesFromF: 0 },
  { label: "G", semitonesFromF: 2 },
  { label: "A", semitonesFromF: 4 },
  { label: "B", semitonesFromF: 6 },
  { label: "C", semitonesFromF: 7 },
];
const F_NATURAL_MINOR_SCALE_PRESET = [
  { label: "F", semitonesFromF: 0 },
  { label: "G", semitonesFromF: 2 },
  { label: "Ab", semitonesFromF: 3 },
  { label: "Bb", semitonesFromF: 5 },
  { label: "C", semitonesFromF: 7 },
  { label: "Db", semitonesFromF: -4, octaveOffset: 1 },
  { label: "Eb", semitonesFromF: -2, octaveOffset: 1 },
  { label: "F", semitonesFromF: 0, octaveOffset: 1 },
];
const F_NATURAL_MINOR_SNAP_STEPS_FROM_F = [-5, -4, -2, 0, 2, 3, 5, 7];
const SCALE_PRESET_SPACING = 0.32;
const CHROMATIC_NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const F4_MIDI_NOTE = 65;
const PITCH_SNAP_STEPS = {
  cMajor: C_MAJOR_SCALE_PRESET.map((note) => note.semitonesFromF),
  fNaturalMinor: F_NATURAL_MINOR_SNAP_STEPS_FROM_F,
};
const tempVector = new THREE.Vector3();
const tempQuaternion = new THREE.Quaternion();
const tempBendQuaternion = new THREE.Quaternion();
const tempBendEuler = new THREE.Euler();
const tempScale = new THREE.Vector3();
const tempSpawnForward = new THREE.Vector3();
const tempSpawnRight = new THREE.Vector3();
const tempSpawnTarget = new THREE.Vector3();
const tempBox = new THREE.Box3();
const tempBoxA = new THREE.Box3();
const tempBoxB = new THREE.Box3();
const tempBoxSize = new THREE.Vector3();
const tempAudioPosition = new THREE.Vector3();
const tempAudioForward = new THREE.Vector3();
const tempAudioUp = new THREE.Vector3();
const tempLooperPreviousPosition = new THREE.Vector3();
const tempLooperCurrentPosition = new THREE.Vector3();
const tempLooperDeltaQuaternion = new THREE.Quaternion();
const tempLooperCurrentQuaternion = new THREE.Quaternion();
const tempLooperPreviousQuaternion = new THREE.Quaternion();
const tempWireStart = new THREE.Vector3();
const tempWireEnd = new THREE.Vector3();
const tempControlDragPosition = new THREE.Vector3();

export function collectHitTargets(root) {
  const hitTargets = {};

  root.traverse((object) => {
    if (!object.name || !object.name.startsWith("HIT_")) {
      return;
    }

    hitTargets[object.name] = object;
    object.userData.isHitTarget = true;
    object.userData.baseHitOpacity =
      typeof object.userData.baseHitOpacity === "number" ? object.userData.baseHitOpacity : HIT_MARKER_OPACITY;

    if (object.isMesh) {
      if (!object.userData.isProceduralMorphTarget) {
        object.material = makeHitTargetMaterial(
          object.name,
          getHitTargetColor(object),
          object.userData.baseHitOpacity,
        );
      }
      object.material.opacity = object.userData.baseHitOpacity;
      object.material.transparent = true;
      object.material.depthWrite = false;
      object.renderOrder = object.userData.isProceduralMorphTarget ? 20 : 10;
    }
  });

  return hitTargets;
}

function collectGripRaycastTargets(root) {
  const targets = [];
  root.traverse((object) => {
    if (object.isMesh && !object.userData.isHitTarget) {
      targets.push(object);
    }
  });
  return targets;
}

function makeHitTargetMaterial(name, color = null, opacity = HIT_MARKER_OPACITY) {
  const material = new THREE.MeshBasicMaterial({
    color: color ?? getHitTargetColor(name),
    transparent: true,
    opacity,
    depthWrite: false,
    wireframe: DEBUG_SHOW_COLLIDERS,
  });
  material.userData.disposeOnInstrumentDelete = true;
  return material;
}

function getHitTargetColor(targetOrName) {
  const target = typeof targetOrName === "string" ? null : targetOrName;
  const name = typeof targetOrName === "string" ? targetOrName : targetOrName?.name;

  if (typeof target?.userData?.currentHitColor === "number") {
    return target.userData.currentHitColor;
  }
  if (typeof target?.userData?.hitColor === "number") {
    return target.userData.hitColor;
  }
  if (name === HONK_CONNECTION_TARGET_NAME) {
    return LOOPER_DEBUG_COLORS.honkConnection;
  }
  if (name?.startsWith("HIT_looper_pad_")) {
    return LOOPER_DEBUG_COLORS.padEmpty;
  }
  if (name?.startsWith("HIT_looper_node_")) {
    return LOOPER_DEBUG_COLORS.nodeOpen;
  }
  if (name?.startsWith("HIT_recorder_node_")) {
    return LOOPER_DEBUG_COLORS.recorderNodeOpen;
  }

  return {
    HIT_mouth: 0xf0a23c,
    HIT_horn: 0xf7d04a,
    HIT_nose: 0x5ac8fa,
    HIT_leftEar: 0x72d572,
    HIT_rightEar: 0x9e8cff,
    HIT_body: 0xffffff,
    [getLooperButtonName("play")]: LOOPER_DEBUG_COLORS.button.play,
    [getLooperButtonName("pause")]: LOOPER_DEBUG_COLORS.button.pause,
    [getLooperButtonName("record")]: LOOPER_DEBUG_COLORS.button.record,
    [getLooperButtonName("stop")]: LOOPER_DEBUG_COLORS.button.stop,
    [getLooperControlName("volume")]: LOOPER_DEBUG_COLORS.controlVolume,
    [getLooperControlName("speed")]: LOOPER_DEBUG_COLORS.controlSpeed,
    [getRecorderButtonName("play")]: LOOPER_DEBUG_COLORS.button.play,
    [getRecorderButtonName("pause")]: LOOPER_DEBUG_COLORS.button.pause,
    [getRecorderButtonName("record")]: LOOPER_DEBUG_COLORS.button.record,
    [getRecorderButtonName("stop")]: LOOPER_DEBUG_COLORS.button.stop,
    [getRecorderControlName("volume")]: LOOPER_DEBUG_COLORS.controlVolume,
    [getRecorderControlName("speed")]: LOOPER_DEBUG_COLORS.controlSpeed,
    [getRecorderControlName("gap")]: LOOPER_DEBUG_COLORS.controlGap,
  }[name] || 0xffffff;
}

export class InstrumentController {
  constructor({ scene, camera, renderer, synth }) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.synth = synth;
    this.loader = new GLTFLoader();
    this.fontLoader = new FontLoader();
    this.textureLoader = new THREE.TextureLoader();
    this.raycaster = new THREE.Raycaster();
    this.raycastTargets = [];
    this.raycastIntersections = [];
    this.lockedBoxIntersections = [];
    this.raycastSystem = new RaycastInteractionSystem({
      raycaster: this.raycaster,
      targets: this.raycastTargets,
      intersections: this.raycastIntersections,
      lockedIntersections: this.lockedBoxIntersections,
      getInstrumentStates: () => this.instrumentStates,
      getCloseButton: () => this.closeButton,
      isPanelVisible: () => this.panelVisible,
      isSequencerColliderTarget: (target) => this.isSequencerColliderTarget(target),
      debugRaycast: DEBUG_RAYCAST,
    });
    this.radialSpawnMenu = new RadialSpawnMenu();
    this.instructionPanelView = null;

    this.instrumentTemplate = null;
    this.componentTemplates = new Map();
    this.instrumentMaterialTextures = null;
    this.looperMaterialTextures = null;
    this.looperMaterialTexturePromise = null;
    this.noteFont = null;
    this.noteFontLoadPromise = null;
    this.nextInstrumentId = 1;
    this.instrumentStates = [];
    this.activeInstrumentState = null;

    this.controllers = [];
    this.controllerStates = new Map();
    this.gripTransformSystem = null;
    this.controllerManager = new XRControllerManager({
      renderer: this.renderer,
      scene: this.scene,
      createRayLine: () => this.createRayLine(),
      createRadialMenu: () => this.createRadialMenu(),
      handlers: {
        onAPress: (controller, gripPressed) => this.handleAPress(controller, gripPressed),
        onARelease: (controller) => this.handleARelease(controller),
        onBPress: (controller) => this.handleBPress(controller),
        onDeletePress: (controller) => this.handleDeletePress(controller),
        onDisconnectPress: (controller) => this.handleDisconnectPress(controller),
        onTriggerPress: (controller) => this.handleTriggerPress(controller),
        onTriggerRelease: (controller) => this.handleTriggerRelease(controller),
        onRadialMenuCancel: (controller) => this.cancelRadialMenu(controller),
        onGripPress: (controller) => this.handleGripPress(controller),
        onGripRelease: (controller) => this.handleGripRelease(controller),
        onGripScaleThumbstick: (controller, direction) => this.handleGripScaleThumbstick(controller, direction),
      },
    });

    this.currentVowelIndex = -1;
    this.currentVowelLetter = "neutral";

    this.instructionPanel = null;
    this.closeButton = null;
    this.panelVisible = false;
    this.instructionPanelClosed = false;
    this.pendingPanelPlacementFrames = 0;
  }

  async init() {
    this.setupControllers();
    this.createInstructionPanel();
    await this.loadInstrument();
    await this.loadNoteFont();
  }

  setupControllers() {
    this.controllerManager.setup();
    this.controllers = this.controllerManager.controllers;
    this.controllerStates = this.controllerManager.controllerStates;
    this.gripTransformSystem = new GripTransformSystem({
      controllers: this.controllers,
      controllerStates: this.controllerStates,
      getPointedInstrumentState: (controller) => this.getPointedInstrumentState(controller),
      adjustInstrumentBaseScale: (state, delta) => this.adjustInstrumentBaseScale(state, delta),
    });
  }

  createRayLine() {
    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, -1.6),
    ]);
    const material = new THREE.LineBasicMaterial({
      color: RAY_COLOR_DEFAULT,
      transparent: true,
      opacity: 0.88,
      depthTest: false,
      depthWrite: false,
    });
    const line = new THREE.Line(geometry, material);
    line.name = "ControllerRay";
    line.renderOrder = 1000;
    line.visible = false;
    return line;
  }

  createRadialMenu() {
    return this.radialSpawnMenu.create();
  }

  createInstructionPanel() {
    this.instructionPanelView = new InstructionPanel();
    this.instructionPanelView.attachTo(this.scene);
    this.instructionPanel = this.instructionPanelView.group;
    this.closeButton = this.instructionPanelView.closeButton;
  }

  async loadInstrument() {
    const honkOption = SPAWN_COMPONENT_OPTIONS.find((option) => option.id === "honk") || SPAWN_COMPONENT_OPTIONS[0];
    const gltf = await this.loader.loadAsync(honkOption.modelPath || MODEL_PATH);
    this.instrumentMaterialTextures = await loadMaterialTextureSet(this.textureLoader, INSTRUMENT_TEXTURE_PATHS);
    this.instrumentTemplate = gltf.scene;
    this.instrumentTemplate.name = "FaceInstrumentTemplate";
    this.instrumentTemplate.visible = false;
    applyStandardInstrumentMaterials(this.instrumentTemplate, this.instrumentMaterialTextures);

    const templateMorphMeshes = findMorphMesh(this.instrumentTemplate);
    const templateHitTargets = collectHitTargets(this.instrumentTemplate);
    this.createBodyGripTarget(this.instrumentTemplate, templateHitTargets);
    this.createMorphTargetSpheres(this.instrumentTemplate, templateHitTargets);
    this.createHonkConnectionTarget(this.instrumentTemplate, templateHitTargets);
    const templateState = this.createInstrumentState(
      this.instrumentTemplate,
      templateMorphMeshes,
      templateHitTargets,
      false,
    );

    this.logModelDiagnostics(templateState);
    this.initializeInstrumentState(templateState);
    this.componentTemplates.set(honkOption.id, {
      ...honkOption,
      template: this.instrumentTemplate,
      interactive: true,
    });

    for (const variantOption of SPAWN_COMPONENT_OPTIONS.filter((option) => option.variantOf === honkOption.id)) {
      this.componentTemplates.set(variantOption.id, {
        ...variantOption,
        template: this.instrumentTemplate,
        interactive: true,
      });
    }

    await Promise.all(
      SPAWN_COMPONENT_OPTIONS.filter((option) => option.id !== honkOption.id && !option.variantOf).map((option) =>
        this.loadStaticComponentTemplate(option),
      ),
    );
  }

  async loadNoteFont() {
    if (!NOTE_LABEL_SETTINGS.enabled || !NOTE_LABEL_SETTINGS.fontUrl) {
      return null;
    }

    if (!this.noteFontLoadPromise) {
      this.noteFontLoadPromise = this.fontLoader.loadAsync(NOTE_LABEL_SETTINGS.fontUrl).catch((error) => {
        console.warn("Could not load note label font:", error);
        return null;
      });
    }

    this.noteFont = await this.noteFontLoadPromise;
    return this.noteFont;
  }

  async loadStaticComponentTemplate(option) {
    const gltf = await this.loader.loadAsync(option.modelPath);
    const template = gltf.scene;
    template.name = `${option.label}Template`;
    template.visible = false;

    const templateHitTargets = collectHitTargets(template);
    if (option.id === RECORDER_COMPONENT_ID) {
      applyStandardInstrumentMaterials(template, await this.loadLooperMaterialTextures());
      this.createRecorderColliders(template, templateHitTargets);
    } else if (option.id === LEGACY_LOOPER_COMPONENT_ID) {
      this.createLooperColliders(template, templateHitTargets);
    }
    this.createBodyGripTarget(template, templateHitTargets);
    this.createInstrumentState(template, findMorphMesh(template), templateHitTargets, false);

    this.componentTemplates.set(option.id, {
      ...option,
      template,
      interactive: false,
    });
  }

  async loadLooperMaterialTextures() {
    if (!this.looperMaterialTexturePromise) {
      this.looperMaterialTexturePromise = loadMaterialTextureSet(this.textureLoader, LOOPER_TEXTURE_PATHS);
    }
    this.looperMaterialTextures = await this.looperMaterialTexturePromise;
    return this.looperMaterialTextures;
  }

  createInstrumentState(
    root,
    morphMeshes = findMorphMesh(root),
    hitTargets = collectHitTargets(root),
    attachToHitTargets = true,
  ) {
    const state = {
      id: this.nextInstrumentId,
      root,
      morphMeshes,
      hitTargets,
      hitTargetList: Object.values(hitTargets),
      gripTargetList: collectGripRaycastTargets(root),
      missingMorphWarnings: new Set(),
      currentVowelIndex: -1,
      currentVowelLetter: "neutral",
      hornHolders: new Set(),
      hornSqueezeValue: 0,
      sequencerSqueezeValue: 0,
      baseScale: this.getRootUniformScale(root),
      locked: false,
      bendValue: 0,
      targetBendValue: 0,
      activeBends: new Map(),
      noteLabelGroup: null,
      noteLabelMesh: null,
      noteLabelTextValue: null,
    };
    state.bendAlignedColliderGroup = root.getObjectByName(BEND_ALIGNED_COLLIDER_GROUP_NAME) || null;
    state.morphController = new MorphTargetController(root, {
      warnMissingExpectedMorphs: this.hasExpectedHonkMorphs(morphMeshes),
    });
    state.debugVisuals = DEBUG_SHOW_BOUNDING_BOXES ? new DebugVisuals(root) : null;
    this.nextInstrumentId += 1;

    if (attachToHitTargets) {
      const gripTargetSet = new Set(state.gripTargetList);
      root.traverse((object) => {
        if (object.userData.isHitTarget || gripTargetSet.has(object)) {
          object.userData.instrumentState = state;
        }
      });
    }

    return state;
  }

  hasExpectedHonkMorphs(morphMeshes) {
    return morphMeshes.some((mesh) => mesh.morphTargetDictionary?.[MORPH_TARGET_NAMES.squeeze] !== undefined);
  }

  createBodyGripTarget(root, hitTargets) {
    createBodyGripTargetObject(root, hitTargets, {
      makeHitTargetMaterial,
      hitMarkerOpacity: HIT_MARKER_OPACITY,
    });
  }

  createMorphTargetSpheres(root, hitTargets) {
    createMorphTargetSphereColliders(root, hitTargets, {
      hitMarkerOpacity: HIT_MARKER_OPACITY,
    });
  }

  createHonkConnectionTarget(root, hitTargets) {
    createHonkConnectionTargetObject(root, hitTargets, {
      makeHitTargetMaterial,
    });
  }

  createLooperColliders(root, hitTargets) {
    createLooperColliderTargets(root, hitTargets, {
      makeHitTargetMaterial,
    });
  }

  createRecorderColliders(root, hitTargets) {
    createRecorderColliderTargets(root, hitTargets, {
      makeHitTargetMaterial,
    });
  }

  initializeInstrumentState(state) {
    state.morphController.resetAll();
    this.setVowel(null, state);
    for (const sphere of this.getProceduralMorphTargetSpheres(state)) {
      this.setSpherePositionFromSignedValue(sphere, 0);
    }
  }

  initializeLooperState(state) {
    const pads = [];
    for (let index = 0; index < LOOPER_PAD_COUNT; index += 1) {
      const padTarget = state.hitTargets[getLooperPadName(index)] || null;
      const nodeTarget = state.hitTargets[getLooperNodeName(index)] || null;
      pads.push({
        index,
        padTarget,
        nodeTarget,
        connectedHonkState: null,
        clip: null,
        wireMesh: null,
        isRecording: false,
        isPlaying: false,
      });
    }

    state.isLooper = true;
    state.looperData = {
      pads,
      recording: false,
      playing: false,
      paused: false,
      activePadIndex: null,
      activeVoiceId: null,
      nextPlaybackPadIndex: 0,
      activeClipElapsedMs: 0,
      lastPlaybackUpdateMs: 0,
      activeRecordings: new Map(),
      volumeControlValue: 0,
      speedControlValue: 0,
      volume: this.getLooperVolumeFromControl(0),
      speed: this.getLooperSpeedFromControl(0),
      lastPosition: new THREE.Vector3(),
      lastQuaternion: new THREE.Quaternion(),
    };

    state.root.updateMatrixWorld(true);
    state.root.getWorldPosition(state.looperData.lastPosition);
    state.root.getWorldQuaternion(state.looperData.lastQuaternion);

    this.setLooperControlValue(state, "volume", 0);
    this.setLooperControlValue(state, "speed", 0);
    this.updateLooperVisuals(state);
  }

  initializeRecorderState(state) {
    const channels = [];
    for (let index = 0; index < RECORDER_CHANNEL_COUNT; index += 1) {
      channels.push({
        index,
        nodeTarget: state.hitTargets[getRecorderNodeName(index)] || null,
        connectedHonkState: null,
        wireMesh: null,
        isRecording: false,
        isPlaying: false,
      });
    }

    state.isRecorder = true;
    state.recorderData = {
      channels,
      events: [],
      nextEventId: 1,
      recording: false,
      recordingStarted: false,
      playing: false,
      paused: false,
      hasRecording: false,
      durationMs: 0,
      timelineStartMs: 0,
      lastRecordedEventEndMs: 0,
      playbackElapsedMs: 0,
      lastPlaybackUpdateMs: 0,
      activeRecordings: new Map(),
      activePlaybackEvents: new Map(),
      buttonMorphReleaseTimes: new Map(),
      playingHeadMorphValue: 0,
      playingHeadMorphTarget: 0,
      playingHeadMorphPhase: 0,
      lastPlayingHeadMorphUpdateMs: 0,
      nextPlayingHeadMorphChangeMs: 0,
      volumeControlValue: 0,
      speedControlValue: 0,
      gapControlValue: -1,
      volume: this.getLooperVolumeFromControl(0),
      speed: this.getLooperSpeedFromControl(0),
      loopGapMs: this.getRecorderLoopGapFromControl(-1),
      lastPosition: new THREE.Vector3(),
      lastQuaternion: new THREE.Quaternion(),
    };

    state.root.updateMatrixWorld(true);
    state.root.getWorldPosition(state.recorderData.lastPosition);
    state.root.getWorldQuaternion(state.recorderData.lastQuaternion);

    this.setRecorderControlValue(state, "volume", 0);
    this.setRecorderControlValue(state, "speed", 0);
    this.setRecorderControlValue(state, "gap", -1);
    this.updateRecorderVisuals(state);
  }

  logModelDiagnostics(state) {
    const morphNames = new Set();
    for (const mesh of state.morphMeshes) {
      Object.keys(mesh.morphTargetDictionary).forEach((name) => morphNames.add(name));
    }

    if (DEBUG_LOG_MORPHS) {
      console.log("Morph targets found:", [...morphNames].sort());
    }
    console.log("HIT_ targets found:", Object.keys(state.hitTargets).sort());

    for (const morphName of Object.values(MORPH_TARGETS)) {
      if (!morphNames.has(morphName)) {
        console.warn(`Expected morph target missing: ${morphName}`);
      }
    }

    for (const hitName of EXPECTED_HIT_TARGETS) {
      if (!state.hitTargets[hitName]) {
        console.warn(`Expected HIT_ collider missing: ${hitName}`);
      }
    }
  }

  onXRSessionStart() {
    this.instructionPanelClosed = !SHOW_INSTRUCTION_PANEL;

    if (SHOW_INSTRUCTION_PANEL) {
      this.showInstructionPanel();
    } else {
      this.hideInstructionPanel();
      if (this.instrumentStates.length === 0) {
        this.spawnDefaultInstrumentPreview();
      }
    }
  }

  onXRSessionEnd() {
    this.hideInstructionPanel();
    this.pendingPanelPlacementFrames = 0;

    for (const controller of this.controllers) {
      const state = this.controllerStates.get(controller);
      if (!state) {
        continue;
      }

      if (state.hoveredTarget) {
        this.setTargetHighlight(state.hoveredTarget, false);
      }
      this.releaseRaySqueeze(state);
      this.closeRadialMenu(controller);

      state.trigger = false;
      state.grip = false;
      state.a = false;
      state.b = false;
      state.x = false;
      state.y = false;
      state.thumbstickScaleDirection = 0;
      state.hoveredTarget = null;
      state.activeTriggerInteraction = null;
      state.gripHeld = false;
      state.gripInstrumentState = null;
      state.raySqueezeVoiceId = null;
      state.raySqueezeInstrumentState = null;
      controller.userData.gamepad = null;

      if (controller.userData.rayLine) {
        controller.userData.rayLine.visible = false;
      }
    }

    for (const state of this.instrumentStates) {
      state.hornHolders.clear();
      state.activeBends.clear();
      state.targetBendValue = 0;
    }

    this.synth.releaseAll();
  }

  showInstructionPanel() {
    if (!this.instructionPanel) {
      return;
    }

    this.instructionPanelView?.show();
    this.panelVisible = true;
    this.pendingPanelPlacementFrames = 4;
  }

  hideInstructionPanel() {
    if (!this.instructionPanel) {
      return;
    }

    this.instructionPanelView?.hide();
    this.panelVisible = false;
  }

  closeInstructionPanel() {
    this.hideInstructionPanel();
    this.instructionPanelClosed = true;

    if (this.instrumentStates.length === 0) {
      this.spawnDefaultInstrumentPreview();
    }
  }

  update(delta = 0, time = performance.now()) {
    this.updateSceneObjects(delta, time);
    this.updatePendingPanelPlacement();
    this.pollControllers();
    this.updateRadialMenus();
    this.updateRaycastHover();
    this.updateTriggerInteraction();
    this.updateGripTransform();
    this.updateLooperFollowerTransforms();
    this.updateHorn();
    this.updateLooperRecordings();
    this.updateRecorderRecordings();
    this.updateLooperPlayback();
    this.updateRecorderPlayback();
    this.updateSequencerPlaybackSqueezeVisuals();
    this.updateRecorderMorphAnimations();
    this.updateLooperWires();
    this.updateRecorderWires();
    this.updateAllLooperVisuals();
    this.updateAllRecorderVisuals();
  }

  updateSceneObjects(delta, time) {
    for (const state of this.instrumentStates) {
      if (state.root?.visible) {
        state.sceneObject?.update(delta, time);
      }
    }
  }

  updatePendingPanelPlacement() {
    if (!this.pendingPanelPlacementFrames || !this.instructionPanel?.visible) {
      return;
    }

    this.instructionPanelView?.positionInFrontOfCamera(this.getUserCamera(), 1.15);
    this.pendingPanelPlacementFrames -= 1;
  }

  pollControllers() {
    this.controllerManager.pollControllers();
  }

  pollController(controller) {
    this.controllerManager.pollController(controller);
  }

  findGamepad(handedness) {
    return this.controllerManager.findGamepad(handedness);
  }

  getThumbstickScaleDirection(gamepad) {
    return this.controllerManager.getThumbstickScaleDirection(gamepad);
  }

  getRightController() {
    return this.controllerManager.getRightController();
  }

  getControllerVoiceId(controller) {
    return controller.userData.handedness || `controller-${controller.userData.index}`;
  }

  getInstrumentVoiceId(controllerVoiceId, instrumentState) {
    return `${controllerVoiceId}:instrument-${instrumentState.id}`;
  }

  handleAPress(controller, gripPressed = false) {
    if (!this.instructionPanelClosed) {
      return;
    }

    const controllerState = this.controllerStates.get(controller);
    if (
      controllerState?.gripHeld &&
      controllerState.gripInstrumentState?.root?.visible &&
      this.getPointedInstrumentState(controller) === controllerState.gripInstrumentState
    ) {
      this.duplicateInstrumentForGrip(controller, controllerState.gripInstrumentState);
      return;
    }

    if (gripPressed || controllerState?.grip) {
      return;
    }

    this.synth.ensureAudio();
    this.openRadialMenu(controller);
  }

  handleARelease(controller) {
    const state = this.controllerStates.get(controller);
    if (!state?.radialMenuOpen) {
      return;
    }

    const selectedOption = SPAWN_COMPONENT_OPTIONS[state.radialMenuSelectedIndex];
    const cancelled = state.radialMenuCancelled;
    this.closeRadialMenu(controller);

    if (!cancelled && selectedOption) {
      this.spawnComponentInFrontOfCamera(selectedOption.id);
    }
  }

  openRadialMenu(controller) {
    const state = this.controllerStates.get(controller);
    this.radialSpawnMenu.open(controller, state);
  }

  closeRadialMenu(controller) {
    const state = this.controllerStates.get(controller);
    this.radialSpawnMenu.close(controller, state);
  }

  cancelRadialMenu(controller) {
    const state = this.controllerStates.get(controller);
    this.radialSpawnMenu.cancel(controller, state);
  }

  handleDeletePress(controller) {
    const instrumentState = this.getPointedInstrumentState(controller);
    if (!instrumentState) {
      return;
    }

    this.deleteInstrument(instrumentState);
  }

  handleDisconnectPress(controller) {
    const hit = this.getCurrentHit(controller);
    if (hit?.object?.userData.isLooperNode) {
      const looperState = hit.object.userData.instrumentState;
      this.disconnectLooperPad(looperState, hit.object.userData.looperPadIndex);
      return;
    }
    if (hit?.object?.userData.isRecorderNode) {
      const recorderState = hit.object.userData.instrumentState;
      this.disconnectRecorderChannel(recorderState, hit.object.userData.recorderChannelIndex);
      return;
    }
  }

  handleBPress(controller) {
    const instrumentState = this.getPointedInstrumentState(controller);
    if (!instrumentState?.interactive || !instrumentState.root?.visible) {
      return;
    }

    instrumentState.locked = !instrumentState.locked;
    this.updateLockVisual(instrumentState);
  }

  updateRadialMenus() {
    for (const controller of this.controllers) {
      const state = this.controllerStates.get(controller);
      if (!state?.radialMenuOpen) {
        continue;
      }

      this.radialSpawnMenu.update(controller, state);
    }
  }

  getRadialMenuSelectedIndex(controller, state) {
    return this.radialSpawnMenu.getSelectedIndex(controller, state);
  }

  updateRadialMenuVisuals(controller) {
    const state = this.controllerStates.get(controller);
    this.radialSpawnMenu.updateVisuals(controller, state);
  }

  deleteInstrument(instrumentState) {
    const instrumentVoiceSuffix = `:instrument-${instrumentState.id}`;
    this.cleanupLooperReferencesForDeletedInstrument(instrumentState);

    for (const controller of this.controllers) {
      const controllerState = this.controllerStates.get(controller);
      const interaction = controllerState?.activeTriggerInteraction;
      if (interaction?.activeVoiceIds?.has(this.getInstrumentVoiceId(interaction.voiceId, instrumentState))) {
        this.synth.resetPitchBend(this.getInstrumentVoiceId(interaction.voiceId, instrumentState));
        this.synth.release(this.getInstrumentVoiceId(interaction.voiceId, instrumentState));
      }

      for (const activeVoiceId of controllerState?.raySqueezeActiveVoiceIds || []) {
        if (activeVoiceId === this.getInstrumentVoiceId(controllerState.raySqueezeVoiceId, instrumentState)) {
          this.synth.resetPitchBend(activeVoiceId);
          this.synth.release(activeVoiceId);
          controllerState.raySqueezeActiveVoiceIds.delete(activeVoiceId);
        }
      }

      if (interaction?.instrumentState === instrumentState) {
        if (interaction.type === "holdSqueeze") {
          for (const activeVoiceId of interaction.activeVoiceIds || []) {
            this.synth.resetPitchBend(activeVoiceId);
            this.synth.release(activeVoiceId);
          }
        }
        controllerState.activeTriggerInteraction = null;
      }

      if (controllerState?.gripInstrumentState === instrumentState) {
        controllerState.gripHeld = false;
        controllerState.gripInstrumentState = null;
      }

      if (controllerState?.raySqueezeInstrumentState === instrumentState) {
        controllerState.raySqueezeInstrumentState = null;
      }

      if (controllerState?.hoveredTarget && this.isObjectInInstrument(controllerState.hoveredTarget, instrumentState)) {
        this.setTargetHighlight(controllerState.hoveredTarget, false);
        controllerState.hoveredTarget = null;
      }
    }

    this.synth.releaseMatchingVoiceIds((voiceId) => voiceId.endsWith(instrumentVoiceSuffix));
    if (instrumentState.sceneObject) {
      instrumentState.sceneObject.dispose();
    } else {
      instrumentState.debugVisuals?.dispose();
      this.disposeInstrumentResources(instrumentState);
      instrumentState.root.removeFromParent();
    }
    this.instrumentStates = this.instrumentStates.filter((state) => state !== instrumentState);

    if (this.activeInstrumentState === instrumentState) {
      this.activeInstrumentState = this.instrumentStates.at(-1) || null;
    }
  }

  disposeInstrumentResources(instrumentState) {
    const disposedMaterials = new Set();

    instrumentState.root.traverse((object) => {
      if (object.userData.instrumentState === instrumentState) {
        delete object.userData.instrumentState;
      }

      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        if (!material?.userData.disposeOnInstrumentDelete || disposedMaterials.has(material)) {
          continue;
        }
        material.dispose();
        disposedMaterials.add(material);
      }

      if (object.geometry?.userData.disposeOnInstrumentDelete) {
        object.geometry.dispose();
      }
    });

    instrumentState.hornHolders.clear();
    instrumentState.activeBends.clear();
    instrumentState.hitTargetList.length = 0;
    instrumentState.morphMeshes.length = 0;
  }

  isObjectInInstrument(object, instrumentState) {
    let current = object;
    while (current) {
      if (current === instrumentState.root) {
        return true;
      }
      current = current.parent;
    }
    return false;
  }

  handleTriggerPress(controller) {
    this.synth.ensureAudio();
    const controllerState = this.controllerStates.get(controller);
    this.initializeRaySqueeze(controller);
    const hit = this.getCurrentHit(controller);

    if (hit?.object?.userData.isCloseButton) {
      this.closeInstructionPanel();
      return;
    }

    if (this.handleLooperTriggerPress(controller, hit)) {
      return;
    }
    if (this.handleRecorderTriggerPress(controller, hit)) {
      return;
    }

    const lockedInstrumentState = this.getLockedInstrumentStateFromRay(controller);
    if (lockedInstrumentState?.interactive) {
      controllerState.activeTriggerInteraction = null;
      controllerState.raySqueezeInstrumentState = lockedInstrumentState;
      this.activeInstrumentState = lockedInstrumentState;
      return;
    }

    const targetName = hit?.object?.name;
    const config = INTERACTION_MAP[targetName];
    if (!config) {
      return;
    }

    const instrumentState = hit.object.userData.instrumentState;
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
  }

  handleTriggerRelease(controller) {
    const controllerState = this.controllerStates.get(controller);
    const interaction = controllerState?.activeTriggerInteraction;

    if (interaction?.type === "looperWire") {
      this.finishLooperWireInteraction(controller, interaction);
      controllerState.activeTriggerInteraction = null;
      return;
    }

    if (interaction?.type === "looperSilentPad") {
      this.finishLooperPadRecording(interaction.looperState, interaction.pad, performance.now());
      controllerState.activeTriggerInteraction = null;
      return;
    }

    if (interaction?.type === "looperControlDrag") {
      controllerState.activeTriggerInteraction = null;
      return;
    }

    if (interaction?.type === "recorderWire") {
      this.finishRecorderWireInteraction(controller, interaction);
      controllerState.activeTriggerInteraction = null;
      return;
    }

    if (interaction?.type === "recorderControlDrag") {
      controllerState.activeTriggerInteraction = null;
      return;
    }

    this.releaseRaySqueeze(controllerState);
    if (interaction?.type === "holdSqueeze") {
      for (const activeVoiceId of interaction.activeVoiceIds || []) {
        this.synth.resetPitchBend(activeVoiceId);
        this.synth.release(activeVoiceId);
      }
      interaction.instrumentState?.activeBends?.delete(interaction.voiceId);
    }
    controllerState.activeTriggerInteraction = null;
  }

  handleLooperTriggerPress(controller, hit) {
    const target = hit?.object;
    if (!target?.userData?.isLooperCollider) {
      return false;
    }

    const controllerState = this.controllerStates.get(controller);
    const looperState = target.userData.instrumentState;
    if (!controllerState || !looperState?.isLooper || !looperState.root?.visible) {
      return false;
    }

    this.activeInstrumentState = looperState;

    if (target.userData.isLooperButton) {
      this.pressLooperButton(looperState, target.userData.looperButtonAction);
      controllerState.activeTriggerInteraction = null;
      return true;
    }

    if (target.userData.isLooperNode) {
      const pad = this.getLooperPad(looperState, target.userData.looperPadIndex);
      if (pad) {
        controllerState.activeTriggerInteraction = this.startLooperWireInteraction(controller, looperState, pad);
      }
      return true;
    }

    if (target.userData.isLooperPad) {
      const pad = this.getLooperPad(looperState, target.userData.looperPadIndex);
      if (pad && looperState.looperData.recording && !pad.connectedHonkState) {
        this.beginLooperPadRecording(looperState, pad, {
          silent: true,
          startedAtMs: performance.now(),
          note: null,
          honkState: null,
        });
        controllerState.activeTriggerInteraction = {
          type: "looperSilentPad",
          looperState,
          pad,
        };
      } else {
        controllerState.activeTriggerInteraction = null;
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
  }

  pressLooperButton(looperState, action) {
    if (!looperState?.isLooper) {
      return;
    }

    if (action === "record") {
      looperState.looperData.recording = true;
      this.updateLooperVisuals(looperState);
      return;
    }

    if (action === "stop") {
      this.stopLooperRecording(looperState);
      this.stopLooperPlayback(looperState);
      this.updateLooperVisuals(looperState);
      return;
    }

    if (action === "play") {
      this.startLooperPlayback(looperState);
      this.updateLooperVisuals(looperState);
      return;
    }

    if (action === "pause") {
      this.pauseLooperPlayback(looperState);
      this.updateLooperVisuals(looperState);
    }
  }

  startLooperWireInteraction(controller, looperState, pad) {
    const wireColor = this.getLooperWireColor(pad.index);
    const wireMesh = new THREE.Mesh(
      new THREE.BufferGeometry(),
      this.createLooperWireMaterial(wireColor),
    );
    wireMesh.name = `LOOPER_wire_preview_${looperState.id}_${pad.index}`;
    wireMesh.renderOrder = 15;
    this.scene.add(wireMesh);

    const interaction = {
      type: "looperWire",
      looperState,
      pad,
      wireMesh,
    };
    this.updateActiveLooperWire(controller, interaction);
    return interaction;
  }

  updateActiveLooperWire(controller, interaction) {
    if (!interaction?.wireMesh || !interaction.pad?.nodeTarget) {
      return;
    }

    interaction.pad.nodeTarget.getWorldPosition(tempWireStart);
    this.setRaycasterFromController(controller);

    const hit = this.getCurrentHit(controller);
    if (hit?.object?.userData.isHonkConnectionTarget) {
      tempWireEnd.copy(hit.point);
    } else {
      tempWireEnd.copy(this.raycaster.ray.origin).addScaledVector(this.raycaster.ray.direction, 0.85);
    }

    this.updateWireMeshGeometry(interaction.wireMesh, tempWireStart, tempWireEnd);
  }

  finishLooperWireInteraction(controller, interaction) {
    const hit = this.getCurrentHit(controller);
    const honkState = hit?.object?.userData.isHonkConnectionTarget ? hit.object.userData.instrumentState : null;
    if (honkState?.interactive && honkState.root?.visible) {
      this.connectLooperPadToHonk(interaction.looperState, interaction.pad.index, honkState);
    }

    this.disposeWireMesh(interaction.wireMesh);
    interaction.wireMesh = null;
  }

  updateLooperControlDrag(controller, interaction) {
    const sphere = interaction.sphere;
    const looperState = interaction.looperState;
    if (!sphere || !looperState?.isLooper) {
      return;
    }

    const deltaY = controller.position.y - interaction.dragStartY;
    const dragDelta = sphere.userData.movementMode === "arc"
      ? this.getArcControlDragDelta(controller, looperState, sphere, interaction)
      : deltaY / this.getInstrumentWorldScaleY(looperState);
    const nextValue = this.getControlValueFromDrag(sphere, interaction, dragDelta);

    this.positionControlColliderFromValue(sphere, nextValue);
    this.setLooperControlValue(looperState, interaction.control, nextValue, false, interaction.morphTargets);
  }

  handleRecorderTriggerPress(controller, hit) {
    const target = hit?.object;
    if (!target?.userData?.isRecorderCollider) {
      return false;
    }

    const controllerState = this.controllerStates.get(controller);
    const recorderState = target.userData.instrumentState;
    if (!controllerState || !recorderState?.isRecorder || !recorderState.root?.visible) {
      return false;
    }

    this.activeInstrumentState = recorderState;

    if (target.userData.isRecorderButton) {
      this.pressRecorderButton(recorderState, target.userData.recorderButtonAction, target.userData.looperMorphName);
      controllerState.activeTriggerInteraction = null;
      return true;
    }

    if (target.userData.isRecorderNode) {
      const channel = this.getRecorderChannel(recorderState, target.userData.recorderChannelIndex);
      if (channel) {
        controllerState.activeTriggerInteraction = this.startRecorderWireInteraction(controller, recorderState, channel);
      }
      return true;
    }

    if (target.userData.isRecorderControl) {
      controllerState.activeTriggerInteraction = {
        type: "recorderControlDrag",
        recorderState,
        control: target.userData.recorderControl,
        morphTargets: target.userData.looperMorphTargets || null,
        sphere: target,
        dragStartY: controller.position.y,
        dragStartLocalPosition: this.getControllerLocalPosition(controller, recorderState).clone(),
        dragStartValue: this.getRecorderControlValue(recorderState, target.userData.recorderControl),
        dragStartSphereY: target.position.y,
      };
      return true;
    }

    return false;
  }

  pressRecorderButton(recorderState, action, morphName = null) {
    if (!recorderState?.isRecorder) {
      return;
    }

    if (action === "record") {
      this.setRecorderButtonMorph(recorderState, "record", 1, morphName);
      this.setRecorderButtonMorph(recorderState, "play", 0);
      this.startRecorderRecording(recorderState);
      this.updateRecorderVisuals(recorderState);
      return;
    }

    if (action === "stop") {
      this.triggerRecorderButtonMorph(recorderState, "stop", performance.now(), morphName);
      this.setRecorderButtonMorph(recorderState, "record", 0);
      this.setRecorderButtonMorph(recorderState, "play", 0);
      this.stopRecorderRecording(recorderState);
      this.stopRecorderPlayback(recorderState);
      this.updateRecorderVisuals(recorderState);
      return;
    }

    if (action === "play") {
      this.setRecorderButtonMorph(recorderState, "play", 1, morphName);
      this.setRecorderButtonMorph(recorderState, "record", 0);
      this.startRecorderPlayback(recorderState);
      this.updateRecorderVisuals(recorderState);
      return;
    }

    if (action === "pause") {
      this.triggerRecorderButtonMorph(recorderState, "pause", performance.now(), morphName);
      this.setRecorderButtonMorph(recorderState, "play", 0);
      this.pauseRecorderPlayback(recorderState);
      this.updateRecorderVisuals(recorderState);
    }
  }

  startRecorderWireInteraction(controller, recorderState, channel) {
    const wireColor = this.getLooperWireColor(channel.index);
    const wireMesh = new THREE.Mesh(
      new THREE.BufferGeometry(),
      this.createLooperWireMaterial(wireColor),
    );
    wireMesh.name = `RECORDER_wire_preview_${recorderState.id}_${channel.index}`;
    wireMesh.renderOrder = 15;
    this.scene.add(wireMesh);

    const interaction = {
      type: "recorderWire",
      recorderState,
      channel,
      wireMesh,
    };
    this.updateActiveRecorderWire(controller, interaction);
    return interaction;
  }

  updateActiveRecorderWire(controller, interaction) {
    if (!interaction?.wireMesh || !interaction.channel?.nodeTarget) {
      return;
    }

    interaction.channel.nodeTarget.getWorldPosition(tempWireStart);
    this.setRaycasterFromController(controller);

    const hit = this.getCurrentHit(controller);
    if (hit?.object?.userData.isHonkConnectionTarget) {
      tempWireEnd.copy(hit.point);
    } else {
      tempWireEnd.copy(this.raycaster.ray.origin).addScaledVector(this.raycaster.ray.direction, 0.85);
    }

    this.updateWireMeshGeometry(interaction.wireMesh, tempWireStart, tempWireEnd);
  }

  finishRecorderWireInteraction(controller, interaction) {
    const hit = this.getCurrentHit(controller);
    const honkState = hit?.object?.userData.isHonkConnectionTarget ? hit.object.userData.instrumentState : null;
    if (honkState?.interactive && honkState.root?.visible) {
      this.connectRecorderChannelToHonk(interaction.recorderState, interaction.channel.index, honkState);
    }

    this.disposeWireMesh(interaction.wireMesh);
    interaction.wireMesh = null;
  }

  updateRecorderControlDrag(controller, interaction) {
    const sphere = interaction.sphere;
    const recorderState = interaction.recorderState;
    if (!sphere || !recorderState?.isRecorder) {
      return;
    }

    const deltaY = controller.position.y - interaction.dragStartY;
    const dragDelta = sphere.userData.movementMode === "arc"
      ? this.getArcControlDragDelta(controller, recorderState, sphere, interaction)
      : deltaY / this.getInstrumentWorldScaleY(recorderState);
    const nextValue = this.getControlValueFromDrag(sphere, interaction, dragDelta);

    this.positionControlColliderFromValue(sphere, nextValue);
    this.setRecorderControlValue(recorderState, interaction.control, nextValue, false, interaction.morphTargets);
  }

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
  }

  getControllerLocalPosition(controller, instrumentState) {
    controller.updateMatrixWorld(true);
    instrumentState.root.updateMatrixWorld(true);
    controller.getWorldPosition(tempControlDragPosition);
    instrumentState.root.worldToLocal(tempControlDragPosition);
    return tempControlDragPosition;
  }

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
  }

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
  }

  initializeRaySqueeze(controller) {
    const controllerState = this.controllerStates.get(controller);
    if (!controllerState) {
      return;
    }

    controllerState.raySqueezeVoiceId = this.getControllerVoiceId(controller);
    this.resetRaySqueezeReference(controller, controllerState);
  }

  resetRaySqueezeReference(controller, controllerState) {
    controller.updateMatrixWorld(true);
    controller.getWorldQuaternion(controllerState.raySqueezeStartQuaternion);
    controllerState.raySqueezeStartInverseQuaternion.copy(controllerState.raySqueezeStartQuaternion).invert();
  }

  releaseRaySqueeze(controllerState) {
    if (!controllerState) {
      return;
    }

    for (const activeVoiceId of controllerState.raySqueezeActiveVoiceIds || []) {
      this.synth.resetPitchBend(activeVoiceId);
      this.synth.release(activeVoiceId);
    }
    controllerState.raySqueezeActiveVoiceIds.clear();
    controllerState.raySqueezeInstrumentState = null;
  }

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

      if (interaction.type === "looperControlDrag") {
        this.updateLooperControlDrag(controller, interaction);
        continue;
      }

      if (interaction.type === "recorderWire") {
        this.updateActiveRecorderWire(controller, interaction);
        continue;
      }

      if (interaction.type === "recorderControlDrag") {
        this.updateRecorderControlDrag(controller, interaction);
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
  }

  getInteractionValue(config, instrumentState) {
    if (config.dragType === "ear") {
      return instrumentState.morphController.getEarAmount(config.side);
    }

    if (config.dragType === "nose") {
      return instrumentState.morphController.getValue(MORPH_TARGET_NAMES.nose);
    }

    return this.getMorphValue(config.morph, instrumentState);
  }

  applyInteractionValue(interaction, value) {
    if (interaction.dragType === "ear") {
      interaction.instrumentState.scalePresetNote = null;
      interaction.instrumentState.morphController.setEar(interaction.side, value);
      this.updateNoteLabel(interaction.instrumentState);
      return;
    }

    if (interaction.dragType === "nose") {
      interaction.instrumentState.morphController.setNose(value);
      return;
    }

    this.setMorph(interaction.morph, value, interaction.instrumentState);
  }

  getInstrumentWorldScaleY(state) {
    if (!state?.root) {
      return 1;
    }

    state.root.getWorldScale(tempScale);
    return Math.max(Math.abs(tempScale.y), 0.0001);
  }

  getProceduralMorphTargetSpheres(state) {
    return state.hitTargetList.filter(
      (target) => target.userData.isProceduralMorphTarget,
    );
  }

  setSpherePositionFromMorph(sphere, morphValue) {
    sphere.position.y = THREE.MathUtils.lerp(
      sphere.userData.minY,
      sphere.userData.maxY,
      sphere.userData.invertVerticalMorph
        ? 1 - THREE.MathUtils.clamp(morphValue, 0, 1)
        : THREE.MathUtils.clamp(morphValue, 0, 1),
    );
  }

  setSpherePositionFromSignedValue(sphere, signedValue) {
    sphere.position.y = THREE.MathUtils.mapLinear(
      THREE.MathUtils.clamp(signedValue, -1, 1),
      -1,
      1,
      sphere.userData.minY,
      sphere.userData.maxY,
    );
  }

  handleGripPress(controller) {
    const hit = this.getGripHit(controller);
    this.gripTransformSystem?.begin(controller, hit);
  }

  handleGripRelease(controller) {
    this.gripTransformSystem?.release(controller);
  }

  handleGripScaleThumbstick(controller, direction) {
    this.gripTransformSystem?.handleScaleThumbstick(controller, direction);
  }

  adjustInstrumentBaseScale(state, delta) {
    if (!state?.root) {
      return;
    }

    this.setInstrumentBaseScale(state, state.baseScale + delta);
  }

  setInstrumentBaseScale(state, scale) {
    if (!state?.root) {
      return;
    }

    state.baseScale = THREE.MathUtils.clamp(scale, INSTRUMENT_MIN_SCALE, INSTRUMENT_MAX_SCALE);
    this.applyInstrumentVisualScale(state);
  }

  duplicateInstrumentForGrip(controller, sourceState) {
    if (!sourceState?.root?.visible) {
      return;
    }

    const componentId = sourceState.componentId || "honk";
    const duplicateRoot = this.createSpawnedComponent(componentId);
    const duplicateState = this.activeInstrumentState;
    if (!duplicateRoot || !duplicateState) {
      return;
    }

    duplicateRoot.position.copy(sourceState.root.position);
    duplicateRoot.quaternion.copy(sourceState.root.quaternion);
    this.setInstrumentBaseScale(duplicateState, sourceState.baseScale);
    duplicateState.pitchSnap = sourceState.pitchSnap || null;
    duplicateState.scalePresetNote = sourceState.scalePresetNote || null;

    if (duplicateState.interactive) {
      this.copyInstrumentMorphState(sourceState, duplicateState);
    }
    if (sourceState.isLooper && duplicateState.isLooper) {
      this.copyLooperState(sourceState, duplicateState);
    }
    if (sourceState.isRecorder && duplicateState.isRecorder) {
      this.copyRecorderState(sourceState, duplicateState);
    }

    const controllerState = this.controllerStates.get(controller);
    if (!controllerState) {
      return;
    }

    controllerState.gripHeld = true;
    controllerState.gripInstrumentState = duplicateState;
    controller.updateMatrixWorld(true);
    duplicateRoot.updateMatrixWorld(true);
    controllerState.gripOffsetMatrix.copy(controller.matrixWorld).invert().multiply(duplicateRoot.matrixWorld);
  }

  copyInstrumentMorphState(sourceState, targetState) {
    const vowelLetter = sourceState.currentVowelLetter === "neutral" ? null : sourceState.currentVowelLetter;
    targetState.morphController.setVowel(vowelLetter);
    targetState.currentVowelIndex = sourceState.currentVowelIndex;
    targetState.currentVowelLetter = sourceState.currentVowelLetter;

    const leftEar = sourceState.morphController.getEarAmount("left");
    const rightEar = sourceState.morphController.getEarAmount("right");
    const nose = sourceState.morphController.getValue(MORPH_TARGET_NAMES.nose);
    targetState.morphController.setEar("left", leftEar);
    targetState.morphController.setEar("right", rightEar);
    targetState.morphController.setNose(nose);

    const targetLeftEar = targetState.hitTargets[INTERACTION_TARGET_NAMES.leftEar];
    const targetRightEar = targetState.hitTargets[INTERACTION_TARGET_NAMES.rightEar];
    const targetNose = targetState.hitTargets[INTERACTION_TARGET_NAMES.nose];
    if (targetLeftEar?.userData.isProceduralMorphTarget) {
      this.setSpherePositionFromSignedValue(targetLeftEar, leftEar);
    }
    if (targetRightEar?.userData.isProceduralMorphTarget) {
      this.setSpherePositionFromSignedValue(targetRightEar, rightEar);
    }
    if (targetNose?.userData.isProceduralMorphTarget) {
      this.setSpherePositionFromMorph(targetNose, nose);
    }

    targetState.hornSqueezeValue = 0;
    targetState.bendValue = 0;
    targetState.targetBendValue = 0;
    targetState.morphController.setSqueeze(0);
    targetState.morphController.setBend(0);
    this.updateBendAlignedColliders(targetState);
    this.updateNoteLabel(targetState);
  }

  copyLooperState(sourceState, targetState) {
    if (!sourceState?.looperData || !targetState?.looperData) {
      return;
    }

    const sourceData = sourceState.looperData;
    const targetData = targetState.looperData;
    targetData.recording = false;
    targetData.playing = false;
    targetData.paused = false;
    targetData.activePadIndex = null;
    targetData.activeVoiceId = null;
    targetData.nextPlaybackPadIndex = 0;
    targetData.activeClipElapsedMs = 0;
    targetData.lastPlaybackUpdateMs = 0;
    targetData.activeRecordings.clear();

    for (const targetPad of targetData.pads) {
      const sourcePad = sourceData.pads[targetPad.index];
      targetPad.connectedHonkState = null;
      targetPad.clip = this.cloneLooperClip(sourcePad?.clip);
      targetPad.isRecording = false;
      targetPad.isPlaying = false;
      this.disposeWireMesh(targetPad.wireMesh);
      targetPad.wireMesh = null;
    }

    this.setLooperControlValue(targetState, "volume", sourceData.volumeControlValue);
    this.setLooperControlValue(targetState, "speed", sourceData.speedControlValue);
    this.updateLooperVisuals(targetState);
  }

  cloneLooperClip(clip) {
    return LooperAudioEngine.cloneClip(clip);
  }

  getLooperPad(looperState, padIndex) {
    if (!looperState?.looperData) {
      return null;
    }

    return looperState.looperData.pads[padIndex] || null;
  }

  getLooperWireColor(padIndex) {
    return LOOPER_WIRE_COLORS[Math.abs(padIndex) % LOOPER_WIRE_COLORS.length];
  }

  getLooperControlValue(looperState, control) {
    if (!looperState?.looperData) {
      return 0;
    }

    return control === "speed" ? looperState.looperData.speedControlValue : looperState.looperData.volumeControlValue;
  }

  setLooperControlValue(looperState, control, value, updateSphere = true, morphTargetsOverride = null) {
    const data = looperState?.looperData;
    if (!data) {
      return;
    }

    const clamped = THREE.MathUtils.clamp(value, -1, 1);
    if (control === "speed") {
      data.speedControlValue = clamped;
      data.speed = this.getLooperSpeedFromControl(clamped);
    } else {
      data.volumeControlValue = clamped;
      data.volume = this.getLooperVolumeFromControl(clamped);
    }

    this.applyLooperControlMorphValue(looperState, control, clamped, morphTargetsOverride);

    if (updateSphere) {
      const sphere = looperState.hitTargets[getLooperControlName(control)];
      if (sphere?.userData.isLooperControl) {
        this.positionControlColliderFromValue(sphere, clamped);
      }
    }
  }

  getLooperVolumeFromControl(value) {
    return LooperAudioEngine.getVolumeFromControl(value);
  }

  getLooperSpeedFromControl(value) {
    return LooperAudioEngine.getSpeedFromControl(value);
  }

  applyLooperControlMorphValue(looperState, control, value, morphTargetsOverride = null) {
    const morphTargets = morphTargetsOverride || looperState?.hitTargets?.[getLooperControlName(control)]?.userData.looperMorphTargets || LOOPER_CONTROL_MORPH_TARGETS[control];
    if (!looperState?.isLooper || !morphTargets) {
      return;
    }

    const clamped = THREE.MathUtils.clamp(value, -1, 1);
    this.setMorph(morphTargets.up, Math.max(clamped, 0), looperState);
    this.setMorph(morphTargets.down, Math.max(-clamped, 0), looperState);
  }

  copyRecorderState(sourceState, targetState) {
    if (!sourceState?.recorderData || !targetState?.recorderData) {
      return;
    }

    const sourceData = sourceState.recorderData;
    const targetData = targetState.recorderData;
    this.clearRecorderRuntimeState(targetState);
    targetData.events = sourceData.events.map((event) => this.cloneRecorderEvent(event));
    targetData.nextEventId = Math.max(1, sourceData.nextEventId);
    targetData.hasRecording = sourceData.hasRecording;
    targetData.durationMs = sourceData.durationMs;
    targetData.lastRecordedEventEndMs = sourceData.lastRecordedEventEndMs;

    for (const targetChannel of targetData.channels) {
      targetChannel.connectedHonkState = null;
      targetChannel.isRecording = false;
      targetChannel.isPlaying = false;
      this.disposeWireMesh(targetChannel.wireMesh);
      targetChannel.wireMesh = null;
    }

    this.setRecorderControlValue(targetState, "volume", sourceData.volumeControlValue);
    this.setRecorderControlValue(targetState, "speed", sourceData.speedControlValue);
    this.setRecorderControlValue(targetState, "gap", sourceData.gapControlValue);
    this.updateRecorderVisuals(targetState);
  }

  cloneRecorderEvent(event) {
    return LooperAudioEngine.cloneRecorderEvent(event);
  }

  getRecorderChannel(recorderState, channelIndex) {
    if (!recorderState?.recorderData) {
      return null;
    }

    return recorderState.recorderData.channels[channelIndex] || null;
  }

  getRecorderControlValue(recorderState, control) {
    if (!recorderState?.recorderData) {
      return 0;
    }

    if (control === "speed") {
      return recorderState.recorderData.speedControlValue;
    }
    if (control === "gap") {
      return recorderState.recorderData.gapControlValue;
    }
    return recorderState.recorderData.volumeControlValue;
  }

  setRecorderControlValue(recorderState, control, value, updateSphere = true, morphTargetsOverride = null) {
    const data = recorderState?.recorderData;
    if (!data) {
      return;
    }

    const clamped = THREE.MathUtils.clamp(value, -1, 1);
    if (control === "speed") {
      data.speedControlValue = clamped;
      data.speed = this.getLooperSpeedFromControl(clamped);
    } else if (control === "gap") {
      data.gapControlValue = clamped;
      data.loopGapMs = this.getRecorderLoopGapFromControl(clamped);
      if (!data.recording && data.hasRecording) {
        data.durationMs = this.getRecorderLoopDuration(data);
      }
    } else {
      data.volumeControlValue = clamped;
      data.volume = this.getLooperVolumeFromControl(clamped);
    }

    this.applyRecorderControlMorphValue(recorderState, control, clamped, morphTargetsOverride);

    if (updateSphere) {
      const sphere = recorderState.hitTargets[getRecorderControlName(control)];
      if (sphere?.userData.isRecorderControl) {
        this.positionControlColliderFromValue(sphere, clamped);
      }
    }
  }

  applyRecorderControlMorphValue(recorderState, control, value, morphTargetsOverride = null) {
    const morphTargets = morphTargetsOverride || recorderState?.hitTargets?.[getRecorderControlName(control)]?.userData.looperMorphTargets || LOOPER_CONTROL_MORPH_TARGETS[control];
    if (!recorderState?.isRecorder || !morphTargets) {
      return;
    }

    const clamped = THREE.MathUtils.clamp(value, -1, 1);
    this.setMorph(morphTargets.up, Math.max(clamped, 0), recorderState);
    this.setMorph(morphTargets.down, Math.max(-clamped, 0), recorderState);
  }

  setRecorderButtonMorph(recorderState, action, value, morphNameOverride = null) {
    const data = recorderState?.recorderData;
    const morphName = this.getRecorderButtonMorphName(recorderState, action, morphNameOverride);
    if (!data || !morphName) {
      return;
    }

    this.setMorph(morphName, value, recorderState);
    if (value <= 0) {
      data.buttonMorphReleaseTimes?.delete(action);
    }
  }

  getRecorderButtonMorphName(recorderState, action, morphNameOverride = null) {
    return (
      morphNameOverride ||
      recorderState?.hitTargets?.[getRecorderButtonName(action)]?.userData.looperMorphName ||
      LOOPER_BUTTON_MORPH_TARGETS[action]
    );
  }

  triggerRecorderButtonMorph(recorderState, action, now = performance.now(), morphNameOverride = null) {
    const data = recorderState?.recorderData;
    const morphName = this.getRecorderButtonMorphName(recorderState, action, morphNameOverride);
    if (!data || !morphName) {
      return;
    }

    if (!data.buttonMorphReleaseTimes) {
      data.buttonMorphReleaseTimes = new Map();
    }
    this.setMorph(morphName, 1, recorderState);
    data.buttonMorphReleaseTimes.set(action, {
      releaseTimeMs: now + LOOPER_MORPH_SETTINGS.buttonPressDurationMs,
      morphName,
    });
  }

  updateRecorderMorphAnimations(now = performance.now()) {
    for (const recorderState of this.instrumentStates) {
      const data = recorderState.recorderData;
      if (!data || !recorderState.root?.visible) {
        continue;
      }

      this.updateRecorderButtonMorphs(recorderState, now);
      this.updateRecorderPlayingMorph(recorderState, now);
    }
  }

  updateRecorderButtonMorphs(recorderState, now) {
    const data = recorderState?.recorderData;
    if (!data?.buttonMorphReleaseTimes) {
      return;
    }

    for (const [action, releaseEntry] of data.buttonMorphReleaseTimes) {
      const releaseTimeMs =
        typeof releaseEntry === "number" ? releaseEntry : releaseEntry?.releaseTimeMs;
      if (now < releaseTimeMs) {
        continue;
      }

      const morphName =
        typeof releaseEntry === "number" ? LOOPER_BUTTON_MORPH_TARGETS[action] : releaseEntry?.morphName;
      if (morphName) {
        this.setMorph(morphName, 0, recorderState);
      }
      data.buttonMorphReleaseTimes.delete(action);
    }
  }

  updateRecorderPlayingMorph(recorderState, now) {
    const data = recorderState?.recorderData;
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
      data.playingHeadMorphTarget = data.playingHeadMorphValue ?? min;
      data.lastPlayingHeadMorphUpdateMs = now;
    }

    this.setMorph(LOOPER_MORPH_TARGET_NAMES.playingHead, data.playingHeadMorphValue, recorderState);
  }

  getRecorderLoopGapFromControl(value) {
    return LooperAudioEngine.getRecorderLoopGapFromControl(value);
  }

  getRecorderLoopDuration(data) {
    if (!data?.events?.length) {
      return 0;
    }

    return Math.max(data.lastRecordedEventEndMs + data.loopGapMs, RECORDER_MIN_EVENT_DURATION_MS);
  }

  clearRecorderRuntimeState(recorderState) {
    const data = recorderState?.recorderData;
    if (!data) {
      return;
    }

    this.releaseRecorderPlaybackVoices(data);
    for (const channel of data.channels) {
      channel.isRecording = false;
      channel.isPlaying = false;
    }
    data.recording = false;
    data.recordingStarted = false;
    data.playing = false;
    data.paused = false;
    data.timelineStartMs = 0;
    data.playbackElapsedMs = 0;
    data.lastPlaybackUpdateMs = 0;
    data.activeRecordings.clear();
    data.activePlaybackEvents.clear();
    data.buttonMorphReleaseTimes?.clear();
    for (const morphName of Object.values(LOOPER_BUTTON_MORPH_TARGETS)) {
      this.setMorph(morphName, 0, recorderState);
    }
    data.playingHeadMorphValue = 0;
    data.playingHeadMorphTarget = 0;
    data.playingHeadMorphPhase = 0;
    data.lastPlayingHeadMorphUpdateMs = 0;
    data.nextPlayingHeadMorphChangeMs = 0;
    this.setMorph(LOOPER_MORPH_TARGET_NAMES.playingHead, 0, recorderState);
  }

  applyInstrumentVisualScale(state, pulse = state.hornSqueezeValue ? 1 + state.hornSqueezeValue * 0.035 : 1) {
    if (!state?.root) {
      return;
    }

    state.root.scale.setScalar(state.baseScale * pulse);
  }

  getRootUniformScale(root) {
    if (!root) {
      return INSTRUMENT_BASE_SCALE;
    }

    const scale = root.scale;
    return Math.max((Math.abs(scale.x) + Math.abs(scale.y) + Math.abs(scale.z)) / 3, 0.0001);
  }

  updateGripTransform() {
    this.gripTransformSystem?.update();
  }

  updateLooperFollowerTransforms() {
    for (const looperState of this.instrumentStates) {
      const data = looperState.looperData || looperState.recorderData;
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
        const connectedHonks = new Set();
        for (const connection of data.pads || data.channels || []) {
          if (connection.connectedHonkState?.root?.visible) {
            connectedHonks.add(connection.connectedHonkState);
          }
        }

        for (const honkState of connectedHonks) {
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
  }

  isInstrumentStateCurrentlyGripped(instrumentState) {
    for (const controllerState of this.controllerStates.values()) {
      if (controllerState.gripHeld && controllerState.gripInstrumentState === instrumentState) {
        return true;
      }
    }
    return false;
  }

  updateHorn() {
    this.updateAudioListener();

    for (const state of this.instrumentStates) {
      state.hornHolders.clear();
      state.activeBends.clear();
    }

    const activeHoldInteractions = [];
    for (const controller of this.controllers) {
      const controllerState = this.controllerStates.get(controller);
      const interaction = controllerState?.activeTriggerInteraction;
      if (interaction?.type === "holdSqueeze" && interaction.instrumentState?.root?.visible) {
        activeHoldInteractions.push({ interaction, controller });
      }
      const sequencerInteractionActive =
        interaction?.type === "looperWire" ||
        interaction?.type === "looperSilentPad" ||
        interaction?.type === "looperControlDrag" ||
        interaction?.type === "recorderWire" ||
        interaction?.type === "recorderControlDrag";
      const triggerBlockedBySequencer =
        controllerState?.trigger && this.isSequencerColliderTarget(this.getCurrentHit(controller)?.object);
      if (controllerState?.trigger && (sequencerInteractionActive || triggerBlockedBySequencer)) {
        this.releaseRaySqueeze(controllerState);
      }
      if (
        controllerState?.trigger &&
        interaction?.type !== "verticalDragMorph" &&
        !sequencerInteractionActive &&
        !triggerBlockedBySequencer
      ) {
        const raySqueezeInteraction = this.getRaySqueezeInteraction(controller, controllerState);
        if (raySqueezeInteraction) {
          activeHoldInteractions.push({ interaction: raySqueezeInteraction, controller });
        }
      }
    }

    for (const { interaction, controller } of activeHoldInteractions) {
      const chain = this.getTouchingInstrumentChain(interaction.instrumentState);
      const playableChain = chain.filter((chainState) => chainState.interactive);
      const desiredVoiceIds = new Set();
      const bendAmount = this.getControllerRollBend(controller, interaction);

      for (const chainState of playableChain) {
        const voiceId = this.getInstrumentVoiceId(interaction.voiceId, chainState);
        desiredVoiceIds.add(voiceId);
        chainState.hornHolders.add(voiceId);
        chainState.activeBends.set(voiceId, bendAmount);
        this.synth.start(voiceId);
      }

      for (const activeVoiceId of interaction.activeVoiceIds || []) {
        if (!desiredVoiceIds.has(activeVoiceId)) {
          this.synth.resetPitchBend(activeVoiceId);
          this.synth.release(activeVoiceId);
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
      if (!state.interactive) {
        continue;
      }

      state.hornSqueezeValue = THREE.MathUtils.lerp(
        state.hornSqueezeValue,
        state.hornHolders.size > 0 ? 1 : 0,
        SQUEEZE_SENSITIVITY,
      );
      state.morphController.setSqueeze(state.hornSqueezeValue);

      let bendSum = 0;
      for (const value of state.activeBends.values()) {
        bendSum += value;
      }
      state.targetBendValue = state.hornHolders.size > 0 ? THREE.MathUtils.clamp(bendSum, -1, 1) : 0;
      state.bendValue = THREE.MathUtils.lerp(state.bendValue, state.targetBendValue, BEND_SMOOTHING);
      state.morphController.setBend(state.bendValue);
      this.updateBendAlignedColliders(state);

      const pulse = 1 + state.hornSqueezeValue * 0.035;
      this.applyInstrumentVisualScale(state, pulse);
      state.debugVisuals?.update();
    }

    for (const { interaction } of activeHoldInteractions) {
      for (const synthState of interaction.activeChain || []) {
        const voiceId = this.getInstrumentVoiceId(interaction.voiceId, synthState);
        const pitchBendSemitones = synthState.targetBendValue * MAX_PITCH_BEND_SEMITONES;
        this.synth.update({
          voiceId,
          hornAmount: synthState.hornSqueezeValue,
          masterGain: SPATIAL_AUDIO_SETTINGS.masterGain,
          leftEar: synthState.morphController.getEarAmount("left"),
          rightEar: synthState.morphController.getEarAmount("right"),
          nose: synthState.morphController.getValue(MORPH_TARGET_NAMES.nose),
          vowel: synthState.currentVowelLetter === "neutral" ? "A" : synthState.currentVowelLetter,
          pitchBendSemitones,
          pitchSnap: synthState.pitchSnap,
        });
        this.updateInstrumentSpatialVoice(voiceId, synthState);
      }
    }
  }

  updateLooperRecordings(now = performance.now()) {
    for (const looperState of this.instrumentStates) {
      const data = looperState.looperData;
      if (!data?.recording || !looperState.root?.visible) {
        continue;
      }

      for (const pad of data.pads) {
        const honkState = pad.connectedHonkState;
        if (!honkState?.root?.visible) {
          if (data.activeRecordings.has(pad.index)) {
            this.finishLooperPadRecording(looperState, pad, now);
          }
          continue;
        }

        const honkActive = honkState.hornHolders.size > 0;
        const activeRecording = data.activeRecordings.get(pad.index);
        if (honkActive && !activeRecording) {
          this.beginLooperPadRecording(looperState, pad, {
            silent: false,
            startedAtMs: now,
            note: this.captureLooperNoteFromHonk(honkState),
            honkState,
          });
        } else if (!honkActive && activeRecording && !activeRecording.silent) {
          this.finishLooperPadRecording(looperState, pad, now);
        }
      }
    }
  }

  beginLooperPadRecording(looperState, pad, recording) {
    const data = looperState?.looperData;
    if (!data || !pad) {
      return;
    }

    data.activeRecordings.set(pad.index, recording);
    pad.isRecording = true;
    this.updateLooperVisuals(looperState);
  }

  finishLooperPadRecording(looperState, pad, now = performance.now()) {
    const data = looperState?.looperData;
    const recording = data?.activeRecordings.get(pad?.index);
    if (!data || !pad || !recording) {
      return;
    }

    const durationMs = Math.max(now - recording.startedAtMs, LOOPER_MIN_CLIP_DURATION_MS);
    pad.clip = {
      silent: Boolean(recording.silent),
      durationMs,
      note: recording.silent ? null : recording.note || this.captureLooperNoteFromHonk(recording.honkState),
    };
    pad.isRecording = false;
    data.activeRecordings.delete(pad.index);
    this.updateLooperVisuals(looperState);
  }

  stopLooperRecording(looperState) {
    const data = looperState?.looperData;
    if (!data) {
      return;
    }

    const now = performance.now();
    for (const pad of data.pads) {
      if (data.activeRecordings.has(pad.index)) {
        this.finishLooperPadRecording(looperState, pad, now);
      }
      pad.isRecording = false;
    }
    data.recording = false;
  }

  captureLooperNoteFromHonk(honkState) {
    if (!honkState?.interactive) {
      return null;
    }

    return {
      leftEar: honkState.morphController.getEarAmount("left"),
      rightEar: honkState.morphController.getEarAmount("right"),
      nose: honkState.morphController.getValue(MORPH_TARGET_NAMES.nose),
      vowel: honkState.currentVowelLetter === "neutral" ? "A" : honkState.currentVowelLetter,
      pitchBendSemitones: honkState.targetBendValue * MAX_PITCH_BEND_SEMITONES,
      pitchSnap: honkState.pitchSnap,
    };
  }

  startLooperPlayback(looperState) {
    const data = looperState?.looperData;
    if (!data || !this.hasLooperClips(data)) {
      return;
    }

    this.synth.ensureAudio();

    if (data.paused && data.activePadIndex !== null) {
      data.paused = false;
      data.playing = true;
      data.lastPlaybackUpdateMs = performance.now();
      this.restartActiveLooperVoice(looperState);
      return;
    }

    if (!data.playing) {
      data.playing = true;
      data.paused = false;
      data.activePadIndex = null;
      data.activeVoiceId = null;
      data.activeClipElapsedMs = 0;
      data.nextPlaybackPadIndex = 0;
      data.lastPlaybackUpdateMs = performance.now();
    }
  }

  pauseLooperPlayback(looperState) {
    const data = looperState?.looperData;
    if (!data?.playing || data.paused) {
      return;
    }

    this.releaseLooperActiveVoice(data);
    data.paused = true;
    data.playing = false;
  }

  stopLooperPlayback(looperState) {
    const data = looperState?.looperData;
    if (!data) {
      return;
    }

    this.releaseLooperActiveVoice(data);
    if (data.activePadIndex !== null) {
      const pad = data.pads[data.activePadIndex];
      if (pad) {
        pad.isPlaying = false;
      }
    }
    data.playing = false;
    data.paused = false;
    data.activePadIndex = null;
    data.activeVoiceId = null;
    data.activeClipElapsedMs = 0;
    data.nextPlaybackPadIndex = 0;
  }

  updateLooperPlayback(now = performance.now()) {
    for (const looperState of this.instrumentStates) {
      const data = looperState.looperData;
      if (!data?.playing || data.paused || !looperState.root?.visible) {
        continue;
      }

      if (!this.hasLooperClips(data)) {
        this.stopLooperPlayback(looperState);
        continue;
      }

      if (data.activePadIndex === null) {
        this.startNextLooperClip(looperState, now);
        continue;
      }

      const pad = data.pads[data.activePadIndex];
      const clip = pad?.clip;
      if (!clip) {
        this.startNextLooperClip(looperState, now);
        continue;
      }

      const deltaMs = Math.max(now - data.lastPlaybackUpdateMs, 0);
      data.lastPlaybackUpdateMs = now;
      data.activeClipElapsedMs += deltaMs * data.speed;

      if (data.activeClipElapsedMs >= clip.durationMs) {
        this.finishActiveLooperClip(looperState);
        data.nextPlaybackPadIndex = (pad.index + 1) % data.pads.length;
        this.startNextLooperClip(looperState, now);
        continue;
      }

      this.updateLooperActiveVoice(looperState);
    }
  }

  hasLooperClips(data) {
    return Boolean(data?.pads.some((pad) => pad.clip));
  }

  startNextLooperClip(looperState, now = performance.now()) {
    const data = looperState?.looperData;
    const nextIndex = this.findNextLooperClipIndex(data, data?.nextPlaybackPadIndex ?? 0);
    if (nextIndex === null) {
      this.stopLooperPlayback(looperState);
      return;
    }

    this.finishActiveLooperClip(looperState);
    const pad = data.pads[nextIndex];
    pad.isPlaying = true;
    data.activePadIndex = nextIndex;
    data.activeClipElapsedMs = 0;
    data.lastPlaybackUpdateMs = now;
    data.nextPlaybackPadIndex = (nextIndex + 1) % data.pads.length;

    if (!pad.clip.silent) {
      data.activeVoiceId = this.getLooperVoiceId(looperState, pad.index);
      this.synth.start(data.activeVoiceId);
      this.updateLooperActiveVoice(looperState);
    } else {
      data.activeVoiceId = null;
    }
  }

  findNextLooperClipIndex(data, startIndex) {
    if (!data?.pads.length) {
      return null;
    }

    for (let offset = 0; offset < data.pads.length; offset += 1) {
      const index = (startIndex + offset) % data.pads.length;
      if (data.pads[index].clip) {
        return index;
      }
    }
    return null;
  }

  finishActiveLooperClip(looperState) {
    const data = looperState?.looperData;
    if (!data) {
      return;
    }

    this.releaseLooperActiveVoice(data);
    if (data.activePadIndex !== null) {
      const pad = data.pads[data.activePadIndex];
      if (pad) {
        pad.isPlaying = false;
      }
    }
    data.activePadIndex = null;
    data.activeVoiceId = null;
    data.activeClipElapsedMs = 0;
  }

  restartActiveLooperVoice(looperState) {
    const data = looperState?.looperData;
    const pad = data && data.activePadIndex !== null ? data.pads[data.activePadIndex] : null;
    if (!pad?.clip || pad.clip.silent) {
      return;
    }

    data.activeVoiceId = this.getLooperVoiceId(looperState, pad.index);
    this.synth.start(data.activeVoiceId);
    this.updateLooperActiveVoice(looperState);
  }

  updateLooperActiveVoice(looperState) {
    const data = looperState?.looperData;
    const pad = data && data.activePadIndex !== null ? data.pads[data.activePadIndex] : null;
    const clip = pad?.clip;
    const note = clip?.note;
    if (!data?.activeVoiceId || !note || clip.silent) {
      return;
    }

    this.synth.update({
      voiceId: data.activeVoiceId,
      hornAmount: 1,
      masterGain: SPATIAL_AUDIO_SETTINGS.masterGain * data.volume,
      leftEar: note.leftEar,
      rightEar: note.rightEar,
      nose: note.nose,
      vowel: note.vowel || "A",
      pitchBendSemitones: note.pitchBendSemitones || 0,
      pitchSnap: note.pitchSnap,
    });

    const spatialState = pad.connectedHonkState?.root?.visible ? pad.connectedHonkState : looperState;
    if (spatialState !== looperState) {
      this.applySequencerPlaybackToHonk(spatialState, data.activeVoiceId, note);
    }
    this.updateInstrumentSpatialVoice(data.activeVoiceId, spatialState);
  }

  updateSequencerPlaybackSqueezeVisuals() {
    const activePlaybackHonks = this.getActiveSequencerPlaybackHonks();

    for (const state of this.instrumentStates) {
      if (!state.interactive || !state.root?.visible) {
        continue;
      }

      const hasSequencerPlayback = activePlaybackHonks.has(state) || this.hasSequencerPlaybackHolder(state);
      if (!hasSequencerPlayback) {
        continue;
      }

      const target = 1;
      state.sequencerSqueezeValue = THREE.MathUtils.lerp(
        state.sequencerSqueezeValue || 0,
        target,
        SQUEEZE_SENSITIVITY,
      );
      if (target === 0 && state.sequencerSqueezeValue < 0.001) {
        state.sequencerSqueezeValue = 0;
      }

      const visualSqueeze = Math.max(state.hornSqueezeValue || 0, state.sequencerSqueezeValue);
      state.morphController.setSqueeze(visualSqueeze);

      let bendSum = 0;
      for (const value of state.activeBends.values()) {
        bendSum += value;
      }
      state.targetBendValue = state.hornHolders.size > 0 ? THREE.MathUtils.clamp(bendSum, -1, 1) : 0;
      state.bendValue = THREE.MathUtils.lerp(state.bendValue, state.targetBendValue, BEND_SMOOTHING);
      state.morphController.setBend(state.bendValue);
      this.updateBendAlignedColliders(state);

      this.applyInstrumentVisualScale(state, 1 + visualSqueeze * 0.035);
      state.debugVisuals?.update();
    }
  }

  hasSequencerPlaybackHolder(state) {
    for (const voiceId of state?.hornHolders || []) {
      if (String(voiceId).startsWith("recorder-") || String(voiceId).startsWith("looper-")) {
        return true;
      }
    }
    return false;
  }

  getActiveSequencerPlaybackHonks() {
    const activeHonks = new Set();

    for (const looperState of this.instrumentStates) {
      const data = looperState.looperData;
      if (!data?.playing || data.paused || !looperState.root?.visible) {
        continue;
      }

      for (const pad of data.pads) {
        const honkState = pad.connectedHonkState;
        if (pad.isPlaying && !pad.clip?.silent && honkState?.interactive && honkState.root?.visible) {
          activeHonks.add(honkState);
        }
      }
    }

    for (const recorderState of this.instrumentStates) {
      const data = recorderState.recorderData;
      if (!data?.playing || data.paused || !recorderState.root?.visible) {
        continue;
      }

      for (const channel of data.channels) {
        const honkState = channel.connectedHonkState;
        if (channel.isPlaying && honkState?.interactive && honkState.root?.visible) {
          activeHonks.add(honkState);
        }
      }
    }

    return activeHonks;
  }

  releaseLooperActiveVoice(data) {
    if (!data?.activeVoiceId) {
      return;
    }

    this.synth.resetPitchBend(data.activeVoiceId);
    this.synth.release(data.activeVoiceId);
    data.activeVoiceId = null;
  }

  getLooperVoiceId(looperState, padIndex) {
    return `looper-${looperState.id}:pad-${padIndex}`;
  }

  startRecorderRecording(recorderState) {
    const data = recorderState?.recorderData;
    if (!data) {
      return;
    }

    this.stopRecorderPlayback(recorderState);
    data.events.length = 0;
    data.nextEventId = 1;
    data.recording = true;
    data.recordingStarted = false;
    data.hasRecording = false;
    data.durationMs = 0;
    data.timelineStartMs = 0;
    data.lastRecordedEventEndMs = 0;
    data.playbackElapsedMs = 0;
    data.activeRecordings.clear();
    for (const channel of data.channels) {
      channel.isRecording = false;
      channel.isPlaying = false;
    }
  }

  updateRecorderRecordings(now = performance.now()) {
    for (const recorderState of this.instrumentStates) {
      const data = recorderState.recorderData;
      if (!data?.recording || !recorderState.root?.visible) {
        continue;
      }

      for (const channel of data.channels) {
        const honkState = channel.connectedHonkState;
        const activeRecording = data.activeRecordings.get(channel.index);
        const honkActive = Boolean(honkState?.root?.visible && honkState.hornHolders.size > 0);

        if (!honkActive) {
          if (activeRecording) {
            this.finishRecorderChannelRecording(recorderState, channel, now);
          }
          continue;
        }

        if (!activeRecording) {
          this.beginRecorderChannelRecording(recorderState, channel, honkState, now);
        } else {
          this.sampleRecorderChannelRecording(activeRecording, now);
        }
      }
    }
  }

  beginRecorderChannelRecording(recorderState, channel, honkState, now) {
    const data = recorderState?.recorderData;
    if (!data || !channel || !honkState) {
      return;
    }

    if (!data.recordingStarted) {
      data.recordingStarted = true;
      data.timelineStartMs = now;
    }

    const event = {
      id: data.nextEventId,
      channelIndex: channel.index,
      startMs: Math.max(now - data.timelineStartMs, 0),
      durationMs: 0,
      samples: [],
    };
    data.nextEventId += 1;
    data.events.push(event);

    const recording = {
      startedAtMs: now,
      event,
      honkState,
    };
    data.activeRecordings.set(channel.index, recording);
    channel.isRecording = true;
    this.sampleRecorderChannelRecording(recording, now);
  }

  sampleRecorderChannelRecording(recording, now) {
    if (!recording?.event || !recording.honkState?.root?.visible) {
      return;
    }

    recording.event.samples.push(
      this.captureRecorderSampleFromHonk(recording.honkState, Math.max(now - recording.startedAtMs, 0)),
    );
  }

  finishRecorderChannelRecording(recorderState, channel, now = performance.now()) {
    const data = recorderState?.recorderData;
    const recording = data?.activeRecordings.get(channel?.index);
    if (!data || !channel || !recording) {
      return;
    }

    this.sampleRecorderChannelRecording(recording, now);
    const durationMs = Math.max(now - recording.startedAtMs, RECORDER_MIN_EVENT_DURATION_MS);
    recording.event.durationMs = durationMs;
    data.lastRecordedEventEndMs = Math.max(data.lastRecordedEventEndMs, recording.event.startMs + durationMs);
    data.durationMs = this.getRecorderLoopDuration(data);
    data.hasRecording = data.events.length > 0 && data.durationMs > 0;
    data.activeRecordings.delete(channel.index);
    channel.isRecording = false;
  }

  stopRecorderRecording(recorderState) {
    const data = recorderState?.recorderData;
    if (!data?.recording) {
      return;
    }

    const now = performance.now();
    for (const channel of data.channels) {
      if (data.activeRecordings.has(channel.index)) {
        this.finishRecorderChannelRecording(recorderState, channel, now);
      }
      channel.isRecording = false;
    }

    data.recording = false;
    data.recordingStarted = false;
    data.durationMs = this.getRecorderLoopDuration(data);
    data.hasRecording = data.events.length > 0 && data.durationMs > 0;
    data.playbackElapsedMs = 0;
    data.paused = false;
  }

  captureRecorderSampleFromHonk(honkState, offsetMs) {
    return {
      offsetMs,
      leftEar: honkState.morphController.getEarAmount("left"),
      rightEar: honkState.morphController.getEarAmount("right"),
      nose: honkState.morphController.getValue(MORPH_TARGET_NAMES.nose),
      vowel: honkState.currentVowelLetter === "neutral" ? "A" : honkState.currentVowelLetter,
      pitchBendSemitones: honkState.targetBendValue * MAX_PITCH_BEND_SEMITONES,
      pitchSnap: honkState.pitchSnap,
    };
  }

  startRecorderPlayback(recorderState) {
    const data = recorderState?.recorderData;
    if (!data?.hasRecording || data.recording || data.durationMs <= 0) {
      return;
    }

    this.synth.ensureAudio();

    if (!data.paused) {
      this.releaseRecorderPlaybackVoices(data);
      data.playbackElapsedMs = 0;
    }

    data.playing = true;
    data.paused = false;
    data.lastPlaybackUpdateMs = performance.now();
  }

  pauseRecorderPlayback(recorderState) {
    const data = recorderState?.recorderData;
    if (!data?.playing || data.paused) {
      return;
    }

    this.releaseRecorderPlaybackVoices(data);
    data.playing = false;
    data.paused = true;
  }

  stopRecorderPlayback(recorderState) {
    const data = recorderState?.recorderData;
    if (!data) {
      return;
    }

    this.releaseRecorderPlaybackVoices(data);
    data.playing = false;
    data.paused = false;
    data.playbackElapsedMs = 0;
    data.lastPlaybackUpdateMs = 0;
  }

  updateRecorderPlayback(now = performance.now()) {
    for (const recorderState of this.instrumentStates) {
      const data = recorderState.recorderData;
      if (!data?.playing || data.paused || !data.hasRecording || data.durationMs <= 0 || !recorderState.root?.visible) {
        continue;
      }

      const deltaMs = Math.max(now - data.lastPlaybackUpdateMs, 0);
      data.lastPlaybackUpdateMs = now;
      let nextElapsedMs = data.playbackElapsedMs + deltaMs * data.speed;
      if (nextElapsedMs >= data.durationMs) {
        nextElapsedMs %= data.durationMs;
        this.releaseRecorderPlaybackVoices(data);
      }
      data.playbackElapsedMs = nextElapsedMs;
      this.updateRecorderPlaybackEvents(recorderState, nextElapsedMs);
    }
  }

  updateRecorderPlaybackEvents(recorderState, elapsedMs) {
    const data = recorderState?.recorderData;
    if (!data) {
      return;
    }

    for (const channel of data.channels) {
      channel.isPlaying = false;
    }

    const activeEventIds = new Set();
    for (const event of data.events) {
      if (elapsedMs < event.startMs || elapsedMs >= event.startMs + event.durationMs) {
        continue;
      }

      activeEventIds.add(event.id);
      const channel = data.channels[event.channelIndex];
      if (channel) {
        channel.isPlaying = true;
      }

      const sample = this.getRecorderSampleAt(event, elapsedMs - event.startMs);
      if (!sample) {
        continue;
      }

      this.updateRecorderPlaybackEventVoices(recorderState, event, channel, sample);
    }

    for (const [eventId, voiceIds] of data.activePlaybackEvents) {
      if (!activeEventIds.has(eventId)) {
        this.releaseRecorderPlaybackVoiceIds(voiceIds);
        data.activePlaybackEvents.delete(eventId);
      }
    }
  }

  updateRecorderPlaybackEventVoices(recorderState, event, channel, sample) {
    const data = recorderState?.recorderData;
    if (!data) {
      return;
    }

    const previousVoiceIds = data.activePlaybackEvents.get(event.id);
    const activeVoiceIds = previousVoiceIds instanceof Set
      ? previousVoiceIds
      : new Set(previousVoiceIds ? [previousVoiceIds] : []);
    const desiredVoiceIds = new Set();
    const connectedHonkState =
      channel?.connectedHonkState?.interactive && channel.connectedHonkState.root?.visible
        ? channel.connectedHonkState
        : null;
    const playbackChain = connectedHonkState
      ? this.getTouchingInstrumentChain(connectedHonkState).filter((state) => state.interactive)
      : [];

    if (playbackChain.length === 0) {
      const voiceId = this.getRecorderVoiceId(recorderState, event.id);
      desiredVoiceIds.add(voiceId);
      this.synth.start(voiceId);
      this.updateRecorderPlaybackVoice(voiceId, sample, recorderState, sample.pitchSnap, data.volume);
    } else {
      for (const synthState of playbackChain) {
        const voiceId = this.getRecorderVoiceId(recorderState, event.id, synthState);
        desiredVoiceIds.add(voiceId);
        this.synth.start(voiceId);
        this.applySequencerPlaybackToHonk(synthState, voiceId, sample);
        this.updateRecorderPlaybackVoice(
          voiceId,
          sample,
          synthState,
          synthState.pitchSnap || sample.pitchSnap,
          data.volume,
        );
      }
    }

    for (const voiceId of activeVoiceIds) {
      if (!desiredVoiceIds.has(voiceId)) {
        this.releaseSynthVoice(voiceId);
      }
    }

    data.activePlaybackEvents.set(event.id, desiredVoiceIds);
  }

  updateRecorderPlaybackVoice(voiceId, sample, spatialState, pitchSnap, volume) {
    this.synth.update({
      voiceId,
      hornAmount: 1,
      masterGain: SPATIAL_AUDIO_SETTINGS.masterGain * volume,
      leftEar: sample.leftEar,
      rightEar: sample.rightEar,
      nose: sample.nose,
      vowel: sample.vowel || "A",
      pitchBendSemitones: sample.pitchBendSemitones || 0,
      pitchSnap,
    });

    this.updateInstrumentSpatialVoice(voiceId, spatialState);
  }

  applySequencerPlaybackToHonk(honkState, voiceId, sample) {
    if (!honkState?.interactive) {
      return;
    }

    const bendAmount = THREE.MathUtils.clamp(
      (sample.pitchBendSemitones || 0) / Math.max(MAX_PITCH_BEND_SEMITONES, 0.0001),
      -1,
      1,
    );
    honkState.hornHolders.add(voiceId);
    honkState.activeBends.set(voiceId, bendAmount);
  }

  getRecorderSampleAt(event, offsetMs) {
    let selected = event.samples[0] || null;
    for (const sample of event.samples) {
      if (sample.offsetMs > offsetMs) {
        break;
      }
      selected = sample;
    }
    return selected;
  }

  releaseRecorderPlaybackVoices(data) {
    if (!data) {
      return;
    }

    for (const voiceIds of data.activePlaybackEvents.values()) {
      this.releaseRecorderPlaybackVoiceIds(voiceIds);
    }
    data.activePlaybackEvents.clear();
    for (const channel of data.channels || []) {
      channel.isPlaying = false;
    }
  }

  releaseRecorderPlaybackVoiceIds(voiceIds) {
    if (voiceIds instanceof Set) {
      for (const voiceId of voiceIds) {
        this.releaseSynthVoice(voiceId);
      }
      return;
    }

    if (voiceIds) {
      this.releaseSynthVoice(voiceIds);
    }
  }

  releaseSynthVoice(voiceId) {
    this.synth.resetPitchBend(voiceId);
    this.synth.release(voiceId);
  }

  getRecorderVoiceId(recorderState, eventId, instrumentState = null) {
    const instrumentSuffix = instrumentState ? `:instrument-${instrumentState.id}` : "";
    return `recorder-${recorderState.id}:event-${eventId}${instrumentSuffix}`;
  }

  connectLooperPadToHonk(looperState, padIndex, honkState) {
    const pad = this.getLooperPad(looperState, padIndex);
    if (!pad || !honkState?.interactive) {
      return;
    }

    pad.connectedHonkState = honkState;
    this.updateLooperWireForPad(looperState, pad);
    this.updateLooperVisuals(looperState);
  }

  disconnectLooperPad(looperState, padIndex) {
    const pad = this.getLooperPad(looperState, padIndex);
    if (!pad) {
      return;
    }

    pad.connectedHonkState = null;
    pad.isRecording = false;
    looperState.looperData?.activeRecordings.delete(pad.index);
    this.disposeWireMesh(pad.wireMesh);
    pad.wireMesh = null;
    this.updateLooperVisuals(looperState);
  }

  connectRecorderChannelToHonk(recorderState, channelIndex, honkState) {
    const channel = this.getRecorderChannel(recorderState, channelIndex);
    if (!channel || !honkState?.interactive) {
      return;
    }

    channel.connectedHonkState = honkState;
    this.updateRecorderWireForChannel(recorderState, channel);
    this.updateRecorderVisuals(recorderState);
  }

  disconnectRecorderChannel(recorderState, channelIndex) {
    const channel = this.getRecorderChannel(recorderState, channelIndex);
    if (!channel) {
      return;
    }

    if (recorderState.recorderData?.activeRecordings.has(channel.index)) {
      this.finishRecorderChannelRecording(recorderState, channel, performance.now());
    }
    channel.connectedHonkState = null;
    channel.isRecording = false;
    this.disposeWireMesh(channel.wireMesh);
    channel.wireMesh = null;
    this.updateRecorderVisuals(recorderState);
  }

  updateLooperWires() {
    for (const looperState of this.instrumentStates) {
      const data = looperState.looperData;
      if (!data || !looperState.root?.visible) {
        continue;
      }

      for (const pad of data.pads) {
        if (!pad.connectedHonkState?.root?.visible) {
          if (pad.wireMesh) {
            this.disposeWireMesh(pad.wireMesh);
            pad.wireMesh = null;
          }
          continue;
        }
        this.updateLooperWireForPad(looperState, pad);
      }
    }
  }

  updateLooperWireForPad(looperState, pad) {
    if (!pad?.nodeTarget || !pad.connectedHonkState?.root?.visible) {
      return;
    }

    const honkTarget = pad.connectedHonkState.hitTargets?.[HONK_CONNECTION_TARGET_NAME];
    if (!honkTarget) {
      return;
    }

    if (!pad.wireMesh) {
      const color = this.getLooperWireColor(pad.index);
      pad.wireMesh = new THREE.Mesh(new THREE.BufferGeometry(), this.createLooperWireMaterial(color));
      pad.wireMesh.name = `LOOPER_wire_${looperState.id}_${pad.index}`;
      pad.wireMesh.renderOrder = 14;
      this.scene.add(pad.wireMesh);
    }

    pad.nodeTarget.getWorldPosition(tempWireStart);
    honkTarget.getWorldPosition(tempWireEnd);
    this.updateWireMeshGeometry(pad.wireMesh, tempWireStart, tempWireEnd);
  }

  updateRecorderWires() {
    for (const recorderState of this.instrumentStates) {
      const data = recorderState.recorderData;
      if (!data || !recorderState.root?.visible) {
        continue;
      }

      for (const channel of data.channels) {
        if (!channel.connectedHonkState?.root?.visible) {
          if (channel.wireMesh) {
            this.disposeWireMesh(channel.wireMesh);
            channel.wireMesh = null;
          }
          continue;
        }
        this.updateRecorderWireForChannel(recorderState, channel);
      }
    }
  }

  updateRecorderWireForChannel(recorderState, channel) {
    if (!channel?.nodeTarget || !channel.connectedHonkState?.root?.visible) {
      return;
    }

    const honkTarget = channel.connectedHonkState.hitTargets?.[HONK_CONNECTION_TARGET_NAME];
    if (!honkTarget) {
      return;
    }

    if (!channel.wireMesh) {
      const color = this.getLooperWireColor(channel.index);
      channel.wireMesh = new THREE.Mesh(new THREE.BufferGeometry(), this.createLooperWireMaterial(color));
      channel.wireMesh.name = `RECORDER_wire_${recorderState.id}_${channel.index}`;
      channel.wireMesh.renderOrder = 14;
      this.scene.add(channel.wireMesh);
    }

    channel.nodeTarget.getWorldPosition(tempWireStart);
    honkTarget.getWorldPosition(tempWireEnd);
    this.updateWireMeshGeometry(channel.wireMesh, tempWireStart, tempWireEnd);
  }

  createLooperWireMaterial(color) {
    return createWireMaterial(color, this.instrumentMaterialTextures);
  }

  updateWireMeshGeometry(wireMesh, start, end) {
    updateWireMeshGeometryUtility(wireMesh, start, end, {
      segments: LOOPER_WIRE_SEGMENTS,
      radius: LOOPER_WIRE_RADIUS,
    });
  }

  disposeWireMesh(wireMesh) {
    disposeWireMeshUtility(wireMesh);
  }

  cleanupLooperReferencesForDeletedInstrument(instrumentState) {
    for (const controllerState of this.controllerStates.values()) {
      const interaction = controllerState.activeTriggerInteraction;
      if (interaction?.looperState === instrumentState) {
        if (interaction.type === "looperWire") {
          this.disposeWireMesh(interaction.wireMesh);
        }
        controllerState.activeTriggerInteraction = null;
      }
      if (interaction?.recorderState === instrumentState) {
        if (interaction.type === "recorderWire") {
          this.disposeWireMesh(interaction.wireMesh);
        }
        controllerState.activeTriggerInteraction = null;
      }
    }

    if (instrumentState?.isLooper) {
      this.stopLooperRecording(instrumentState);
      this.stopLooperPlayback(instrumentState);
      for (const pad of instrumentState.looperData?.pads || []) {
        this.disposeWireMesh(pad.wireMesh);
        pad.wireMesh = null;
      }
      this.synth.releaseMatchingVoiceIds((voiceId) => voiceId.startsWith(`looper-${instrumentState.id}:`));
      return;
    }

    if (instrumentState?.isRecorder) {
      this.stopRecorderRecording(instrumentState);
      this.stopRecorderPlayback(instrumentState);
      for (const channel of instrumentState.recorderData?.channels || []) {
        this.disposeWireMesh(channel.wireMesh);
        channel.wireMesh = null;
      }
      this.synth.releaseMatchingVoiceIds((voiceId) => voiceId.startsWith(`recorder-${instrumentState.id}:`));
      return;
    }

    for (const looperState of this.instrumentStates) {
      const data = looperState.looperData;
      if (!data || looperState === instrumentState) {
        continue;
      }

      for (const pad of data.pads) {
        if (pad.connectedHonkState === instrumentState) {
          this.disconnectLooperPad(looperState, pad.index);
        }
      }
    }

    for (const recorderState of this.instrumentStates) {
      const data = recorderState.recorderData;
      if (!data || recorderState === instrumentState) {
        continue;
      }

      for (const channel of data.channels) {
        if (channel.connectedHonkState === instrumentState) {
          this.disconnectRecorderChannel(recorderState, channel.index);
        }
      }
    }
  }

  updateAllLooperVisuals() {
    for (const state of this.instrumentStates) {
      if (state.isLooper) {
        this.updateLooperVisuals(state);
      }
    }
  }

  updateLooperVisuals(looperState) {
    const data = looperState?.looperData;
    if (!data) {
      return;
    }

    for (const action of LOOPER_BUTTON_ACTIONS) {
      const target = looperState.hitTargets[getLooperButtonName(action)];
      const active =
        (action === "record" && data.recording) ||
        (action === "play" && data.playing && !data.paused) ||
        (action === "pause" && data.paused) ||
        (action === "stop" && !data.playing && !data.paused && !data.recording);
      this.setHitTargetDebugColor(
        target,
        active ? LOOPER_DEBUG_COLORS.buttonActive : LOOPER_DEBUG_COLORS.button[action],
        active ? 0.48 : LOOPER_COLLIDER_OPACITY,
      );
    }

    for (const pad of data.pads) {
      let padColor = LOOPER_DEBUG_COLORS.padEmpty;
      if (pad.isRecording) {
        padColor = LOOPER_DEBUG_COLORS.padRecording;
      } else if (pad.isPlaying) {
        padColor = LOOPER_DEBUG_COLORS.padPlaying;
      } else if (pad.clip?.silent) {
        padColor = LOOPER_DEBUG_COLORS.padSilent;
      } else if (pad.clip) {
        padColor = LOOPER_DEBUG_COLORS.padRecorded;
      }

      this.setHitTargetDebugColor(pad.padTarget, padColor, pad.isRecording || pad.isPlaying ? 0.55 : LOOPER_COLLIDER_OPACITY);

      const nodeColor = pad.connectedHonkState ? this.getLooperWireColor(pad.index) : LOOPER_DEBUG_COLORS.nodeOpen;
      this.setHitTargetDebugColor(pad.nodeTarget, nodeColor, pad.connectedHonkState ? 0.5 : LOOPER_COLLIDER_OPACITY);
    }

    this.setHitTargetDebugColor(
      looperState.hitTargets[getLooperControlName("volume")],
      LOOPER_DEBUG_COLORS.controlVolume,
      LOOPER_COLLIDER_OPACITY,
    );
    this.setHitTargetDebugColor(
      looperState.hitTargets[getLooperControlName("speed")],
      LOOPER_DEBUG_COLORS.controlSpeed,
      LOOPER_COLLIDER_OPACITY,
    );
  }

  updateAllRecorderVisuals() {
    for (const state of this.instrumentStates) {
      if (state.isRecorder) {
        this.updateRecorderVisuals(state);
      }
    }
  }

  updateRecorderVisuals(recorderState) {
    const data = recorderState?.recorderData;
    if (!data) {
      return;
    }

    for (const action of LOOPER_BUTTON_ACTIONS) {
      const target = recorderState.hitTargets[getRecorderButtonName(action)];
      const active =
        (action === "record" && data.recording) ||
        (action === "play" && data.playing && !data.paused) ||
        (action === "pause" && data.paused) ||
        (action === "stop" && !data.playing && !data.paused && !data.recording);
      this.setHitTargetDebugColor(
        target,
        active ? LOOPER_DEBUG_COLORS.buttonActive : LOOPER_DEBUG_COLORS.button[action],
        active ? 0.48 : LOOPER_COLLIDER_OPACITY,
      );
    }

    for (const channel of data.channels) {
      let nodeColor = channel.connectedHonkState ? this.getLooperWireColor(channel.index) : LOOPER_DEBUG_COLORS.recorderNodeOpen;
      let opacity = channel.connectedHonkState ? 0.5 : LOOPER_COLLIDER_OPACITY;
      if (channel.isRecording) {
        nodeColor = LOOPER_DEBUG_COLORS.recorderRecording;
        opacity = 0.58;
      } else if (channel.isPlaying) {
        nodeColor = LOOPER_DEBUG_COLORS.recorderPlaying;
        opacity = 0.58;
      } else if (data.hasRecording && channel.connectedHonkState) {
        nodeColor = LOOPER_DEBUG_COLORS.recorderRecorded;
        opacity = 0.5;
      }
      this.setHitTargetDebugColor(channel.nodeTarget, nodeColor, opacity);
    }

    this.setHitTargetDebugColor(
      recorderState.hitTargets[getRecorderControlName("volume")],
      LOOPER_DEBUG_COLORS.controlVolume,
      LOOPER_COLLIDER_OPACITY,
    );
    this.setHitTargetDebugColor(
      recorderState.hitTargets[getRecorderControlName("gap")],
      LOOPER_DEBUG_COLORS.controlGap,
      LOOPER_COLLIDER_OPACITY,
    );
    this.setHitTargetDebugColor(
      recorderState.hitTargets[getRecorderControlName("speed")],
      LOOPER_DEBUG_COLORS.controlSpeed,
      LOOPER_COLLIDER_OPACITY,
    );
  }

  setHitTargetDebugColor(target, color, opacity = null) {
    if (!target?.material) {
      return;
    }

    target.userData.currentHitColor = color;
    target.material.color.setHex(color);
    if (typeof opacity === "number") {
      target.userData.baseHitOpacity = opacity;
      target.material.opacity = opacity;
    }
  }

  getRaySqueezeInteraction(controller, controllerState) {
    const gripInstrumentState =
      controllerState.gripHeld &&
      controllerState.gripInstrumentState?.interactive &&
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
    if (!gripInstrumentState && lockedInstrumentState?.interactive && lockedInstrumentState.root?.visible) {
      if (controllerState.raySqueezeInstrumentState !== lockedInstrumentState) {
        this.resetRaySqueezeReference(controller, controllerState);
      }
      controllerState.raySqueezeInstrumentState = lockedInstrumentState;
      this.activeInstrumentState = lockedInstrumentState;
    }

    const hit = this.getCurrentHit(controller);
    const targetName = hit?.object?.name;
    const config = INTERACTION_MAP[targetName];
    const hitInstrumentState = hit?.object?.userData.instrumentState;
    if (
      !gripInstrumentState &&
      !lockedInstrumentState &&
      config?.type === "holdSqueeze" &&
      hitInstrumentState?.interactive &&
      hitInstrumentState.root?.visible
    ) {
      if (controllerState.raySqueezeInstrumentState !== hitInstrumentState) {
        this.resetRaySqueezeReference(controller, controllerState);
      }
      controllerState.raySqueezeInstrumentState = hitInstrumentState;
      this.activeInstrumentState = hitInstrumentState;
    }

    const instrumentState = controllerState.raySqueezeInstrumentState;
    if (!instrumentState?.interactive || !instrumentState.root?.visible) {
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
  }

  updateBendAlignedColliders(state) {
    if (!state.bendAlignedColliderGroup) {
      return;
    }

    state.bendAlignedColliderGroup.rotation.z =
      state.bendValue * THREE.MathUtils.degToRad(BEND_COLLIDER_ROTATION_DEGREES);
  }

  getControllerRollBend(controller, interaction) {
    controller.updateMatrixWorld(true);
    controller.getWorldQuaternion(tempBendQuaternion);
    tempBendQuaternion.premultiply(interaction.bendStartInverseQuaternion);
    tempBendEuler.setFromQuaternion(tempBendQuaternion, "XYZ");
    return THREE.MathUtils.clamp(tempBendEuler.z * BEND_SENSITIVITY, -1, 1);
  }

  updateAudioListener() {
    const userCamera = this.getUserCamera();
    userCamera.updateMatrixWorld(true);
    userCamera.getWorldPosition(tempAudioPosition);
    userCamera.getWorldDirection(tempAudioForward).normalize();
    tempAudioUp.set(0, 1, 0).applyQuaternion(userCamera.getWorldQuaternion(tempQuaternion)).normalize();

    this.synth.updateListener({
      position: tempAudioPosition,
      forward: tempAudioForward,
      up: tempAudioUp,
    });
  }

  updateInstrumentSpatialVoice(voiceId, instrumentState) {
    instrumentState.root.updateWorldMatrix(true, true);
    instrumentState.root.getWorldPosition(tempAudioPosition);
    tempAudioForward.set(0, 0, 1).applyQuaternion(instrumentState.root.getWorldQuaternion(tempQuaternion)).normalize();

    this.synth.updateSpatial(voiceId, {
      position: tempAudioPosition,
      orientation: tempAudioForward,
      settings: SPATIAL_AUDIO_SETTINGS,
    });
  }

  getTouchingInstrumentChain(startState) {
    const chain = [];
    const visited = new Set();
    const queue = [startState];

    while (queue.length > 0) {
      const state = queue.shift();
      if (!state || visited.has(state) || !state.root.visible) {
        continue;
      }

      visited.add(state);
      chain.push(state);

      for (const otherState of this.instrumentStates) {
        if (visited.has(otherState) || otherState === state || !otherState.root.visible) {
          continue;
        }

        if (this.areInstrumentBodyCollidersTouching(state, otherState)) {
          queue.push(otherState);
        }
      }
    }

    return chain;
  }

  areInstrumentBodyCollidersTouching(firstState, secondState) {
    this.setSqueezeColliderBounds(firstState, tempBoxA);
    this.setSqueezeColliderBounds(secondState, tempBoxB);
    if (tempBoxA.isEmpty() || tempBoxB.isEmpty()) {
      return false;
    }

    tempBox.copy(tempBoxA).intersect(tempBoxB);
    if (tempBox.isEmpty()) {
      return false;
    }

    const overlapVolume = this.getBoxVolume(tempBox);
    const smallerColliderVolume = Math.min(this.getBoxVolume(tempBoxA), this.getBoxVolume(tempBoxB));
    if (smallerColliderVolume <= 0) {
      return false;
    }

    const requiredOverlap = THREE.MathUtils.clamp(SQUEEZE_COLLIDER_MIN_OVERLAP, 0, 1);
    return overlapVolume / smallerColliderVolume >= requiredOverlap;
  }

  getBoxVolume(box) {
    if (!box || box.isEmpty()) {
      return 0;
    }

    box.getSize(tempBoxSize);
    return Math.max(tempBoxSize.x, 0) * Math.max(tempBoxSize.y, 0) * Math.max(tempBoxSize.z, 0);
  }

  setSqueezeColliderBounds(state, targetBox) {
    targetBox.makeEmpty();
    const squeezeCollider = state?.hitTargets?.[INTERACTION_TARGET_NAMES.horn];
    if (!squeezeCollider) {
      return targetBox;
    }

    squeezeCollider.updateWorldMatrix(true, false);
    targetBox.setFromObject(squeezeCollider);
    return targetBox;
  }

  updateRaycastHover() {
    for (const controller of this.controllers) {
      const controllerState = this.controllerStates.get(controller);
      const hit = this.getCurrentHit(controller);
      const nextTarget = hit?.object?.userData.isHitTarget ? hit.object : null;

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
          nextTarget?.userData.isProceduralMorphTarget ||
            nextTarget?.userData.isHonkConnectionTarget ||
            this.isSequencerColliderTarget(nextTarget)
            ? RAY_COLOR_SPHERE_HOVER
            : RAY_COLOR_DEFAULT,
        );
      }
    }
  }

  setTargetHighlight(target, highlighted) {
    if (!target?.material) {
      return;
    }

    const baseOpacity =
      typeof target.userData.baseHitOpacity === "number" ? target.userData.baseHitOpacity : HIT_MARKER_OPACITY;
    target.material.opacity = highlighted ? Math.max(baseOpacity, 0.52) : baseOpacity;
    target.material.transparent = true;
    target.material.depthWrite = false;
    if (target.name === INTERACTION_TARGET_NAMES.body && target.userData.instrumentState?.locked) {
      target.material.color.setHex(0x45f6ff);
      target.material.opacity = Math.max(HIT_MARKER_OPACITY, 0.08);
      return;
    }
    target.material.color.setHex(highlighted ? 0xffffff : getHitTargetColor(target));
  }

  isSequencerColliderTarget(target) {
    return Boolean(target?.userData.isLooperCollider || target?.userData.isRecorderCollider);
  }

  getPointedInstrumentState(controller) {
    const hit = this.getGripHit(controller) || this.getCurrentHit(controller);
    const instrumentState = hit?.object?.userData.instrumentState;
    if (instrumentState?.root?.visible) {
      return instrumentState;
    }

    return this.getLockedInstrumentStateFromRay(controller);
  }

  getLockedInstrumentStateFromRay(controller) {
    return this.raycastSystem.getLockedInstrumentStateFromRay(controller);
  }

  getGripHit(controller) {
    return this.raycastSystem.getGripHit(controller);
  }

  updateLockVisual(instrumentState) {
    const bodyTarget = instrumentState?.hitTargets?.[INTERACTION_TARGET_NAMES.body];
    if (!bodyTarget?.material) {
      return;
    }

    bodyTarget.material.color.setHex(instrumentState.locked ? 0x45f6ff : getHitTargetColor(bodyTarget.name));
    bodyTarget.material.opacity = Math.max(HIT_MARKER_OPACITY, instrumentState.locked ? 0.08 : 0);
  }

  getCurrentHit(controller) {
    return this.raycastSystem.getCurrentHit(controller);
  }

  setRaycasterFromController(controller) {
    this.raycastSystem.setFromController(controller);
  }

  getMorphValue(morphName, state = this.activeInstrumentState) {
    if (!state) {
      return 0;
    }
    return state.morphController.getValue(morphName);
  }

  setMorph(morphName, value, state = this.activeInstrumentState) {
    if (!state) {
      return;
    }
    state.morphController.setMorph(morphName, value);
  }

  createNoteLabel(state) {
    if (!NOTE_LABEL_SETTINGS.enabled || !this.noteFont || !state?.interactive) {
      return;
    }

    const group = new THREE.Group();
    group.name = "NOTE_label";
    group.userData.isNoteLabel = true;
    this.applyNoteLabelTransform(group);
    state.root.add(group);
    state.noteLabelGroup = group;
    this.updateNoteLabel(state);
  }

  applyNoteLabelTransform(group) {
    const position = NOTE_LABEL_SETTINGS.position || {};
    const rotationDegrees = NOTE_LABEL_SETTINGS.rotationDegrees || {};
    const scale = NOTE_LABEL_SETTINGS.scale || {};

    group.position.set(position.x ?? 0, position.y ?? 0, position.z ?? 0);
    group.rotation.set(
      THREE.MathUtils.degToRad(rotationDegrees.x ?? 0),
      THREE.MathUtils.degToRad(rotationDegrees.y ?? 0),
      THREE.MathUtils.degToRad(rotationDegrees.z ?? 0),
    );
    group.scale.set(scale.x ?? 1, scale.y ?? 1, scale.z ?? 1);
  }

  updateNoteLabel(state) {
    if (!NOTE_LABEL_SETTINGS.enabled || !this.noteFont || !state?.noteLabelGroup) {
      return;
    }

    const labelText = this.getNoteLabelText(state);
    if (labelText === state.noteLabelTextValue) {
      return;
    }

    if (state.noteLabelMesh) {
      this.disposeNoteLabelMesh(state.noteLabelMesh);
      state.noteLabelMesh = null;
    }

    const geometry = new TextGeometry(labelText, {
      font: this.noteFont,
      size: NOTE_LABEL_SETTINGS.size,
      depth: NOTE_LABEL_SETTINGS.depth,
      curveSegments: NOTE_LABEL_SETTINGS.curveSegments,
    });
    geometry.computeBoundingBox();
    const bounds = geometry.boundingBox;
    if (bounds) {
      const centerX = (bounds.min.x + bounds.max.x) * 0.5;
      const centerY = (bounds.min.y + bounds.max.y) * 0.5;
      geometry.translate(-centerX, -centerY, 0);
    }
    geometry.userData.disposeOnInstrumentDelete = true;

    const material = new THREE.MeshStandardMaterial({
      color: NOTE_LABEL_SETTINGS.color,
      roughness: 0.36,
      metalness: 0.02,
      side: THREE.DoubleSide,
    });
    material.userData.disposeOnInstrumentDelete = true;

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = "NOTE_label_text";
    mesh.userData.isNoteLabel = true;
    mesh.castShadow = true;
    mesh.renderOrder = 30;
    state.noteLabelGroup.add(mesh);
    state.noteLabelMesh = mesh;
    state.noteLabelTextValue = labelText;
  }

  disposeNoteLabelMesh(mesh) {
    mesh.removeFromParent();
    mesh.geometry?.dispose?.();
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      material?.dispose?.();
    }
  }

  getNoteLabelText(state) {
    const leftEar = state.morphController.getEarAmount("left");
    const rightEar = state.morphController.getEarAmount("right");
    const pitchSemitones = this.getPitchSemitonesFromLeftEar(leftEar, state.pitchSnap);
    const octave = THREE.MathUtils.mapLinear(THREE.MathUtils.clamp(rightEar, -1, 1), -1, 1, 2, 6);
    const midi = Math.round(F4_MIDI_NOTE + pitchSemitones + (octave - 4) * 12);
    const noteIndex = THREE.MathUtils.euclideanModulo(midi, CHROMATIC_NOTE_NAMES.length);
    const octaveNumber = Math.floor(midi / 12) - 1;
    const noteName = state.scalePresetNote || CHROMATIC_NOTE_NAMES[noteIndex];
    return NOTE_LABEL_SETTINGS.showOctave ? `${noteName}${octaveNumber}` : noteName;
  }

  getPitchSemitonesFromLeftEar(leftEar, pitchSnap = null) {
    const pitchControl = THREE.MathUtils.clamp(leftEar, -1, 1);
    const rawPitchSemitones =
      pitchControl < 0
        ? THREE.MathUtils.mapLinear(pitchControl, -1, 0, -5, 0)
        : THREE.MathUtils.mapLinear(pitchControl, 0, 1, 0, 7);
    const snapSteps = PITCH_SNAP_STEPS[pitchSnap];
    if (!snapSteps) {
      return rawPitchSemitones;
    }
    return snapSteps.reduce((closest, step) =>
      Math.abs(step - rawPitchSemitones) < Math.abs(closest - rawPitchSemitones) ? step : closest,
    snapSteps[0]);
  }

  setVowel(vowelMorphName, state = this.activeInstrumentState) {
    if (!state) {
      return;
    }

    const vowelLetter = VOWEL_LETTERS_BY_MORPH[vowelMorphName] || null;
    state.morphController.setVowel(vowelLetter);

    state.currentVowelIndex = VOWEL_MORPHS.indexOf(vowelMorphName);
    state.currentVowelLetter = vowelLetter || "neutral";
    this.currentVowelIndex = state.currentVowelIndex;
    this.currentVowelLetter = state.currentVowelLetter;
    this.synth.setVowel(state.currentVowelLetter === "neutral" ? "A" : state.currentVowelLetter);
  }

  cycleVowel(state = this.activeInstrumentState) {
    if (!state) {
      return;
    }

    const vowelLetter = state.morphController.cycleVowel();
    const vowelMorphName = MORPH_TARGET_NAMES.vowels[vowelLetter];
    state.currentVowelIndex = VOWEL_MORPHS.indexOf(vowelMorphName);
    state.currentVowelLetter = vowelLetter;
    this.currentVowelIndex = state.currentVowelIndex;
    this.currentVowelLetter = state.currentVowelLetter;
    this.synth.setVowel(vowelLetter);
  }

  spawnInstrumentInFrontOfCamera() {
    this.spawnComponentInFrontOfCamera("honk");
  }

  spawnComponentInFrontOfCamera(componentId) {
    const componentOption = this.componentTemplates.get(componentId);
    if (componentOption?.preset === "cMajorScale") {
      this.spawnScalePreset(C_MAJOR_SCALE_PRESET, "Honk");
      return;
    }
    if (componentOption?.preset === "fNaturalMinorScale") {
      this.spawnScalePreset(F_NATURAL_MINOR_SCALE_PRESET, "HonkFm");
      return;
    }

    const component = this.createSpawnedComponent(componentId);
    if (!component) {
      return;
    }

    this.positionObjectInFrontOfCamera(component, SPAWN_DISTANCE);
    this.setInstrumentBaseScale(this.activeInstrumentState, INSTRUMENT_BASE_SCALE);
  }

  spawnScalePreset(scalePreset, namePrefix = "Honk") {
    const userCamera = this.getUserCamera();
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
    const firstOffset = -((scalePreset.length - 1) * SCALE_PRESET_SPACING) * 0.5;

    for (const [index, note] of scalePreset.entries()) {
      const instrument = this.createSpawnedComponent("honk");
      if (!instrument) {
        continue;
      }

      instrument.name = `${namePrefix}_${note.label}_${index + 1}`;
      instrument.position.copy(rowCenter).addScaledVector(tempSpawnRight, firstOffset + index * SCALE_PRESET_SPACING);
      this.setInstrumentBaseScale(this.activeInstrumentState, INSTRUMENT_BASE_SCALE);

      tempSpawnTarget.copy(tempVector);
      tempSpawnTarget.y = instrument.position.y;
      instrument.lookAt(tempSpawnTarget);

      this.applyScalePresetNote(this.activeInstrumentState, note);
    }
  }

  applyScalePresetNote(state, note) {
    if (!state?.interactive) {
      return;
    }

    const pitchAmount =
      note.semitonesFromF < 0 ? note.semitonesFromF / 5 : note.semitonesFromF / 7;
    const octaveAmount = THREE.MathUtils.clamp((note.octaveOffset || 0) / 2, -1, 1);
    state.scalePresetNote = note.label;
    state.morphController.setEar("left", pitchAmount);
    state.morphController.setEar("right", octaveAmount);

    const leftEar = state.hitTargets[INTERACTION_TARGET_NAMES.leftEar];
    const rightEar = state.hitTargets[INTERACTION_TARGET_NAMES.rightEar];
    if (leftEar?.userData.isProceduralMorphTarget) {
      this.setSpherePositionFromSignedValue(leftEar, pitchAmount);
    }
    if (rightEar?.userData.isProceduralMorphTarget) {
      this.setSpherePositionFromSignedValue(rightEar, octaveAmount);
    }
    this.updateNoteLabel(state);
  }

  spawnDefaultInstrumentPreview() {
    if (!this.instrumentTemplate || this.instrumentStates.length > 0) {
      return;
    }

    const defaultComponentId = this.componentTemplates.has(LOOPER_COMPONENT_ID) ? LOOPER_COMPONENT_ID : "honk";
    const instrument = this.createSpawnedComponent(defaultComponentId);
    if (!instrument) {
      return;
    }
    this.positionObjectInFrontOfCamera(instrument, DEFAULT_INSTRUMENT_DISTANCE);
    instrument.position.y -=
      defaultComponentId === LOOPER_COMPONENT_ID || defaultComponentId === LEGACY_LOOPER_COMPONENT_ID ? 0.18 : 0.38;
    this.setInstrumentBaseScale(this.activeInstrumentState, INSTRUMENT_BASE_SCALE);
  }

  createSpawnedInstrument() {
    return this.createSpawnedComponent("honk");
  }

  createSpawnedComponent(componentId) {
    const componentOption = this.componentTemplates.get(componentId) || this.componentTemplates.get("honk");
    if (!componentOption?.template) {
      return null;
    }

    const instrument = cloneSkeletonAware(componentOption.template);
    instrument.name = `${componentOption.label || "Component"}_${this.instrumentStates.length + 1}`;
    instrument.visible = true;
    instrument.userData.componentId = componentOption.id;
    instrument.traverse((object) => {
      delete object.userData.instrumentState;
    });
    this.scene.add(instrument);

    const state = this.createInstrumentState(instrument);
    state.componentId = componentOption.id;
    state.componentLabel = componentOption.label;
    state.interactive = componentOption.interactive;
    state.pitchSnap = componentOption.pitchSnap || null;
    const sceneObject = createInstrumentObject({
      root: instrument,
      state,
      componentOption,
      synth: this.synth,
      disposeResources: (instrumentState) => this.disposeInstrumentResources(instrumentState),
    });
    sceneObject.attachTo(this.scene);
    if (state.interactive) {
      this.initializeInstrumentState(state);
      this.createNoteLabel(state);
      sceneObject.registerStateColliders();
    }
    if (componentOption.id === RECORDER_COMPONENT_ID) {
      this.initializeRecorderState(state);
    } else if (componentOption.id === LEGACY_LOOPER_COMPONENT_ID) {
      this.initializeLooperState(state);
    }
    this.instrumentStates.push(state);
    this.activeInstrumentState = state;
    this.setInstrumentBaseScale(state, INSTRUMENT_BASE_SCALE);

    return instrument;
  }

  positionObjectInFrontOfCamera(object, distance) {
    const userCamera = this.getUserCamera();
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
  }

  getUserCamera() {
    if (this.renderer.xr.isPresenting) {
      return this.renderer.xr.getCamera(this.camera);
    }
    return this.camera;
  }
}
