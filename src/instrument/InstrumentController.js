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
  DEBUG_SHOW_COLLIDERS,
  DEBUG_SHOW_RAYS,
  DEFAULT_INSTRUMENT_DISTANCE,
  EAR_DRAG_SENSITIVITY,
  INSTRUMENT_BASE_SCALE,
  INSTRUMENT_MAX_SCALE,
  INSTRUMENT_MIN_SCALE,
  INSTRUMENT_SCALE_STEP,
  INSTRUMENT_TEXTURE_PATHS,
  HONK_CONNECTION_TARGET_NAME,
  LOOPER_BUTTON_MORPH_TARGETS,
  LOOPER_BUTTON_ACTIONS,
  LOOPER_COLLIDER_OPACITY,
  LOOPER_CONTROL_MORPH_TARGETS,
  LOOPER_COMPONENT_ID,
  LOOPER_DEBUG_COLORS,
  LOOPER_MIN_ACTION_DURATION_MS,
  LOOPER_MORPH_SETTINGS,
  LOOPER_MORPH_TARGET_NAMES,
  LOOPER_SHAKE_DISCONNECT_SETTINGS,
  LOOPER_TEXTURE_PATHS,
  LOOPER_TRACK_COUNT,
  LOOPER_WIRE_COLORS,
  LOOPER_WIRE_RADIUS,
  LOOPER_WIRE_SEGMENTS,
  INTERACTION_TARGET_NAMES,
  MAX_PITCH_BEND_SEMITONES,
  MODEL_PATH,
  MORPH_TARGET_NAMES,
  NOTE_LABEL_SETTINGS,
  NOSE_DRAG_SENSITIVITY,
  RAYCAST_HAPTICS,
  SHOW_INSTRUCTION_PANEL,
  HONK_MASTER_GAIN,
  SPAWN_COMPONENT_OPTIONS,
  SPAWN_DISTANCE,
  SPAWN_Y_OFFSET,
  SQUEEZE_SENSITIVITY,
  STICK_SETTINGS,
  STICK_PERCUSSION_TYPES,
  STICK_TEXTURE_PATHS,
} from "../config.js";
import { LooperAudioEngine } from "../audio/LooperAudioEngine.js";
import { XRControllerManager } from "../input/XRControllerManager.js";
import { GripTransformSystem } from "../interaction/GripTransformSystem.js";
import { RaycastInteractionSystem } from "../interaction/RaycastInteractionSystem.js";
import {
  createBodyGripTarget as createBodyGripTargetObject,
  createHonkConnectionTarget as createHonkConnectionTargetObject,
  createLooperColliders as createLooperColliderTargets,
  createMorphTargetSpheres as createMorphTargetSphereColliders,
} from "../instruments/colliderBuilders.js";
import { createInstrumentObject } from "../instruments/instrumentFactory.js";
import {
  getLooperButtonName,
  getLooperControlName,
  getLooperNodeName,
} from "../instruments/looperNames.js";
import { HonkPerformanceState } from "../honk/HonkPerformanceState.js";
import { LooperController } from "../looper/LooperController.js";
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
const CONTROLLER_RAY_LENGTH = 1.6;
const RAY_COLOR_DEFAULT = 0xf6d878;
const RAY_COLOR_SPHERE_HOVER = 0x45f6ff;
const PENDING_SPAWN_DISTANCE = SPAWN_DISTANCE;
const PENDING_SPAWN_GLASS_COLOR = 0xd8f8ff;
const PENDING_SPAWN_GLASS_OPACITY = 0.34;
const PENDING_SPAWN_RENDER_ORDER = 60;
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
const F_SHARP_NATURAL_MINOR_SCALE_PRESET = [
  { label: "F#", semitonesFromF: 1 },
  { label: "G#", semitonesFromF: 3 },
  { label: "A", semitonesFromF: 4 },
  { label: "B", semitonesFromF: 6 },
  { label: "C#", semitonesFromF: -4, octaveOffset: 1 },
  { label: "D", semitonesFromF: -3, octaveOffset: 1 },
  { label: "E", semitonesFromF: -1, octaveOffset: 1 },
  { label: "F#", semitonesFromF: 1, octaveOffset: 1 },
];
const C_MAJOR_CHORD_PRESET = [
  { label: "C", semitonesFromF: -5 },
  { label: "E", semitonesFromF: -1 },
  { label: "G", semitonesFromF: 2 },
];
const G_MAJOR_CHORD_PRESET = [
  { label: "G", semitonesFromF: 2 },
  { label: "B", semitonesFromF: 6 },
  { label: "D", semitonesFromF: -3, octaveOffset: 1 },
];
const F_MAJOR_CHORD_PRESET = [
  { label: "F", semitonesFromF: 0 },
  { label: "A", semitonesFromF: 4 },
  { label: "C", semitonesFromF: -5, octaveOffset: 1 },
];
const A_MINOR_CHORD_PRESET = [
  { label: "A", semitonesFromF: 4 },
  { label: "C", semitonesFromF: -5, octaveOffset: 1 },
  { label: "E", semitonesFromF: -1, octaveOffset: 1 },
];
const SPAWN_PRESETS = {
  cMajorScale: { notes: C_MAJOR_SCALE_PRESET, namePrefix: "Honk" },
  fNaturalMinorScale: { notes: F_NATURAL_MINOR_SCALE_PRESET, namePrefix: "HonkFm" },
  fSharpNaturalMinorScale: { notes: F_SHARP_NATURAL_MINOR_SCALE_PRESET, namePrefix: "HonkFSharpMinor" },
  cMajorChord: { notes: C_MAJOR_CHORD_PRESET, namePrefix: "CMaj" },
  gMajorChord: { notes: G_MAJOR_CHORD_PRESET, namePrefix: "GMaj" },
  fMajorChord: { notes: F_MAJOR_CHORD_PRESET, namePrefix: "FMaj" },
  aMinorChord: { notes: A_MINOR_CHORD_PRESET, namePrefix: "AMin" },
};
const F_NATURAL_MINOR_SNAP_STEPS_FROM_F = [-5, -4, -2, 0, 2, 3, 5, 7];
const SCALE_PRESET_SPACING = 0.32;
const CHROMATIC_NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const F4_MIDI_NOTE = 65;
const CHORD_SQUEEZE_SPHERE_MIN_INTERSECTION = 0.2;
const DEFAULT_STICK_COLLISION_MAX_USER_DISTANCE = 2.25;
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
const tempLooperPreviousPosition = new THREE.Vector3();
const tempLooperCurrentPosition = new THREE.Vector3();
const tempLooperDeltaQuaternion = new THREE.Quaternion();
const tempLooperCurrentQuaternion = new THREE.Quaternion();
const tempLooperPreviousQuaternion = new THREE.Quaternion();
const tempWireStart = new THREE.Vector3();
const tempWireEnd = new THREE.Vector3();
const tempControlDragPosition = new THREE.Vector3();
const tempChordLeaderPosition = new THREE.Vector3();
const tempChordFollowerPosition = new THREE.Vector3();
const tempChordLeaderQuaternion = new THREE.Quaternion();
const tempChordFollowerQuaternion = new THREE.Quaternion();
const tempChordInverseQuaternion = new THREE.Quaternion();
const tempSqueezeSphereA = new THREE.Sphere();
const tempSqueezeSphereB = new THREE.Sphere();
const tempSqueezeColliderScale = new THREE.Vector3();
const tempShakePosition = new THREE.Vector3();
const tempShakeBounds = new THREE.Box3();
const tempShakeRange = new THREE.Vector3();
const tempStickColliderBounds = new THREE.Box3();
const tempStickColliderLocalBounds = new THREE.Box3();
const tempStickColliderInverseMatrix = new THREE.Matrix4();
const tempStickTargetBounds = new THREE.Box3();
const tempStickTargetToColliderMatrix = new THREE.Matrix4();
const tempStickTriangle = new THREE.Triangle();
const tempStickUserPosition = new THREE.Vector3();

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
    if (object.isMesh && object.userData.isBodyGripTarget) {
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
  if (name?.startsWith("HIT_looper_node_")) {
    return LOOPER_DEBUG_COLORS.nodeOpen;
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
    [getLooperControlName("gap")]: LOOPER_DEBUG_COLORS.controlGap,
    [getLooperControlName("speed")]: LOOPER_DEBUG_COLORS.controlSpeed,
  }[name] || 0xffffff;
}

function makePendingSpawnGlassMaterial(sourceMaterial = null) {
  const normalScale = sourceMaterial?.normalScale?.clone?.() || new THREE.Vector2(0.18, 0.18);
  normalScale.multiplyScalar(0.45);

  const material = new THREE.MeshPhysicalMaterial({
    name: "PendingSpawnGlass",
    color: PENDING_SPAWN_GLASS_COLOR,
    metalness: 0,
    roughness: 0.035,
    transmission: 0.82,
    thickness: 0.12,
    ior: 1.48,
    attenuationColor: new THREE.Color(0xc6f5ff),
    attenuationDistance: 0.7,
    clearcoat: 1,
    clearcoatRoughness: 0.03,
    transparent: true,
    opacity: PENDING_SPAWN_GLASS_OPACITY,
    side: sourceMaterial?.side ?? THREE.DoubleSide,
    depthWrite: false,
    depthTest: true,
    normalMap: sourceMaterial?.normalMap || null,
    normalScale,
    envMapIntensity: 1.25,
    toneMapped: sourceMaterial?.toneMapped ?? true,
  });
  material.userData.disposeOnPendingSpawnRestore = true;
  material.userData.disposeOnInstrumentDelete = true;
  return material;
}

function disposeMaterialOrMaterials(materialOrMaterials) {
  const materials = Array.isArray(materialOrMaterials) ? materialOrMaterials : [materialOrMaterials];
  for (const material of materials) {
    if (material?.userData.disposeOnPendingSpawnRestore) {
      material.dispose();
    }
  }
}

function getConfigNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function setScaleFromConfig(targetScale, configValue = 1) {
  if (typeof configValue === "number") {
    targetScale.setScalar(configValue);
    return;
  }

  targetScale.set(
    getConfigNumber(configValue?.x, 1),
    getConfigNumber(configValue?.y, 1),
    getConfigNumber(configValue?.z, 1),
  );
}

function applyLocalTransformFromConfig(object, config = {}) {
  object.position.set(
    getConfigNumber(config.position?.x, 0),
    getConfigNumber(config.position?.y, 0),
    getConfigNumber(config.position?.z, 0),
  );
  object.rotation.set(
    THREE.MathUtils.degToRad(getConfigNumber(config.rotationDegrees?.x, 0)),
    THREE.MathUtils.degToRad(getConfigNumber(config.rotationDegrees?.y, 0)),
    THREE.MathUtils.degToRad(getConfigNumber(config.rotationDegrees?.z, 0)),
  );
  setScaleFromConfig(object.scale, config.size ?? config.scale ?? 1);
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
    this.raycaster.far = CONTROLLER_RAY_LENGTH;
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
      isLooperColliderTarget: (target) => this.isLooperColliderTarget(target),
      isLockableInstrumentState: (state) => this.isLockableInstrumentState(state),
      debugRaycast: DEBUG_RAYCAST,
    });
    this.radialSpawnMenu = new RadialSpawnMenu();
    this.instructionPanelView = null;
    this.looperController = new LooperController({
      ensureAudio: () => this.synth.ensureAudio(),
      captureAction: (honkState) => this.captureLooperActionFromHonk(honkState),
      getConnectedHonk: (track) => track.connectedHonkState,
      getPlaybackTargets: (track, connectedHonkState) =>
        this.getLooperPlaybackHonkTargets(connectedHonkState || track.connectedHonkState),
      getHonkTargetId: (honkState) => honkState?.id,
      isPlayableHonk: (honkState) => Boolean(honkState?.interactive && honkState.root?.visible),
      getAutomationLayerId: (looperState, track) => this.getLooperAutomationLayerId(looperState, track),
      getActionVoiceId: (looperState, track, honkState) =>
        this.getLooperActionVoiceId(looperState, track, honkState),
      setAutomationLayer: (honkState, layerId, snapshot) =>
        this.setHonkAutomationLayer(honkState, layerId, snapshot),
      clearAutomationLayer: (honkState, layerId) => this.clearHonkAutomationLayer(honkState, layerId),
      startActionVoice: (voiceId) => this.synth.start(voiceId),
      releaseActionVoice: (voiceId) => this.releaseSynthVoice(voiceId),
      updateActionVoice: (voiceId, honkState, snapshot, volume) =>
        this.updateLooperActionVoice(voiceId, honkState, snapshot, volume),
      playStickPercussion: (drumType, options) => this.playStickPercussion(drumType, options),
      updateWireForTrack: (looperState, track) => this.updateLooperWireForTrack(looperState, track),
      disposeWireMesh: (wireMesh) => this.disposeWireMesh(wireMesh),
      updateVisuals: (looperState) => this.updateLooperVisuals(looperState),
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
    this.nextInstrumentId = 1;
    this.nextChordLockOrder = 1;
    this.instrumentStates = [];
    this.activeInstrumentState = null;
    this.pendingSpawnPlacement = null;

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
    await this.loadStick();
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
      getTransformTargetState: (state) => this.getLockedChordTransformTargetState(state),
      adjustInstrumentBaseScale: (state, delta) => this.adjustInstrumentBaseScale(state, delta),
    });
  }

  createRayLine() {
    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, -CONTROLLER_RAY_LENGTH),
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

  createStickObject() {
    if (!this.stickTemplate) {
      return null;
    }

    const stick = new THREE.Group();
    stick.name = "HeldStick";
    stick.visible = false;
    stick.userData.isHeldStick = true;
    applyLocalTransformFromConfig(stick, STICK_SETTINGS);

    const model = cloneSkeletonAware(this.stickTemplate);
    model.name = "HeldStickModel";
    model.visible = true;
    stick.add(model);

    const collider = this.createStickCollider();
    if (collider) {
      stick.add(collider);
      stick.userData.stickCollider = collider;
    }

    return stick;
  }

  createStickCollider() {
    const colliderSettings = STICK_SETTINGS.collider;
    if (!colliderSettings?.enabled) {
      return null;
    }

    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshBasicMaterial({
      color: colliderSettings.color ?? 0xf7d04a,
      transparent: true,
      opacity: DEBUG_SHOW_COLLIDERS ? colliderSettings.opacity ?? 0.28 : 0,
      depthWrite: false,
      wireframe: DEBUG_SHOW_COLLIDERS,
    });
    const collider = new THREE.Mesh(geometry, material);
    collider.name = "STICK_collider";
    collider.renderOrder = colliderSettings.renderOrder ?? 32;
    collider.userData.isStickCollider = true;
    collider.userData.baseHitOpacity = DEBUG_SHOW_COLLIDERS ? colliderSettings.opacity ?? 0.28 : 0;
    applyLocalTransformFromConfig(collider, {
      position: colliderSettings.position,
      rotationDegrees: colliderSettings.rotationDegrees,
      scale: colliderSettings.scale,
    });
    return collider;
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

  async loadStick() {
    if (!STICK_SETTINGS.enabled || !STICK_SETTINGS.modelPath) {
      return;
    }

    try {
      const gltf = await this.loader.loadAsync(STICK_SETTINGS.modelPath);
      this.stickMaterialTextures = await loadMaterialTextureSet(this.textureLoader, STICK_TEXTURE_PATHS);
      this.stickTemplate = gltf.scene;
      this.stickTemplate.name = "StickTemplate";
      this.stickTemplate.visible = false;
      applyStandardInstrumentMaterials(this.stickTemplate, this.stickMaterialTextures);
    } catch (error) {
      console.warn("Could not load stick model:", error);
      this.stickTemplate = null;
    }
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
    if (option.id === LOOPER_COMPONENT_ID) {
      applyStandardInstrumentMaterials(template, await this.loadLooperMaterialTextures());
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
      baseScale: this.getRootUniformScale(root),
      locked: false,
      lockedTextureApplied: false,
      chordLockOrder: null,
      chordLeaderState: null,
      chordFollowerStates: new Set(),
      chordAttachmentOffset: new THREE.Vector3(),
      chordAttachmentQuaternion: new THREE.Quaternion(),
      chordAttachmentBaseScaleRatio: 1,
      bendValue: 0,
      targetBendValue: 0,
      activeBends: new Map(),
      performanceState: new HonkPerformanceState(),
      noteLabelGroup: null,
      noteLabelMesh: null,
      noteLabelTextValue: null,
    };
    state.bendAlignedColliderGroup = root.getObjectByName(BEND_ALIGNED_COLLIDER_GROUP_NAME) || null;
    state.morphController = new MorphTargetController(root, {
      warnMissingExpectedMorphs: this.hasExpectedHonkMorphs(morphMeshes),
    });
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

  initializeInstrumentState(state) {
    state.morphController.resetAll();
    this.setVowel(null, state);
    state.performanceState?.setLiveState({
      squeeze: 0,
      bend: 0,
      earLeft: 0,
      earRight: 0,
      nose: 0,
      vowel: "neutral",
    });
    for (const sphere of this.getProceduralMorphTargetSpheres(state)) {
      this.setSpherePositionFromSignedValue(sphere, 0);
    }
  }

  initializeLooperState(state) {
    state.isLooper = true;
    state.looperData = this.looperController.createStateData(state, {
      trackCount: LOOPER_TRACK_COUNT,
    });

    state.root.updateMatrixWorld(true);
    state.root.getWorldPosition(state.looperData.lastPosition);
    state.root.getWorldQuaternion(state.looperData.lastQuaternion);

    this.setLooperControlValue(state, "volume", 0);
    this.setLooperControlValue(state, "gap", -1);
    this.setLooperControlValue(state, "speed", 0);
    this.updateLooperVisuals(state);
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
    this.deletePendingSpawnPlacement();

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
      this.deactivateStick(controller);

      state.trigger = false;
      state.grip = false;
      state.a = false;
      state.b = false;
      state.x = false;
      state.y = false;
      state.thumbstickScaleDirection = 0;
      state.hoveredTarget = null;
      state.raycastContactTarget = null;
      state.activeTriggerInteraction = null;
      state.suppressTriggerUntilRelease = false;
      state.gripHeld = false;
      state.gripInstrumentState = null;
      state.stickActive = false;
      state.stickCollider = null;
      state.stickContactKeys?.clear();
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
      state.performanceState?.setLiveState({ squeeze: 0, bend: 0 });
      if (state.isLooper) {
        this.stopPlayback(state);
      }
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
    const hadPendingSpawnPlacement = Boolean(this.pendingSpawnPlacement);
    this.pollControllers();
    if (this.pendingSpawnPlacement) {
      this.updatePendingSpawnPreview();
      this.updateLooperPlaybackDuringPendingSpawn(time);
      return;
    }
    if (hadPendingSpawnPlacement) {
      return;
    }
    this.updateRadialMenus();
    this.updateRaycastHover();
    this.updateTriggerInteraction();
    this.updateGripTransform();
    this.updateLooperFollowerTransforms();
    this.updateLockedChordFollowerTransforms();
    this.updateStickPercussionContacts(time);
    this.updateShakeDisconnect(time);
    this.updateHorn(time);
    this.updateLooperRecordings();
    this.updateLooperMorphAnimations();
    this.updateLooperWires();
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

  getControllerGamepad(controller) {
    return controller?.userData?.gamepad || this.findGamepad(controller?.userData?.handedness);
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
    if (this.pendingSpawnPlacement) {
      return;
    }

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
    if (this.pendingSpawnPlacement) {
      return;
    }

    const state = this.controllerStates.get(controller);
    if (!state?.radialMenuOpen) {
      return;
    }

    const selectedIndex = this.radialSpawnMenu.getSelectedIndex(controller, state);
    const selectedOption = SPAWN_COMPONENT_OPTIONS[selectedIndex];
    const cancelled = state.radialMenuCancelled;
    this.closeRadialMenu(controller);

    if (!cancelled && selectedOption) {
      this.beginPendingSpawnPlacement(controller, selectedOption.id);
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

  beginPendingSpawnPlacement(controller, componentId) {
    if (!controller) {
      return;
    }

    this.deletePendingSpawnPlacement();
    const created = this.createPendingSpawnComponents(componentId);
    if (!created?.states?.length) {
      return;
    }

    this.disableInteractionsForPendingSpawn();

    const group = new THREE.Group();
    group.name = "PendingSpawnPlacement";
    group.userData.isPendingSpawnPlacement = true;
    controller.add(group);

    const firstOffset = -((created.states.length - 1) * SCALE_PRESET_SPACING) * 0.5;
    for (const [index, state] of created.states.entries()) {
      const root = state.root;
      if (!root) {
        continue;
      }

      group.add(root);
      root.position.set(firstOffset + index * SCALE_PRESET_SPACING, 0, -PENDING_SPAWN_DISTANCE);
      root.rotation.set(0, 0, 0);
      root.updateMatrixWorld(true);
      root.userData.pendingPlacement = true;
      state.pendingPlacement = true;
      state.locked = false;
      this.applyPendingSpawnVisuals(state);
    }

    this.pendingSpawnPlacement = {
      controller,
      group,
      states: created.states,
      thumbstickScaleDirection: 0,
    };
  }

  createPendingSpawnComponents(componentId) {
    const componentOption = this.componentTemplates.get(componentId) || this.componentTemplates.get("honk");
    const preset = SPAWN_PRESETS[componentOption?.preset];
    if (preset) {
      return this.createPendingSpawnScalePreset(preset.notes, preset.namePrefix);
    }

    const root = this.createSpawnedComponent(componentId);
    const state = this.activeInstrumentState;
    if (!root || !state) {
      return null;
    }

    this.setInstrumentBaseScale(state, INSTRUMENT_BASE_SCALE);
    return { states: [state] };
  }

  createPendingSpawnScalePreset(scalePreset, namePrefix = "Honk") {
    const states = [];
    for (const [index, note] of scalePreset.entries()) {
      const root = this.createSpawnedComponent("honk");
      const state = this.activeInstrumentState;
      if (!root || !state) {
        continue;
      }

      root.name = `${namePrefix}_${note.label}_${index + 1}`;
      this.setInstrumentBaseScale(state, INSTRUMENT_BASE_SCALE);
      this.applyScalePresetNote(state, note);
      states.push(state);
    }

    return { states };
  }

  disableInteractionsForPendingSpawn() {
    for (const controller of this.controllers) {
      const controllerState = this.controllerStates.get(controller);
      if (!controllerState) {
        continue;
      }

      if (controllerState.hoveredTarget) {
        this.setTargetHighlight(controllerState.hoveredTarget, false);
        controllerState.hoveredTarget = null;
      }
      controllerState.raycastContactTarget = null;

      const interaction = controllerState.activeTriggerInteraction;
      if (interaction?.type === "looperWire") {
        this.disposeWireMesh(interaction.wireMesh);
        interaction.wireMesh = null;
      }
      controllerState.activeTriggerInteraction = null;

      this.releaseRaySqueeze(controllerState);
      this.gripTransformSystem?.release(controller);
      this.deactivateStick(controller);
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
      pending.controller.userData.rayLine.visible = DEBUG_SHOW_RAYS && Boolean(this.renderer.xr.isPresenting);
      pending.controller.userData.rayLine.material.color.setHex(RAY_COLOR_SPHERE_HOVER);
    }
  }

  handlePendingSpawnScaleThumbstick(controller, direction) {
    const pending = this.pendingSpawnPlacement;
    if (!pending || controller !== pending.controller || controller.userData.handedness !== "right") {
      return;
    }

    if (direction === 0) {
      pending.thumbstickScaleDirection = 0;
      return;
    }

    if (direction === pending.thumbstickScaleDirection) {
      return;
    }

    pending.thumbstickScaleDirection = direction;
    for (const state of pending.states) {
      this.setInstrumentBaseScale(state, state.baseScale + direction * INSTRUMENT_SCALE_STEP);
    }
  }

  placePendingSpawnPlacement(controller) {
    const pending = this.pendingSpawnPlacement;
    if (!pending || controller !== pending.controller) {
      return;
    }

    this.pendingSpawnPlacement = null;
    const controllerState = this.controllerStates.get(controller);
    if (controllerState) {
      controllerState.suppressTriggerUntilRelease = true;
      controllerState.activeTriggerInteraction = null;
      this.releaseRaySqueeze(controllerState);
    }

    this.scene.updateMatrixWorld(true);
    pending.group.updateMatrixWorld(true);

    for (const state of pending.states) {
      if (!state?.root) {
        continue;
      }

      state.root.updateMatrixWorld(true);
      this.restorePendingSpawnVisuals(state);
      this.scene.attach(state.root);
      state.root.userData.pendingPlacement = false;
      state.pendingPlacement = false;
      state.sceneObject.raycastTargetsDirty = true;
      this.syncLooperTransformReference(state);
    }

    pending.group.removeFromParent();
    this.activeInstrumentState = pending.states.at(-1) || this.activeInstrumentState;
  }

  deletePendingSpawnPlacement() {
    const pending = this.pendingSpawnPlacement;
    if (!pending) {
      return;
    }

    this.pendingSpawnPlacement = null;
    for (const state of [...pending.states]) {
      if (!state) {
        continue;
      }
      state.pendingPlacement = false;
      if (state.root) {
        state.root.userData.pendingPlacement = false;
      }
      this.deleteInstrument(state);
    }
    pending.group?.removeFromParent();
  }

  applyPendingSpawnVisuals(state) {
    state.root.traverse((object) => {
      if (object.userData.isHitTarget) {
        object.userData.pendingSpawnPreviousVisible = object.visible;
        object.visible = false;
        return;
      }

      if (!object.isMesh || !object.material) {
        return;
      }

      object.userData.pendingSpawnOriginalMaterial = object.material;
      object.userData.pendingSpawnOriginalCastShadow = object.castShadow;
      object.userData.pendingSpawnOriginalReceiveShadow = object.receiveShadow;
      object.userData.pendingSpawnOriginalRenderOrder = object.renderOrder;
      object.material = Array.isArray(object.material)
        ? object.material.map((material) => makePendingSpawnGlassMaterial(material))
        : makePendingSpawnGlassMaterial(object.material);
      object.castShadow = false;
      object.receiveShadow = false;
      object.renderOrder = Math.max(object.renderOrder || 0, PENDING_SPAWN_RENDER_ORDER);
    });

    if (state.sceneObject) {
      state.sceneObject.raycastTargetsDirty = true;
    }
  }

  restorePendingSpawnVisuals(state) {
    state.root.traverse((object) => {
      if (Object.prototype.hasOwnProperty.call(object.userData, "pendingSpawnPreviousVisible")) {
        object.visible = object.userData.pendingSpawnPreviousVisible;
        delete object.userData.pendingSpawnPreviousVisible;
      }

      if (!object.isMesh || !Object.prototype.hasOwnProperty.call(object.userData, "pendingSpawnOriginalMaterial")) {
        return;
      }

      const previewMaterial = object.material;
      object.material = object.userData.pendingSpawnOriginalMaterial;
      disposeMaterialOrMaterials(previewMaterial);

      object.castShadow = object.userData.pendingSpawnOriginalCastShadow;
      object.receiveShadow = object.userData.pendingSpawnOriginalReceiveShadow;
      object.renderOrder = object.userData.pendingSpawnOriginalRenderOrder;
      delete object.userData.pendingSpawnOriginalMaterial;
      delete object.userData.pendingSpawnOriginalCastShadow;
      delete object.userData.pendingSpawnOriginalReceiveShadow;
      delete object.userData.pendingSpawnOriginalRenderOrder;
    });

    if (state.sceneObject) {
      state.sceneObject.raycastTargetsDirty = true;
    }
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

  handleDeletePress(controller) {
    if (this.pendingSpawnPlacement) {
      return;
    }

    const instrumentState = this.getPointedInstrumentState(controller);
    if (!instrumentState) {
      return;
    }

    this.deleteInstrument(instrumentState);
  }

  handleBPress(controller) {
    if (this.pendingSpawnPlacement) {
      return;
    }

    const instrumentState = this.getPointedInstrumentState(controller);
    if (!this.isLockableInstrumentState(instrumentState)) {
      return;
    }

    if (!instrumentState.locked) {
      if (instrumentState.interactive) {
        this.lockConnectedChordStates(instrumentState);
      } else {
        instrumentState.locked = true;
        this.ensureChordLockOrder(instrumentState);
        this.updateLockVisual(instrumentState);
      }
    } else {
      instrumentState.locked = false;
      instrumentState.chordLockOrder = null;
      this.clearLockedChordMembership(instrumentState);
      this.updateLockVisual(instrumentState);
    }
  }

  isLockableInstrumentState(instrumentState) {
    return Boolean(
      instrumentState?.root?.visible &&
      !instrumentState.pendingPlacement &&
      (instrumentState.interactive || instrumentState.isLooper),
    );
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
    this.clearLockedChordMembership(instrumentState);
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
        controllerState.gripSourceInstrumentState = null;
      }

      if (controllerState?.gripSourceInstrumentState === instrumentState) {
        controllerState.gripSourceInstrumentState = null;
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
    instrumentState.chordLeaderState = null;
    instrumentState.chordFollowerStates?.clear();
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
    if (this.pendingSpawnPlacement) {
      this.placePendingSpawnPlacement(controller);
      return;
    }

    if (this.isControllerStickActive(controller)) {
      return;
    }

    this.synth.ensureAudio();
    const controllerState = this.controllerStates.get(controller);
    this.initializeRaySqueeze(controller);
    const hit = this.getCurrentHit(controller);

    if (hit?.object?.userData.isCloseButton) {
      this.closeInstructionPanel();
      return;
    }

    const lockedInstrumentState = this.getLockedInstrumentStateFromRay(controller);
    if (lockedInstrumentState?.isLooper) {
      this.toggleLockedLooperPlayback(lockedInstrumentState);
      controllerState.activeTriggerInteraction = null;
      this.activeInstrumentState = lockedInstrumentState;
      return;
    }

    if (this.handleLooperTriggerPress(controller, hit)) {
      return;
    }

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

    if (interaction?.type === "looperControlDrag") {
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
  }

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
  }

  pressLooperButton(looperState, action, morphName = null) {
    if (!looperState?.isLooper) {
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
  }

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
  }

  updateActiveLooperWire(controller, interaction) {
    if (!interaction?.wireMesh || !interaction.track?.nodeTarget) {
      return;
    }

    interaction.track.nodeTarget.getWorldPosition(tempWireStart);
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
      this.connectLooperTrackToHonk(interaction.looperState, interaction.track.index, honkState);
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

  getSignedMorphValueForCollider(sphere, state) {
    const type = sphere.userData.interactionType;

    if (!state?.morphController) return 0;

    if (type === INTERACTION_TYPES.ear) {
      return state.morphController.getEarAmount(sphere.userData.side);
    }

    if (type === INTERACTION_TYPES.nose) {
      const value = state.morphController.getValue(
        sphere.userData.morphName || MORPH_TARGET_NAMES.nose
      );

      return sphere.userData.invertVerticalMorph ? -value : value;
    }

    const positiveName = sphere.userData.positiveMorphName || sphere.userData.morphName;
    const negativeName = sphere.userData.negativeMorphName;

    const positive = positiveName
      ? state.morphController.getValue(positiveName)
      : 0;

    const negative = negativeName
      ? state.morphController.getValue(negativeName)
      : 0;

    const signedValue = positive - negative;

    return sphere.userData.invertVerticalMorph ? -signedValue : signedValue;
  }

  syncMorphColliderTravel(state) {
    if (!state?.morphController) return;

    const spheres = this.getProceduralMorphTargetSpheres(state);

    for (const sphere of spheres) {
      if (
        typeof sphere.userData.neutralY !== "number" ||
        typeof sphere.userData.minY !== "number" ||
        typeof sphere.userData.maxY !== "number"
      ) {
        continue;
      }

      const signedValue = THREE.MathUtils.clamp(
        this.getSignedMorphValueForCollider(sphere, state),
        -1,
        1
      );

      this.setSpherePositionFromSignedValue(sphere, signedValue);
    }

    if (!state.isLooper) {
      return;
    }

    for (const [control, fallbackMorphTargets] of Object.entries(LOOPER_CONTROL_MORPH_TARGETS)) {
      const sphere = state.hitTargets[getLooperControlName(control)];
      if (!sphere?.userData.isLooperControl) {
        continue;
      }

      const morphTargets = sphere.userData.looperMorphTargets || fallbackMorphTargets;
      const signedValue = THREE.MathUtils.clamp(
        state.morphController.getValue(morphTargets.up) - state.morphController.getValue(morphTargets.down),
        -1,
        1,
      );

      this.positionControlColliderFromValue(sphere, signedValue);
    }
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
      interaction.instrumentState.performanceState?.setLiveState({
        earLeft:
          interaction.side === "left"
            ? value
            : interaction.instrumentState.performanceState.live.earLeft,
        earRight:
          interaction.side === "right"
            ? value
            : interaction.instrumentState.performanceState.live.earRight,
      });
      this.updateNoteLabel(interaction.instrumentState);
      return;
    }

    if (interaction.dragType === "nose") {
      interaction.instrumentState.morphController.setNose(value);
      interaction.instrumentState.performanceState?.setLiveState({ nose: value });
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
    const value = THREE.MathUtils.clamp(signedValue, -1, 1);

    const neutralY = sphere.userData.neutralY;
    const minY = sphere.userData.minY;
    const maxY = sphere.userData.maxY;

    if (
      typeof neutralY !== "number" ||
      typeof minY !== "number" ||
      typeof maxY !== "number"
    ) {
      return;
    }

    sphere.position.y =
      value >= 0
        ? THREE.MathUtils.lerp(neutralY, maxY, value)
        : THREE.MathUtils.lerp(neutralY, minY, -value);
  }

  getOrCreateControllerStick(controller, controllerState) {
    if (!controller || !controllerState) {
      return null;
    }

    const existingStick = controllerState.stickObject || controller.userData.stickObject;
    if (existingStick) {
      controllerState.stickObject = existingStick;
      controller.userData.stickObject = existingStick;
      return existingStick;
    }

    const stick = this.createStickObject();
    if (!stick) {
      return null;
    }

    controllerState.stickObject = stick;
    controller.userData.stickObject = stick;
    return stick;
  }

  clearControllerHover(controllerState) {
    if (!controllerState) {
      return;
    }

    if (controllerState.hoveredTarget) {
      this.setTargetHighlight(controllerState.hoveredTarget, false);
      controllerState.hoveredTarget = null;
    }
    controllerState.raycastContactTarget = null;
  }

  clearControllerTriggerInteraction(controllerState) {
    if (!controllerState) {
      return;
    }

    const interaction = controllerState.activeTriggerInteraction;
    if (interaction?.type === "looperWire") {
      this.disposeWireMesh(interaction.wireMesh);
      interaction.wireMesh = null;
    }
    if (interaction?.type === "holdSqueeze") {
      for (const activeVoiceId of interaction.activeVoiceIds || []) {
        this.synth.resetPitchBend(activeVoiceId);
        this.synth.release(activeVoiceId);
      }
    }

    controllerState.activeTriggerInteraction = null;
    this.releaseRaySqueeze(controllerState);
  }

  activateStick(controller) {
    if (!STICK_SETTINGS.enabled || !this.stickTemplate) {
      return false;
    }

    const controllerState = this.controllerStates.get(controller);
    const stick = this.getOrCreateControllerStick(controller, controllerState);
    if (!stick) {
      return false;
    }

    this.clearControllerHover(controllerState);
    this.clearControllerTriggerInteraction(controllerState);
    this.resetShakeDisconnectTracking(controllerState);
    this.gripTransformSystem?.release(controller);
    this.closeRadialMenu(controller);
    this.synth.ensureAudio();

    applyLocalTransformFromConfig(stick, STICK_SETTINGS);
    if (stick.parent !== controller) {
      controller.add(stick);
    }
    stick.visible = true;

    controllerState.stickActive = true;
    controllerState.stickCollider = stick.userData.stickCollider || null;
    controllerState.stickContactKeys?.clear();

    if (controller.userData.rayLine) {
      controller.userData.rayLine.visible = false;
    }

    return true;
  }

  deactivateStick(controller) {
    const controllerState = this.controllerStates.get(controller);
    if (!controllerState) {
      return;
    }

    if (controllerState.stickObject) {
      controllerState.stickObject.visible = false;
    }

    controllerState.stickActive = false;
    controllerState.stickCollider = null;
    controllerState.stickContactKeys?.clear();
  }

  isControllerStickActive(controller) {
    return Boolean(this.controllerStates.get(controller)?.stickActive);
  }

  updateStickPercussionContacts(now = performance.now()) {
    let hasUserPosition = false;

    for (const controller of this.controllers) {
      const controllerState = this.controllerStates.get(controller);
      if (!controllerState?.stickActive || !controllerState.stickCollider?.visible) {
        controllerState?.stickContactKeys?.clear();
        continue;
      }

      if (!hasUserPosition) {
        const userCamera = this.getUserCamera();
        userCamera.updateMatrixWorld(true);
        userCamera.getWorldPosition(tempStickUserPosition);
        hasUserPosition = true;
      }

      controllerState.stickCollider.updateWorldMatrix(true, false);
      tempStickColliderBounds.setFromObject(controllerState.stickCollider);
      if (tempStickColliderBounds.isEmpty()) {
        controllerState.stickContactKeys?.clear();
        continue;
      }

      const previousKeys = controllerState.stickContactKeys || new Set();
      const nextKeys = new Set();
      for (const instrumentState of this.instrumentStates) {
        if (!this.isStickPercussionTargetState(instrumentState)) {
          continue;
        }

        const drumType = instrumentState.isLooper
          ? STICK_PERCUSSION_TYPES.hihat
          : STICK_PERCUSSION_TYPES.boink;
        const contactKey = `${drumType}:${instrumentState.id}`;
        if (
          !this.doesStickColliderTouchInstrumentMeshes(
            controllerState.stickCollider,
            tempStickColliderBounds,
            instrumentState,
            tempStickUserPosition,
          )
        ) {
          continue;
        }

        nextKeys.add(contactKey);
        if (!previousKeys.has(contactKey)) {
          this.handleStickPercussionContactEnter(controller, controllerState, instrumentState, drumType, now);
        }
      }

      previousKeys.clear();
      for (const key of nextKeys) {
        previousKeys.add(key);
      }
      controllerState.stickContactKeys = previousKeys;
    }
  }

  isStickPercussionTargetState(instrumentState) {
    return Boolean(
      instrumentState?.root?.visible &&
      !instrumentState.pendingPlacement &&
      (instrumentState.interactive || instrumentState.isLooper),
    );
  }

  doesStickColliderTouchInstrumentMeshes(stickCollider, stickBounds, instrumentState, userPosition) {
    if (!stickCollider?.isMesh || !stickCollider.geometry) {
      return false;
    }

    instrumentState.root.updateMatrixWorld(true);
    tempStickTargetBounds.setFromObject(instrumentState.root);
    if (
      tempStickTargetBounds.isEmpty() ||
      !stickBounds.intersectsBox(tempStickTargetBounds) ||
      !this.isStickTargetBoundsCloseToUser(tempStickTargetBounds, userPosition)
    ) {
      return false;
    }

    if (!stickCollider.geometry.boundingBox) {
      stickCollider.geometry.computeBoundingBox();
    }
    tempStickColliderLocalBounds.copy(stickCollider.geometry.boundingBox);
    tempStickColliderInverseMatrix.copy(stickCollider.matrixWorld).invert();

    let touched = false;
    instrumentState.root.traverse((object) => {
      if (touched || !this.isStickPercussionTargetMesh(object)) {
        return;
      }

      tempStickTargetBounds.setFromObject(object);
      if (
        tempStickTargetBounds.isEmpty() ||
        !stickBounds.intersectsBox(tempStickTargetBounds) ||
        !this.isStickTargetBoundsCloseToUser(tempStickTargetBounds, userPosition)
      ) {
        return;
      }

      if (this.doesStickColliderIntersectMeshTriangles(object)) {
        touched = true;
      }
    });
    return touched;
  }

  isStickTargetBoundsCloseToUser(bounds, userPosition) {
    const maxDistance =
      STICK_SETTINGS.collision?.maxUserDistance ?? DEFAULT_STICK_COLLISION_MAX_USER_DISTANCE;
    if (!Number.isFinite(maxDistance) || maxDistance <= 0 || !userPosition) {
      return true;
    }

    return bounds.distanceToPoint(userPosition) <= maxDistance;
  }

  doesStickColliderIntersectMeshTriangles(targetMesh) {
    const geometry = targetMesh?.geometry;
    const position = geometry?.attributes?.position;
    if (!position || position.count < 3 || tempStickColliderLocalBounds.isEmpty()) {
      return false;
    }

    tempStickTargetToColliderMatrix.multiplyMatrices(
      tempStickColliderInverseMatrix,
      targetMesh.matrixWorld,
    );

    const index = geometry.index;
    const triangleCount = index ? Math.floor(index.count / 3) : Math.floor(position.count / 3);
    for (let triangleIndex = 0; triangleIndex < triangleCount; triangleIndex += 1) {
      const vertexIndexA = index ? index.getX(triangleIndex * 3) : triangleIndex * 3;
      const vertexIndexB = index ? index.getX(triangleIndex * 3 + 1) : triangleIndex * 3 + 1;
      const vertexIndexC = index ? index.getX(triangleIndex * 3 + 2) : triangleIndex * 3 + 2;

      this.setStickCollisionTriangleVertex(targetMesh, vertexIndexA, tempStickTriangle.a);
      this.setStickCollisionTriangleVertex(targetMesh, vertexIndexB, tempStickTriangle.b);
      this.setStickCollisionTriangleVertex(targetMesh, vertexIndexC, tempStickTriangle.c);

      if (tempStickColliderLocalBounds.intersectsTriangle(tempStickTriangle)) {
        return true;
      }
    }

    return false;
  }

  setStickCollisionTriangleVertex(targetMesh, vertexIndex, target) {
    if (typeof targetMesh.getVertexPosition === "function") {
      targetMesh.getVertexPosition(vertexIndex, target);
    } else {
      target.fromBufferAttribute(targetMesh.geometry.attributes.position, vertexIndex);
    }
    target.applyMatrix4(tempStickTargetToColliderMatrix);
  }

  isStickPercussionTargetMesh(object) {
    if (!object?.isMesh || object.visible === false) {
      return false;
    }
    if (
      object.userData.isHitTarget ||
      object.userData.isStickCollider ||
      object.userData.isNoteLabel ||
      object.userData.isLooperCollider ||
      object.name?.startsWith("HIT_") ||
      object.name?.startsWith("DEBUG_")
    ) {
      return false;
    }

    let parent = object.parent;
    while (parent) {
      if (parent.userData.isHitTarget || parent.userData.isNoteLabel) {
        return false;
      }
      parent = parent.parent;
    }
    return true;
  }

  handleStickPercussionContactEnter(
    controller,
    controllerState,
    instrumentState,
    drumType,
    now = performance.now(),
  ) {
    this.playStickPercussion(drumType);
    this.triggerStickHitHaptics(controller, controllerState, now);
    this.recordStickPercussionHit(instrumentState, drumType, now);
  }

  triggerStickHitHaptics(controller, controllerState, now = performance.now()) {
    const settings = STICK_SETTINGS.haptics;
    if (!settings || settings.enabled === false || !controller) {
      return;
    }

    const cooldownMs = Math.max(getConfigNumber(settings.cooldownMs, 0), 0);
    if (cooldownMs > 0 && now < (controllerState?.stickHapticCooldownUntilMs || 0)) {
      return;
    }

    const durationMs = Math.max(getConfigNumber(settings.durationMs, 0), 0);
    const intensity = THREE.MathUtils.clamp(getConfigNumber(settings.intensity, 0), 0, 1);
    if (durationMs <= 0 || intensity <= 0) {
      return;
    }

    const pulsePromise = this.pulseGamepadHaptics(this.getControllerGamepad(controller), intensity, durationMs);
    if (!pulsePromise) {
      return;
    }

    if (controllerState && cooldownMs > 0) {
      controllerState.stickHapticCooldownUntilMs = now + cooldownMs;
    }
    if (pulsePromise.catch) {
      pulsePromise.catch((error) => {
        console.warn("Could not pulse controller haptics:", error);
      });
    }
  }

  triggerRaycastHitHaptics(controller, controllerState, now = performance.now()) {
    const settings = RAYCAST_HAPTICS;
    if (!settings || settings.enabled === false || !controller) {
      return;
    }

    const cooldownMs = Math.max(getConfigNumber(settings.cooldownMs, 0), 0);
    if (cooldownMs > 0 && now < (controllerState?.raycastHapticCooldownUntilMs || 0)) {
      return;
    }

    const durationMs = Math.max(getConfigNumber(settings.durationMs, 0), 0);
    const intensity = THREE.MathUtils.clamp(getConfigNumber(settings.intensity, 0), 0, 1);
    if (durationMs <= 0 || intensity <= 0) {
      return;
    }

    const pulsePromise = this.pulseGamepadHaptics(this.getControllerGamepad(controller), intensity, durationMs);
    if (!pulsePromise) {
      return;
    }

    if (controllerState && cooldownMs > 0) {
      controllerState.raycastHapticCooldownUntilMs = now + cooldownMs;
    }
    pulsePromise.catch?.((error) => {
      console.warn("Could not pulse raycast haptics:", error);
    });
  }

  pulseGamepadHaptics(gamepad, intensity, durationMs) {
    if (!gamepad) {
      return null;
    }

    try {
      const pulsePromises = [];
      for (const actuator of gamepad.hapticActuators || []) {
        if (typeof actuator?.pulse === "function") {
          pulsePromises.push(actuator.pulse(intensity, durationMs));
        }
      }
      if (pulsePromises.length > 0) {
        return Promise.all(pulsePromises);
      }

      const vibrationActuator = gamepad.vibrationActuator;
      if (typeof vibrationActuator?.playEffect === "function") {
        return vibrationActuator.playEffect("dual-rumble", {
          startDelay: 0,
          duration: durationMs,
          weakMagnitude: intensity,
          strongMagnitude: intensity,
        });
      }
    } catch (error) {
      console.warn("Could not pulse controller haptics:", error);
    }

    return null;
  }

  playStickPercussion(drumType, { volume = 1 } = {}) {
    if (!drumType) {
      return;
    }

    const playPromise = this.synth.triggerStickPercussion?.(drumType, { volume });
    if (playPromise?.catch) {
      playPromise.catch((error) => {
        console.warn("Could not play stick percussion:", error);
      });
    }
  }

  recordStickPercussionHit(instrumentState, drumType, now = performance.now()) {
    if (drumType === STICK_PERCUSSION_TYPES.hihat && instrumentState?.isLooper) {
      this.looperController.recordSelfDrumHit(instrumentState, drumType, now);
      return;
    }

    if (drumType !== STICK_PERCUSSION_TYPES.boink || !instrumentState?.interactive) {
      return;
    }

    for (const looperState of this.instrumentStates) {
      const data = looperState.looperData;
      if (!data?.recording || !looperState.root?.visible) {
        continue;
      }

      const track = data.tracks.find((candidate) => candidate.connectedHonkState === instrumentState);
      if (track) {
        this.looperController.recordTrackDrumHit(looperState, track, drumType, now);
      }
    }
  }

  isStickBlockingRayHit(hit, lockedInstrumentState = null) {
    const target = hit?.object;
    if (!target) {
      return false;
    }

    if (target.userData.isCloseButton || lockedInstrumentState) {
      return true;
    }
    if (
      target.userData.isProceduralMorphTarget ||
      target.userData.isHonkConnectionTarget ||
      this.isLooperColliderTarget(target)
    ) {
      return true;
    }

    const config = INTERACTION_MAP[target.name];
    return Boolean(config && target.name !== INTERACTION_TARGET_NAMES.body);
  }

  handleGripPress(controller) {
    if (this.pendingSpawnPlacement) {
      this.deletePendingSpawnPlacement();
      return;
    }

    const gripHit = this.getGripHit(controller);
    if (gripHit) {
      this.gripTransformSystem?.begin(controller, gripHit);
      return;
    }

    const rayHit = this.getCurrentHit(controller);
    const lockedInstrumentState = this.getLockedInstrumentStateFromRay(controller);
    if (!this.isStickBlockingRayHit(rayHit, lockedInstrumentState)) {
      this.activateStick(controller);
      return;
    }
  }

  handleGripRelease(controller) {
    this.deactivateStick(controller);

    if (this.pendingSpawnPlacement) {
      return;
    }

    this.resetShakeDisconnectTracking(this.controllerStates.get(controller));
    this.gripTransformSystem?.release(controller);
  }

  handleGripScaleThumbstick(controller, direction) {
    if (this.pendingSpawnPlacement) {
      this.handlePendingSpawnScaleThumbstick(controller, direction);
      return;
    }

    if (this.isControllerStickActive(controller)) {
      return;
    }

    this.gripTransformSystem?.handleScaleThumbstick(controller, direction);
  }

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
  }

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
  }

  isShakeDisconnectHonkState(state) {
    return Boolean(state?.interactive && state.root?.visible && !state.pendingPlacement);
  }

  getLooperConnectionsForHonk(honkState) {
    const connections = [];
    if (!honkState?.interactive) {
      return connections;
    }

    for (const looperState of this.instrumentStates) {
      const data = looperState.looperData;
      if (!data || !looperState.root?.visible) {
        continue;
      }

      for (const track of data.tracks) {
        if (track.connectedHonkState === honkState) {
          connections.push({ looperState, track });
        }
      }
    }
    return connections;
  }

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
      samples.push({ time: now, position: tempShakePosition.clone(), speed: 0 });
      return;
    }

    const elapsedSeconds = Math.max((now - controllerState.shakeDisconnectLastSampleTime) / 1000, 0.0001);
    const speed = tempShakePosition.distanceTo(controllerState.shakeDisconnectLastPosition) / elapsedSeconds;
    samples.push({ time: now, position: tempShakePosition.clone(), speed });
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
  }

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

    let speedSum = 0;
    for (const sample of samples) {
      speedSum += sample.speed || 0;
    }
    const averageSpeed = speedSum / Math.max(samples.length - 1, 1);
    if (averageSpeed < Math.max(settings.intensity || 0, 0)) {
      return false;
    }

    tempShakeBounds.makeEmpty();
    for (const sample of samples) {
      tempShakeBounds.expandByPoint(sample.position);
    }
    tempShakeBounds.getSize(tempShakeRange);
    const range = tempShakeRange.length();
    return range >= Math.max(settings.range || 0, 0);
  }

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
  }

  adjustInstrumentBaseScale(state, delta) {
    state = this.getLockedChordTransformTargetState(state);
    if (!state?.root) {
      return;
    }

    const previousBaseScale = state.baseScale;
    const followerHonks = state.isLooper ? this.getLooperFollowerHonks(state) : [];
    this.setInstrumentBaseScale(state, state.baseScale + delta);
    const scaleRatio = previousBaseScale > 0 ? state.baseScale / previousBaseScale : 1;
    if (!state.isLooper || Math.abs(scaleRatio - 1) < 0.000001) {
      return;
    }

    for (const honkState of followerHonks) {
      if (this.isInstrumentStateCurrentlyGripped(honkState)) {
        continue;
      }
      this.setInstrumentBaseScale(honkState, honkState.baseScale * scaleRatio);
    }
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
    targetState.performanceState?.setLiveState({
      squeeze: 0,
      bend: 0,
      earLeft: leftEar,
      earRight: rightEar,
      nose,
      vowel: targetState.currentVowelLetter,
    });

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
    this.clearLooperRuntimeState(targetState);
    targetData.timeline = sourceData.timeline?.clone?.() || this.looperController.createTimeline();
    targetData.hasRecording = targetData.timeline.hasRecording();
    targetData.durationMs = targetData.timeline.durationMs;

    for (const targetTrack of targetData.tracks) {
      targetTrack.connectedHonkState = null;
      targetTrack.resetRuntimeState();
      targetTrack.active = Boolean(targetData.timeline.getTrack(targetTrack.trackId)?.active);
      this.disposeWireMesh(targetTrack.wireMesh);
      targetTrack.wireMesh = null;
    }

    this.setLooperControlValue(targetState, "volume", sourceData.volumeControlValue);
    this.setLooperControlValue(targetState, "gap", sourceData.gapControlValue);
    this.setLooperControlValue(targetState, "speed", sourceData.speedControlValue);
    this.updateLooperVisuals(targetState);
  }

  getLooperTrack(looperState, trackIndex) {
    if (!looperState?.looperData) {
      return null;
    }

    return looperState.looperData.tracks[trackIndex] || null;
  }

  getLooperWireColor(padIndex) {
    return LOOPER_WIRE_COLORS[Math.abs(padIndex) % LOOPER_WIRE_COLORS.length];
  }

  getLooperControlValue(looperState, control) {
    if (!looperState?.looperData) {
      return 0;
    }

    if (control === "speed") {
      return looperState.looperData.speedControlValue;
    }
    if (control === "gap") {
      return looperState.looperData.gapControlValue;
    }
    return looperState.looperData.volumeControlValue;
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
    } else if (control === "gap") {
      data.gapControlValue = clamped;
      data.loopGapMs = this.getLooperGapFromControl(clamped);
      if (!data.recording && data.timeline?.hasRecording()) {
        data.timeline.setLoopGap(data.loopGapMs, LOOPER_MIN_ACTION_DURATION_MS);
        data.durationMs = data.timeline.durationMs;
      }
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

  getLooperGapFromControl(value) {
    return LooperAudioEngine.getGapFromControl(value);
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

  setLooperButtonMorph(looperState, action, value, morphNameOverride = null) {
    const data = looperState?.looperData;
    const morphName = this.getLooperButtonMorphName(looperState, action, morphNameOverride);
    if (!data || !morphName) {
      return;
    }

    this.setMorph(morphName, value, looperState);
    if (value <= 0) {
      data.buttonMorphReleaseTimes?.delete(action);
    }
  }

  getLooperButtonMorphName(looperState, action, morphNameOverride = null) {
    return (
      morphNameOverride ||
      looperState?.hitTargets?.[getLooperButtonName(action)]?.userData.looperMorphName ||
      LOOPER_BUTTON_MORPH_TARGETS[action]
    );
  }

  triggerLooperButtonMorph(looperState, action, now = performance.now(), morphNameOverride = null) {
    const data = looperState?.looperData;
    const morphName = this.getLooperButtonMorphName(looperState, action, morphNameOverride);
    if (!data || !morphName) {
      return;
    }

    this.setMorph(morphName, 1, looperState);
    data.buttonMorphReleaseTimes.set(action, {
      releaseTimeMs: now + LOOPER_MORPH_SETTINGS.buttonPressDurationMs,
      morphName,
    });
  }

  updateLooperMorphAnimations(now = performance.now()) {
    for (const looperState of this.instrumentStates) {
      const data = looperState.looperData;
      if (!data || !looperState.root?.visible) {
        continue;
      }

      this.updateLooperButtonMorphs(looperState, now);
      this.updateLooperPlayingMorph(looperState, now);
    }
  }

  updateLooperButtonMorphs(looperState, now) {
    const data = looperState?.looperData;
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
  }

  updateLooperPlayingMorph(looperState, now) {
    const data = looperState?.looperData;
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
  }

  clearLooperRuntimeState(looperState) {
    const data = looperState?.looperData;
    if (!data) {
      return;
    }

    this.looperController.clearRuntimeState(looperState);
    data.buttonMorphReleaseTimes.clear();
    for (const morphName of Object.values(LOOPER_BUTTON_MORPH_TARGETS)) {
      this.setMorph(morphName, 0, looperState);
    }
    data.playingHeadMorphValue = 0;
    data.playingHeadMorphTarget = 0;
    data.playingHeadMorphPhase = 0;
    data.lastPlayingHeadMorphUpdateMs = 0;
    this.setMorph(LOOPER_MORPH_TARGET_NAMES.playingHead, 0, looperState);
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
      const data = looperState.looperData;
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
  }

  attachNewlyLockedChordState(newState) {
    if (!this.isLockedChordState(newState)) {
      return;
    }

    let targetLeader = null;
    let targetSortValue = Number.MAX_SAFE_INTEGER;
    for (const candidateState of this.instrumentStates) {
      if (
        candidateState === newState ||
        !this.isLockedChordState(candidateState) ||
        !this.areSqueezeColliderSpheresOverlapping(newState, candidateState)
      ) {
        continue;
      }

      this.ensureChordLockOrder(candidateState);
      const candidateLeader = this.getLockedChordRootState(candidateState);
      if (!this.isLockedChordState(candidateLeader) || candidateLeader === newState) {
        continue;
      }

      this.ensureChordLockOrder(candidateLeader);
      const sortValue = this.getChordLockSortValue(candidateLeader);
      if (sortValue < targetSortValue) {
        targetLeader = candidateLeader;
        targetSortValue = sortValue;
      }
    }

    if (targetLeader) {
      this.attachLockedChordFollower(targetLeader, newState);
    }
  }

  lockConnectedChordStates(startState) {
    const connectedStates = this.getTouchingInstrumentChain(startState).filter(
      (state) => state?.interactive && this.isLockableInstrumentState(state),
    );
    if (!connectedStates.includes(startState)) {
      connectedStates.unshift(startState);
    }

    const existingLockedStates = connectedStates.filter((state) => this.isLockedChordState(state));
    const statesToLock = [
      startState,
      ...connectedStates.filter((state) => state !== startState && !state.locked),
    ];

    for (const state of statesToLock) {
      state.locked = true;
      this.ensureChordLockOrder(state);
      this.updateLockVisual(state);
    }

    const leader = this.getEarliestLockedChordLeader(existingLockedStates) || startState;
    this.ensureChordLockOrder(leader);
    for (const state of statesToLock) {
      if (state === leader || !this.isLockedChordState(state)) {
        continue;
      }
      this.attachLockedChordFollower(leader, state);
    }
  }

  getEarliestLockedChordLeader(states) {
    let targetLeader = null;
    let targetSortValue = Number.MAX_SAFE_INTEGER;
    for (const state of states) {
      const leader = this.getLockedChordRootState(state);
      if (!this.isLockedChordState(leader)) {
        continue;
      }

      this.ensureChordLockOrder(leader);
      const sortValue = this.getChordLockSortValue(leader);
      if (sortValue < targetSortValue) {
        targetLeader = leader;
        targetSortValue = sortValue;
      }
    }
    return targetLeader;
  }

  attachLockedChordFollower(leader, follower) {
    if (!leader?.root || !follower?.root || leader === follower) {
      return;
    }

    if (follower.chordLeaderState && follower.chordLeaderState !== leader) {
      follower.chordLeaderState.chordFollowerStates?.delete(follower);
    }
    leader.chordLeaderState = null;
    follower.chordLeaderState = leader;
    leader.chordFollowerStates.add(follower);

    leader.root.updateMatrixWorld(true);
    follower.root.updateMatrixWorld(true);
    leader.root.getWorldPosition(tempChordLeaderPosition);
    leader.root.getWorldQuaternion(tempChordLeaderQuaternion);
    follower.root.getWorldPosition(tempChordFollowerPosition);
    follower.root.getWorldQuaternion(tempChordFollowerQuaternion);

    tempChordInverseQuaternion.copy(tempChordLeaderQuaternion).invert();
    follower.chordAttachmentOffset
      .copy(tempChordFollowerPosition)
      .sub(tempChordLeaderPosition)
      .applyQuaternion(tempChordInverseQuaternion)
      .multiplyScalar(1 / Math.max(leader.baseScale, 0.0001));
    follower.chordAttachmentQuaternion
      .copy(tempChordInverseQuaternion)
      .multiply(tempChordFollowerQuaternion);
    follower.chordAttachmentBaseScaleRatio = follower.baseScale / Math.max(leader.baseScale, 0.0001);
  }

  updateLockedChordFollowerTransforms() {
    for (const leader of this.instrumentStates) {
      if (!this.isLockedChordState(leader) || leader.chordFollowerStates.size === 0) {
        continue;
      }

      leader.root.updateMatrixWorld(true);
      leader.root.getWorldPosition(tempChordLeaderPosition);
      leader.root.getWorldQuaternion(tempChordLeaderQuaternion);
      const leaderBaseScale = Math.max(leader.baseScale, 0.0001);

      for (const follower of leader.chordFollowerStates) {
        if (!this.isLockedChordState(follower) || follower.chordLeaderState !== leader) {
          continue;
        }

        tempChordFollowerPosition
          .copy(follower.chordAttachmentOffset)
          .multiplyScalar(leaderBaseScale)
          .applyQuaternion(tempChordLeaderQuaternion)
          .add(tempChordLeaderPosition);
        follower.root.position.copy(tempChordFollowerPosition);
        follower.root.quaternion.copy(tempChordLeaderQuaternion).multiply(follower.chordAttachmentQuaternion);
        this.setInstrumentBaseScale(follower, leaderBaseScale * follower.chordAttachmentBaseScaleRatio);
      }
    }
  }

  clearLockedChordMembership(state) {
    if (!state) {
      return;
    }

    if (state.chordLeaderState?.chordFollowerStates) {
      state.chordLeaderState.chordFollowerStates.delete(state);
    }
    state.chordLeaderState = null;

    for (const follower of state.chordFollowerStates || []) {
      if (follower.chordLeaderState === state) {
        follower.chordLeaderState = null;
      }
    }
    state.chordFollowerStates?.clear();
  }

  ensureChordLockOrder(state) {
    if (!state || Number.isFinite(state.chordLockOrder)) {
      return;
    }

    state.chordLockOrder = this.nextChordLockOrder;
    this.nextChordLockOrder += 1;
  }

  getChordLockSortValue(state) {
    return Number.isFinite(state?.chordLockOrder) ? state.chordLockOrder : Number.MAX_SAFE_INTEGER;
  }

  getLockedChordTransformTargetState(state) {
    const rootState = this.getLockedChordRootState(state);
    return this.isLockedChordState(rootState) ? rootState : state;
  }

  getLockedChordRootState(state) {
    let currentState = state;
    const visitedStates = new Set();
    while (
      currentState?.chordLeaderState &&
      this.isLockedChordState(currentState.chordLeaderState) &&
      !visitedStates.has(currentState.chordLeaderState)
    ) {
      visitedStates.add(currentState);
      currentState = currentState.chordLeaderState;
    }
    return currentState;
  }

  isLockedChordState(state) {
    return Boolean(state?.locked && state.interactive && state.root?.visible && !state.pendingPlacement);
  }

  getLooperFollowerHonks(looperState) {
    const followerHonks = new Set();
    for (const connection of looperState?.looperData?.tracks || []) {
      if (!connection.connectedHonkState?.root?.visible) {
        continue;
      }
      for (const honkState of this.getLooperFollowerHonkChain(connection.connectedHonkState)) {
        followerHonks.add(honkState);
      }
    }
    return followerHonks;
  }

  getLooperFollowerHonkChain(connectedHonkState) {
    if (!connectedHonkState?.interactive || !connectedHonkState.root?.visible) {
      return [];
    }

    const chain = this.getTouchingInstrumentChain(connectedHonkState).filter((state) => state.interactive);
    return chain.length > 0 ? chain : [connectedHonkState];
  }

  getLooperPlaybackHonkTargets(connectedHonkState) {
    return this.getLooperFollowerHonkChain(connectedHonkState);
  }

  isInstrumentStateCurrentlyGripped(instrumentState) {
    for (const controllerState of this.controllerStates.values()) {
      if (controllerState.gripHeld && controllerState.gripInstrumentState === instrumentState) {
        return true;
      }
    }
    return false;
  }

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
      if (interaction?.type === "holdSqueeze" && interaction.instrumentState?.root?.visible) {
        activeHoldInteractions.push({ interaction, controller });
      }
      const looperInteractionActive =
        interaction?.type === "looperWire" ||
        interaction?.type === "looperControlDrag";
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

      let bendSum = 0;
      for (const value of state.activeBends.values()) {
        bendSum += value;
      }
      const liveSqueeze = state.hornHolders.size > 0 ? 1 : 0;
      const liveBend = liveSqueeze > 0 ? THREE.MathUtils.clamp(bendSum, -1, 1) : 0;
      state.performanceState?.setLiveState({
        squeeze: liveSqueeze,
        bend: liveBend,
      });
    }

    this.updateLooperPlayback(now);
    this.applyResolvedHonkPerformanceStates();

    for (const { interaction } of activeHoldInteractions) {
      for (const synthState of interaction.activeChain || []) {
        const voiceId = this.getInstrumentVoiceId(interaction.voiceId, synthState);
        const pitchBendSemitones = synthState.bendValue * MAX_PITCH_BEND_SEMITONES;
        this.synth.update({
          voiceId,
          hornAmount: synthState.hornSqueezeValue,
          masterGain: HONK_MASTER_GAIN,
          leftEar: synthState.morphController.getEarAmount("left"),
          rightEar: synthState.morphController.getEarAmount("right"),
          nose: synthState.morphController.getValue(MORPH_TARGET_NAMES.nose),
          vowel: synthState.currentVowelLetter === "neutral" ? "A" : synthState.currentVowelLetter,
          pitchBendSemitones,
          pitchSnap: synthState.pitchSnap,
        });
      }
    }

    this.updateLooperPlaybackAudio();
  }

  startRecording(looperState, now = performance.now()) {
    this.looperController.startRecording(looperState, now);
  }

  stopRecording(looperState, now = performance.now()) {
    this.looperController.stopRecording(looperState, now);
  }

  clearRecording(looperState) {
    this.looperController.clearRecording(looperState);
  }

  startPlayback(looperState, now = performance.now()) {
    this.looperController.startPlayback(looperState, now);
  }

  pausePlayback(looperState) {
    this.looperController.pausePlayback(looperState);
  }

  stopPlayback(looperState) {
    this.looperController.stopPlayback(looperState);
  }

  updatePlayback(delta = 0, time = performance.now()) {
    this.updateLooperPlayback(time);
    this.updateLooperPlaybackAudio();
  }

  updateLooperPlaybackDuringPendingSpawn(now = performance.now()) {
    this.clearLiveHornInteractionState();
    this.updateLooperPlayback(now);
    this.applyResolvedHonkPerformanceStates();
    this.updateLooperPlaybackAudio();
    this.updateLooperMorphAnimations(now);
  }

  clearLiveHornInteractionState() {
    for (const state of this.instrumentStates) {
      if (!state.interactive) {
        continue;
      }

      state.hornHolders.clear();
      state.activeBends.clear();
      state.performanceState?.setLiveState({
        squeeze: 0,
        bend: 0,
      });
    }
  }

  applyResolvedHonkPerformanceStates() {
    for (const state of this.instrumentStates) {
      if (!state.interactive) {
        continue;
      }

      const resolved = state.performanceState?.resolve?.();
      const targetSqueeze = resolved?.squeeze ?? (state.hornHolders.size > 0 ? 1 : 0);
      const targetBend = resolved?.bend ?? 0;

      state.hornSqueezeValue = THREE.MathUtils.lerp(
        state.hornSqueezeValue,
        targetSqueeze,
        SQUEEZE_SENSITIVITY,
      );
      state.morphController.setSqueeze(state.hornSqueezeValue);

      state.targetBendValue = targetBend;
      state.bendValue = THREE.MathUtils.lerp(state.bendValue, state.targetBendValue, BEND_SMOOTHING);
      state.morphController.setBend(state.bendValue);
      if (resolved) {
        this.applyResolvedHonkMorphState(state, resolved);
      }
      this.updateBendAlignedColliders(state);

      const pulse = 1 + state.hornSqueezeValue * 0.035;
      this.applyInstrumentVisualScale(state, pulse);
    }
  }

  updateLooperRecordings(now = performance.now()) {
    this.looperController.updateRecordings(this.instrumentStates, now);
  }

  updateLooperPlayback(now = performance.now()) {
    this.looperController.updatePlayback(this.instrumentStates, now);
  }

  updateLooperPlaybackAudio() {
    this.looperController.updateAutomationAudio();
  }

  releaseSynthVoice(voiceId) {
    this.synth.resetPitchBend(voiceId);
    this.synth.release(voiceId);
  }

  captureLooperActionFromHonk(honkState) {
    if (!honkState?.interactive || !honkState.root?.visible) {
      return null;
    }

    const live = honkState.performanceState?.live;
    return {
      squeeze: honkState.hornSqueezeValue || 0,
      bend: honkState.bendValue || 0,
      earLeft: live?.earLeft ?? honkState.morphController.getEarAmount("left"),
      earRight: live?.earRight ?? honkState.morphController.getEarAmount("right"),
      nose: live?.nose ?? honkState.morphController.getValue(MORPH_TARGET_NAMES.nose),
      vowel: live?.vowel ?? honkState.currentVowelLetter ?? "neutral",
    };
  }

  setHonkAutomationLayer(honkState, layerId, snapshot) {
    if (!honkState?.performanceState) {
      return;
    }
    honkState.performanceState.setAutomationLayer(layerId, snapshot);
  }

  clearHonkAutomationLayer(honkState, layerId) {
    honkState?.performanceState?.clearAutomationLayer(layerId);
  }

  getLooperAutomationLayerId(looperState, track) {
    return `looper-${looperState.id}:track-${track.index}`;
  }

  getLooperActionVoiceId(looperState, track, honkState) {
    return `${this.getLooperAutomationLayerId(looperState, track)}:instrument-${honkState.id}:action`;
  }

  updateLooperActionVoice(voiceId, honkState, snapshot, volume) {
    if (!honkState?.interactive || !honkState.root?.visible) {
      this.releaseSynthVoice(voiceId);
      return;
    }

    this.synth.update({
      voiceId,
      hornAmount: THREE.MathUtils.clamp(snapshot.squeeze || 0, 0, 1),
      masterGain: HONK_MASTER_GAIN * volume,
      leftEar: honkState.morphController.getEarAmount("left"),
      rightEar: honkState.morphController.getEarAmount("right"),
      nose: honkState.morphController.getValue(MORPH_TARGET_NAMES.nose),
      vowel: honkState.currentVowelLetter === "neutral" ? "A" : honkState.currentVowelLetter,
      pitchBendSemitones: honkState.bendValue * MAX_PITCH_BEND_SEMITONES,
      pitchSnap: honkState.pitchSnap,
    });
  }

  applyResolvedHonkMorphState(honkState, resolved) {
    honkState.morphController.setEar("left", resolved.earLeft);
    honkState.morphController.setEar("right", resolved.earRight);
    honkState.morphController.setNose(resolved.nose);
    this.applyVowelLetterToState(resolved.vowel, honkState, { updateLiveState: false, updateSynth: false });

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
  }

  connectLooperTrackToHonk(looperState, trackIndex, honkState) {
    this.looperController.connectTrackToHonk(looperState, trackIndex, honkState);
  }

  disconnectLooperTrack(looperState, trackIndex) {
    this.looperController.disconnectTrack(looperState, trackIndex);
  }

  updateLooperWires() {
    for (const looperState of this.instrumentStates) {
      const data = looperState.looperData;
      if (!data || !looperState.root?.visible) {
        continue;
      }

      for (const track of data.tracks) {
        if (!track.connectedHonkState?.root?.visible) {
          if (track.wireMesh) {
            this.disposeWireMesh(track.wireMesh);
            track.wireMesh = null;
          }
          continue;
        }
        this.updateLooperWireForTrack(looperState, track);
      }
    }
  }

  updateLooperWireForTrack(looperState, track) {
    if (!track?.nodeTarget || !track.connectedHonkState?.root?.visible) {
      return;
    }

    const honkTarget = track.connectedHonkState.hitTargets?.[HONK_CONNECTION_TARGET_NAME];
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
    this.updateWireMeshGeometry(track.wireMesh, tempWireStart, tempWireEnd);
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
    }

    if (instrumentState?.isLooper) {
      this.looperController.releaseLooper(instrumentState);
      for (const track of instrumentState.looperData?.tracks || []) {
        this.disposeWireMesh(track.wireMesh);
        track.wireMesh = null;
      }
      this.synth.releaseMatchingVoiceIds((voiceId) => voiceId.startsWith(`looper-${instrumentState.id}:`));
      return;
    }

    for (const looperState of this.instrumentStates) {
      const data = looperState.looperData;
      if (!data || looperState === instrumentState) {
        continue;
      }

      for (const track of data.tracks) {
        if (track.connectedHonkState === instrumentState) {
          this.disconnectLooperTrack(looperState, track.index);
        }
      }
    }
    this.looperController.releaseHonk(instrumentState);
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

    for (const track of data.tracks) {
      let nodeColor = track.connectedHonkState ? this.getLooperWireColor(track.index) : LOOPER_DEBUG_COLORS.nodeOpen;
      let opacity = track.connectedHonkState ? 0.5 : LOOPER_COLLIDER_OPACITY;
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
    this.setHitTargetDebugColor(
      looperState.hitTargets[getLooperControlName("speed")],
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
      const visibleOpacity = DEBUG_SHOW_COLLIDERS ? opacity : 0;
      target.userData.baseHitOpacity = visibleOpacity;
      target.material.opacity = visibleOpacity;
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

        if (this.areSqueezeColliderSpheresOverlapping(state, otherState)) {
          queue.push(otherState);
        }
      }
    }

    return chain;
  }

  areSqueezeColliderSpheresOverlapping(firstState, secondState) {
    if (
      !this.setSqueezeColliderSphere(firstState, tempSqueezeSphereA) ||
      !this.setSqueezeColliderSphere(secondState, tempSqueezeSphereB)
    ) {
      return false;
    }

    const radiusSum = tempSqueezeSphereA.radius + tempSqueezeSphereB.radius;
    if (!Number.isFinite(radiusSum) || radiusSum <= 0) {
      return false;
    }

    const distance = tempSqueezeSphereA.center.distanceTo(tempSqueezeSphereB.center);
    const overlapDepth = radiusSum - distance;
    if (overlapDepth <= 0) {
      return false;
    }

    const smallerDiameter = Math.min(tempSqueezeSphereA.radius, tempSqueezeSphereB.radius) * 2;
    return overlapDepth / Math.max(smallerDiameter, 0.0001) >= CHORD_SQUEEZE_SPHERE_MIN_INTERSECTION;
  }

  setSqueezeColliderSphere(state, targetSphere) {
    const squeezeCollider = state?.hitTargets?.[INTERACTION_TARGET_NAMES.horn];
    if (!squeezeCollider?.isMesh) {
      targetSphere.radius = -1;
      return false;
    }

    squeezeCollider.updateWorldMatrix(true, false);
    squeezeCollider.getWorldPosition(targetSphere.center);
    squeezeCollider.getWorldScale(tempSqueezeColliderScale);

    let localRadius = squeezeCollider.userData.colliderRadius;
    if (!Number.isFinite(localRadius) || localRadius <= 0) {
      localRadius = squeezeCollider.geometry?.parameters?.radius;
    }
    if (!Number.isFinite(localRadius) || localRadius <= 0) {
      squeezeCollider.geometry?.computeBoundingSphere?.();
      localRadius = squeezeCollider.geometry?.boundingSphere?.radius ?? 0;
    }

    const worldScale = Math.max(
      Math.abs(tempSqueezeColliderScale.x),
      Math.abs(tempSqueezeColliderScale.y),
      Math.abs(tempSqueezeColliderScale.z),
    );
    targetSphere.radius = localRadius * worldScale;
    return Number.isFinite(targetSphere.radius) && targetSphere.radius > 0;
  }

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
      const hitInstrumentState = nextTarget?.userData.instrumentState;
      const unlockedInteractionTarget =
        nextTarget &&
        nextTarget.name !== INTERACTION_TARGET_NAMES.body &&
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
    target.material.opacity =
      DEBUG_SHOW_COLLIDERS && highlighted ? Math.max(baseOpacity, 0.52) : baseOpacity;
    target.material.transparent = true;
    target.material.depthWrite = false;
    target.material.color.setHex(highlighted ? 0xffffff : getHitTargetColor(target));
  }

  isLooperColliderTarget(target) {
    return Boolean(target?.userData.isLooperCollider);
  }

  getPointedInstrumentState(controller) {
    const hit = this.getGripHit(controller) || this.getCurrentHit(controller);
    const instrumentState = hit?.object?.userData.instrumentState;
    if (instrumentState?.root?.visible && !instrumentState.pendingPlacement) {
      return instrumentState;
    }

    return this.getLockedInstrumentStateFromRay(controller);
  }

  getLockedInstrumentStateFromRay(controller) {
    if (this.isControllerStickActive(controller)) {
      return null;
    }

    return this.raycastSystem.getLockedInstrumentStateFromRay(controller);
  }

  getGripHit(controller) {
    if (this.isControllerStickActive(controller)) {
      return null;
    }

    return this.raycastSystem.getGripHit(controller);
  }

  setInstrumentLockedTexture(instrumentState, locked) {
    if (!instrumentState?.root) {
      return;
    }

    const textureSet = this.getTextureSetForInstrumentState(instrumentState);
    const baseMap = textureSet?.baseMap;
    const lockedBaseMap = textureSet?.lockedBaseMap;
    if (!baseMap || !lockedBaseMap) {
      return;
    }

    const useLockedTexture = Boolean(locked);
    if (instrumentState.lockedTextureApplied === useLockedTexture) {
      return;
    }

    const targetMap = useLockedTexture ? lockedBaseMap : baseMap;
    instrumentState.root.traverse((object) => {
      if (
        !object.isMesh ||
        object.userData.isHitTarget ||
        object.userData.isNoteLabel ||
        object.name.startsWith("DEBUG_") ||
        !object.material
      ) {
        return;
      }

      object.material = Array.isArray(object.material)
        ? object.material.map((material) => this.getTextureSwapMaterial(material, targetMap))
        : this.getTextureSwapMaterial(object.material, targetMap);
    });
    instrumentState.lockedTextureApplied = useLockedTexture;
  }

  getTextureSetForInstrumentState(instrumentState) {
    if (instrumentState?.isLooper || instrumentState?.componentId === LOOPER_COMPONENT_ID) {
      return this.looperMaterialTextures;
    }
    return this.instrumentMaterialTextures;
  }

  getTextureSwapMaterial(material, targetMap) {
    if (!material) {
      return material;
    }

    const targetMaterial = material.userData.lockTextureUniqueMaterial ? material : material.clone();
    targetMaterial.userData = {
      ...targetMaterial.userData,
      lockTextureUniqueMaterial: true,
      disposeOnInstrumentDelete: true,
    };
    targetMaterial.map = targetMap;
    targetMaterial.needsUpdate = true;
    return targetMaterial;
  }

  updateLockVisual(instrumentState) {
    this.setInstrumentLockedTexture(instrumentState, instrumentState?.locked);
    this.setLockIndicatorVisible(instrumentState, false);
  }

  setLockIndicatorVisible(instrumentState, visible) {
    const bodyTarget = instrumentState?.hitTargets?.[INTERACTION_TARGET_NAMES.body];
    if (!bodyTarget?.material) {
      return;
    }

    const baseOpacity =
      typeof bodyTarget.userData.baseHitOpacity === "number" ? bodyTarget.userData.baseHitOpacity : HIT_MARKER_OPACITY;
    bodyTarget.userData.lockIndicatorVisible = false;
    bodyTarget.material.color.setHex(getHitTargetColor(bodyTarget));
    bodyTarget.material.opacity = baseOpacity;
    bodyTarget.material.transparent = true;
    bodyTarget.material.depthWrite = false;
  }

  getCurrentHit(controller) {
    if (this.isControllerStickActive(controller)) {
      return null;
    }

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
    this.syncMorphColliderTravel(state);
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
    this.applyVowelLetterToState(vowelLetter, state);
  }

  setVowelByLetter(vowelLetter, state = this.activeInstrumentState) {
    this.applyVowelLetterToState(vowelLetter, state);
  }

  applyVowelLetterToState(
    vowelLetter,
    state = this.activeInstrumentState,
    { updateLiveState = true, updateSynth = true } = {},
  ) {
    if (!state) {
      return;
    }

    const normalized = vowelLetter && vowelLetter !== "neutral" ? vowelLetter : null;
    const vowelMorphName = normalized ? MORPH_TARGET_NAMES.vowels[normalized] : null;
    state.morphController.setVowel(normalized);
    state.currentVowelIndex = vowelMorphName ? VOWEL_MORPHS.indexOf(vowelMorphName) : -1;
    state.currentVowelLetter = normalized || "neutral";
    if (state === this.activeInstrumentState) {
      this.currentVowelIndex = state.currentVowelIndex;
      this.currentVowelLetter = state.currentVowelLetter;
    }
    if (updateLiveState) {
      state.performanceState?.setLiveState({ vowel: state.currentVowelLetter });
    }
    if (updateSynth) {
      this.synth.setVowel(normalized || "A");
    }
  }

  cycleVowel(state = this.activeInstrumentState) {
    if (!state) {
      return;
    }

    const nextIndex = (state.currentVowelIndex + 1) % VOWEL_MORPHS.length;
    const vowelMorphName = VOWEL_MORPHS[nextIndex];
    this.applyVowelLetterToState(VOWEL_LETTERS_BY_MORPH[vowelMorphName], state);
  }

  spawnInstrumentInFrontOfCamera() {
    this.spawnComponentInFrontOfCamera("honk");
  }

  spawnComponentInFrontOfCamera(componentId) {
    const componentOption = this.componentTemplates.get(componentId);
    const preset = SPAWN_PRESETS[componentOption?.preset];
    if (preset) {
      this.spawnScalePreset(preset.notes, preset.namePrefix);
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
    state.performanceState?.setLiveState({
      earLeft: pitchAmount,
      earRight: octaveAmount,
    });

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

    const defaultComponentId = "honk";
    const instrument = this.createSpawnedComponent(defaultComponentId);
    if (!instrument) {
      return;
    }
    this.positionObjectInFrontOfCamera(instrument, DEFAULT_INSTRUMENT_DISTANCE);
    instrument.position.y -= defaultComponentId === LOOPER_COMPONENT_ID ? 0.18 : 0.38;
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
    if (componentOption.id === LOOPER_COMPONENT_ID) {
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
