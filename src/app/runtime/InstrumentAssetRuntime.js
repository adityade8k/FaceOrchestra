import * as THREE from "three";
import { TextGeometry } from "three/addons/geometries/TextGeometry.js";
import { clone as cloneSkeletonAware } from "three/addons/utils/SkeletonUtils.js";
import { ASSET_PATHS } from "../../config/assets.js";
import {
  DEBUG_LOG_MORPHS,
  DEBUG_LOG_RAYCAST,
  DEBUG_SHOW_COLLIDERS,
} from "../../config/debug.js";
import {
  BEND_ALIGNED_COLLIDER_GROUP_NAME,
  INSTRUMENT_BASE_SCALE,
  INSTRUMENT_MAX_SCALE,
  INSTRUMENT_MIN_SCALE,
  INTERACTION_TARGET_NAMES,
  MORPH_TARGET_NAMES,
} from "../../config/honk.js";
import { LOOPER_COMPONENT_ID, LOOPER_TRACK_COUNT } from "../../config/looper.js";
import { METRONOME_COMPONENT_ID, METRONOME_SETTINGS } from "../../config/metronome.js";
import { SPAWN_CATALOG_ENTRIES } from "../../config/spawning.js";
import { STICK_SETTINGS } from "../../config/stick.js";
import { NOTE_LABEL_SETTINGS } from "../../config/ui.js";
import { InstructionPanel } from "../../ui/InstructionPanel.js";
import { getInteractionRole } from "../../instruments/core/interactionRoles.js";
import { createBodyGripTarget as createBodyGripTargetObject } from "../../instruments/core/BodyGripTargetFactory.js";
import { HONK_INTERACTION_ROLES } from "../../instruments/honk/HonkInstrument.js";
import { MorphTargetController, findMorphMeshes } from "../../instruments/honk/MorphTargetController.js";
import { LooperColliderFactory } from "../../instruments/looper/LooperColliderFactory.js";
import { applyStandardInstrumentMaterials } from "../../scene/materialUtils.js";

const CONTROLLER_RAY_LENGTH = 1.6;
const RAY_COLOR_DEFAULT = 0xf6d878;
const HIT_MARKER_OPACITY = DEBUG_SHOW_COLLIDERS ? 0.24 : 0;
const HONK_MODEL_PATH = ASSET_PATHS.models.honk;
const HONK_TEXTURE_PATHS = ASSET_PATHS.textures.honk;
const LOOPER_TEXTURE_PATHS = ASSET_PATHS.textures.looper;
const STICK_TEXTURE_PATHS = ASSET_PATHS.textures.stick;

export const InstrumentAssetRuntimeMethods = {
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
  },

  createRadialMenu() {
    return this.spawnMenuController?.createView?.() || this.radialSpawnMenu.create();
  },

  createInstructionPanel() {
    this.instructionPanelView = new InstructionPanel();
    this.instructionPanelView.attachTo(this.scene);
    this.instructionPanel = this.instructionPanelView.group;
    this.closeButton = this.instructionPanelView.closeButton;
  },

  async loadInstrument() {
    const honkModel = await this.assetRepository.loadModel("honk", HONK_MODEL_PATH);
    this.instrumentMaterialTextures = await this.assetRepository.loadTextureSet("honk", HONK_TEXTURE_PATHS);
    this.instrumentTemplate = honkModel;
    this.instrumentTemplate.name = "FaceInstrumentTemplate";
    this.instrumentTemplate.visible = false;
    applyStandardInstrumentMaterials(this.instrumentTemplate, this.instrumentMaterialTextures);

    const diagnostics = {
      root: this.instrumentTemplate,
      morphMeshes: findMorphMeshes(this.instrumentTemplate),
      hitTargets: collectNamedHitTargets(this.instrumentTemplate),
    };
    this.logModelDiagnostics(diagnostics);

    const honkEntry = SPAWN_CATALOG_ENTRIES.find(
      ({ kind, action }) => kind === "honk" && action === "instrument",
    );
    this.componentTemplates.set("honk", {
      ...honkEntry,
      id: "honk",
      kind: "honk",
      template: this.instrumentTemplate,
      interactive: true,
    });

    const metronomeEntry = SPAWN_CATALOG_ENTRIES.find(({ kind }) => kind === "metronome");
    this.componentTemplates.set(METRONOME_COMPONENT_ID, {
      ...metronomeEntry,
      id: METRONOME_COMPONENT_ID,
      kind: "metronome",
      template: new THREE.Group(),
      interactive: true,
    });

    const looperEntry = SPAWN_CATALOG_ENTRIES.find(({ kind }) => kind === "looper");
    if (looperEntry) await this.loadStaticComponentTemplate(looperEntry);
  },

  async loadStick() {
    if (!STICK_SETTINGS.enabled || !STICK_SETTINGS.modelPath) return;
    try {
      const stickModel = await this.assetRepository.loadModel("stick", STICK_SETTINGS.modelPath);
      this.stickMaterialTextures = await this.assetRepository.loadTextureSet("stick", STICK_TEXTURE_PATHS);
      this.stickTemplate = stickModel;
      this.stickTemplate.name = "StickTemplate";
      this.stickTemplate.visible = false;
      applyStandardInstrumentMaterials(this.stickTemplate, this.stickMaterialTextures);
    } catch (error) {
      console.warn("Could not load stick model:", error);
      this.stickTemplate = null;
    }
  },

  async loadNoteFont() {
    if (!NOTE_LABEL_SETTINGS.enabled || !NOTE_LABEL_SETTINGS.fontUrl) return null;
    if (!this.noteFontLoadPromise) {
      this.noteFontLoadPromise = this.assetRepository.loadFont("noteLabel", NOTE_LABEL_SETTINGS.fontUrl);
    }
    this.noteFont = await this.noteFontLoadPromise;
    return this.noteFont;
  },

  async loadStaticComponentTemplate(option) {
    const template = await this.assetRepository.loadModel(option.kind, option.modelPath);
    template.name = `${option.label}Template`;
    template.visible = false;
    if (option.kind === "looper") {
      applyStandardInstrumentMaterials(template, await this.loadLooperMaterialTextures());
    }
    this.componentTemplates.set(option.id, {
      ...option,
      template,
      interactive: false,
    });
  },

  async loadLooperMaterialTextures() {
    if (!this.looperMaterialTexturePromise) {
      this.looperMaterialTexturePromise = this.assetRepository.loadTextureSet("looper", LOOPER_TEXTURE_PATHS);
    }
    this.looperMaterialTextures = await this.looperMaterialTexturePromise;
    return this.looperMaterialTextures;
  },

  hasExpectedHonkMorphs(morphMeshes) {
    return morphMeshes.some((mesh) => mesh.morphTargetDictionary?.[MORPH_TARGET_NAMES.squeeze] !== undefined);
  },

  createBodyGripTarget(root, hitTargets) {
    createBodyGripTargetObject(root, hitTargets, {
      makeHitTargetMaterial: (name) => makeHitTargetMaterial(name),
      hitMarkerOpacity: HIT_MARKER_OPACITY,
    });
  },

  createMorphTargetSpheres(root, hitTargets) {
    const created = this.honkColliderFactory.create(root);
    for (const object of Object.values(created.targets)) hitTargets[object.name] = object;
    return created;
  },

  createHonkConnectionTarget() {
    // HonkColliderFactory creates the connector with the rest of the honk's
    // owned interaction geometry.
  },

  createLooperColliders(root, hitTargets) {
    new LooperColliderFactory({
      makeHitTargetMaterial: (name, color, opacity) => makeHitTargetMaterial(name, color, opacity),
    }).create(root, hitTargets);
  },

  initializeInstrumentState(state) {
    state.resetMorphs();
    this.setVowel(null, state);
    state.setLivePerformance({
      squeeze: 0,
      bend: 0,
      earLeft: state.tuning?.pitchControl ?? 0,
      earRight: state.tuning?.octaveControl ?? 0,
      nose: 0,
      vowel: "neutral",
    });
    const live = state.getLivePerformanceState();
    for (const sphere of this.getProceduralMorphTargetSpheres(state)) {
      const value = sphere.userData.interactionType === "ear"
        ? (sphere.userData.side === "left" ? live.earLeft : live.earRight)
        : sphere.userData.interactionType === "nose" ? live.nose : 0;
      this.setSpherePositionFromSignedValue(sphere, value);
    }
  },

  initializeLooperState(state) {
    state.root.updateMatrixWorld(true);
    state.root.getWorldPosition(state.looperData.lastPosition);
    state.root.getWorldQuaternion(state.looperData.lastQuaternion);
    state.setControl("volume", 0);
    state.setControl("gap", -1);
    state.setControl("speed", 0);
    this.updateLooperVisuals(state);
  },

  logModelDiagnostics(state) {
    if (!DEBUG_LOG_MORPHS && !DEBUG_LOG_RAYCAST) return;
    const morphNames = new Set();
    for (const mesh of state.morphMeshes) {
      Object.keys(mesh.morphTargetDictionary || {}).forEach((name) => morphNames.add(name));
    }
    if (DEBUG_LOG_MORPHS) console.log("Morph targets found:", [...morphNames].sort());
    if (DEBUG_LOG_RAYCAST) console.log("HIT_ targets found:", Object.keys(state.hitTargets).sort());
  },

  adjustInstrumentBaseScale(state, delta) {
    const target = this.transformTargetResolver.resolve(state);
    if (!target?.root) return;
    const profile = target.profile || target.transformProfile || this.getTransformProfile(state);
    const current = target.getScale?.() ?? state.baseScale;
    const next = THREE.MathUtils.clamp(
      current + delta,
      profile?.minScale ?? INSTRUMENT_MIN_SCALE,
      profile?.maxScale ?? INSTRUMENT_MAX_SCALE,
    );
    target.setScale?.(next);
    target.source?.updateMembers?.();
    if (target === state || target.source === state) state.baseScale = next;
  },

  setInstrumentBaseScale(state, scale) {
    if (!state?.root) return;
    const profile = this.getTransformProfile(state);
    state.baseScale = THREE.MathUtils.clamp(
      scale,
      profile.minScale ?? INSTRUMENT_MIN_SCALE,
      profile.maxScale ?? INSTRUMENT_MAX_SCALE,
    );
    this.applyInstrumentVisualScale(state);
  },

  applyInstrumentVisualScale(state, pulse = state.hornSqueezeValue ? 1 + state.hornSqueezeValue * 0.035 : 1) {
    if (state?.root) state.root.scale.setScalar(state.baseScale * pulse);
  },

  getRootUniformScale(root) {
    if (!root) return INSTRUMENT_BASE_SCALE;
    return Math.max((Math.abs(root.scale.x) + Math.abs(root.scale.y) + Math.abs(root.scale.z)) / 3, 0.0001);
  },

  createSpawnedComponent(componentId, options = {}) {
    const componentOption = this.componentTemplates.get(componentId) || this.componentTemplates.get("honk");
    if (!componentOption?.template) return null;
    if (componentOption.kind === "metronome" && this.instrumentRegistry.getByKind("metronome").length > 0) {
      return null;
    }

    const root = cloneSkeletonAware(componentOption.template);
    const kind = componentOption.kind;
    root.name = options.name || `${componentOption.label || kind}_${this.instrumentRegistry.size + 1}`;
    root.visible = true;
    root.userData.componentId = componentOption.id;
    this.scene.add(root);

    let hitTargets = collectNamedHitTargets(root);
    let domainTargets = {};
    if (kind === "honk") {
      const created = this.honkColliderFactory.create(root);
      domainTargets = created.targets;
      hitTargets = Object.fromEntries(Object.values(domainTargets).map((target) => [target.name, target]));
    } else if (kind === "metronome") {
      const created = this.metronomeColliderFactory.create(root);
      domainTargets = created.targets;
      hitTargets = Object.fromEntries(Object.values(domainTargets).map((target) => [target.name, target]));
    } else {
      this.createLooperColliders(root, hitTargets);
      this.createBodyGripTarget(root, hitTargets);
    }

    const morphMeshes = findMorphMeshes(root);
    const state = this.instrumentFactory.create({
      kind,
      register: false,
      id: options.id,
      root,
      targets: domainTargets,
      hitTargets,
      morphController: new MorphTargetController(root, {
        warnMissingExpectedMorphs: kind === "honk" && this.hasExpectedHonkMorphs(morphMeshes),
      }),
      tuning: options.tuning || {},
      bpm: options.bpm,
      volume: options.volume,
      componentId: componentOption.id,
    });

    decorateInstrumentEntity(state, {
      componentOption,
      hitTargets,
      morphMeshes,
      baseScale: this.getRootUniformScale(root),
    });

    if (kind === "looper") {
      for (const target of Object.values(hitTargets)) {
        state.registerInteractionTarget(getInteractionRole(kind, target), target);
      }
    } else {
      for (const [role, target] of Object.entries(domainTargets)) {
        applyTargetPresentationFlags(role, target);
      }
    }

    this.instrumentRegistry.add(state);
    state.attachTo(this.scene);
    if (kind === "honk") {
      this.initializeInstrumentState(state);
      this.createNoteLabel(state);
    } else if (kind === "looper") {
      this.initializeLooperState(state);
    } else if (kind === "metronome") {
      this.positionMetronomeControls(state);
      this.createMetronomeLabel(state);
    }
    this.activeInstrumentState = state;
    this.setInstrumentBaseScale(
      state,
      options.baseScale ?? (kind === "metronome" ? METRONOME_SETTINGS.baseScale : INSTRUMENT_BASE_SCALE),
    );
    return root;
  },
};

function decorateInstrumentEntity(state, { componentOption, hitTargets, morphMeshes, baseScale }) {
  state.componentId = componentOption.id;
  state.componentLabel = componentOption.label;
  state.morphMeshes = morphMeshes;
  state.hitTargets = hitTargets;
  state.hitTargetList = Object.values(hitTargets);
  state.gripTargetList = collectGripTargets(state.root);
  state.missingMorphWarnings ||= new Set();
  state.currentVowelIndex = state.morphs?.currentVowelIndex ?? -1;
  state.currentVowelLetter = state.morphs?.currentVowelLetter ?? "neutral";
  state.hornHolders = new Set();
  state.hornSqueezeValue = 0;
  state.baseScale = baseScale;
  state.locked ??= false;
  state.lockedTextureApplied = false;
  state.bendValue = 0;
  state.targetBendValue = 0;
  state.activeBends = new Map();
  state.noteLabelGroup = null;
  state.noteLabelMesh = null;
  state.noteLabelTextValue = null;
  state.metronomeLabelGroup = null;
  state.metronomeLabelMesh = null;
  state.metronomeLabelTextValue = null;
  state.metronomeLabelCanvas = null;
  state.metronomeLabelTexture = null;
  state.pitchSnap = state.tuning?.pitchSnap || componentOption.pitchSnap || null;
  state.scalePresetNote = state.tuning?.note || null;
  state.scalePresetNoteConfig = state.tuning?.note ? {
    label: state.tuning.note,
    note: state.tuning.note,
    semitonesFromF: state.tuning.semitonesFromF,
    octaveOffset: state.tuning.octaveOffset,
  } : null;
  state.raycastTargetsDirty = true;
  state.bendAlignedColliderGroup = state.root.getObjectByName(BEND_ALIGNED_COLLIDER_GROUP_NAME) || null;
}

function applyTargetPresentationFlags(role, target) {
  if (!target) return;
  if (role === HONK_INTERACTION_ROLES.body) target.userData.isBodyGripTarget = true;
  if (role === HONK_INTERACTION_ROLES.looperConnector) target.userData.isHonkConnectionTarget = true;
}

function collectNamedHitTargets(root) {
  const targets = {};
  root?.traverse?.((object) => {
    if (object.name?.startsWith("HIT_") || object.userData?.isHitTarget) {
      targets[object.name] = object;
    }
  });
  return targets;
}

function collectGripTargets(root) {
  const targets = [];
  root?.traverse?.((object) => {
    if (object.isMesh && object.userData?.isBodyGripTarget) targets.push(object);
  });
  return targets;
}

function makeHitTargetMaterial(_name, color = 0xffffff, opacity = HIT_MARKER_OPACITY) {
  const material = new THREE.MeshBasicMaterial({
    color: color ?? 0xffffff,
    transparent: true,
    opacity: DEBUG_SHOW_COLLIDERS ? opacity ?? HIT_MARKER_OPACITY : 0,
    depthTest: !DEBUG_SHOW_COLLIDERS,
    depthWrite: false,
    wireframe: DEBUG_SHOW_COLLIDERS,
  });
  material.userData.disposeOnInstrumentDelete = true;
  return material;
}

export { TextGeometry };
