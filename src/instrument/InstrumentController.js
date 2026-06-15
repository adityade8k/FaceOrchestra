import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkeletonAware } from "three/addons/utils/SkeletonUtils.js";
import {
  BEND_SENSITIVITY,
  BEND_SMOOTHING,
  DEBUG_LOG_MORPHS,
  DEBUG_SHOW_BOUNDING_BOXES,
  DEBUG_SHOW_COLLIDERS,
  DEBUG_SHOW_RAYS,
  DEFAULT_INSTRUMENT_DISTANCE,
  EAR_DRAG_SENSITIVITY,
  INSTRUMENT_BASE_SCALE,
  INSTRUMENT_TEXTURE_PATHS,
  INTERACTION_COLLIDERS,
  INTERACTION_TARGET_NAMES,
  MAX_PITCH_BEND_SEMITONES,
  MODEL_PATH,
  MORPH_TARGET_NAMES,
  NOSE_DRAG_SENSITIVITY,
  SHOW_INSTRUCTION_PANEL,
  SPATIAL_AUDIO_SETTINGS,
  SPAWN_DISTANCE,
  SPAWN_Y_OFFSET,
  SQUEEZE_SENSITIVITY,
  XR_BUTTONS,
} from "../config.js";
import { DebugVisuals } from "../debug/DebugVisuals.js";
import { MorphTargetController } from "./MorphTargetController.js";

export const DEBUG_SHOW_HIT_TARGETS = DEBUG_SHOW_COLLIDERS;
export const DEBUG_RAYCAST = DEBUG_SHOW_RAYS;

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
const tempMatrix = new THREE.Matrix4();
const tempVector = new THREE.Vector3();
const tempQuaternion = new THREE.Quaternion();
const tempScale = new THREE.Vector3();
const tempPanelTarget = new THREE.Vector3();
const tempSpawnForward = new THREE.Vector3();
const tempSpawnTarget = new THREE.Vector3();
const tempBox = new THREE.Box3();
const tempBoxA = new THREE.Box3();
const tempBoxB = new THREE.Box3();
const tempBoxCenter = new THREE.Vector3();
const tempBoxSize = new THREE.Vector3();
const tempBoxScaleSize = new THREE.Vector3();
const tempAudioPosition = new THREE.Vector3();
const tempAudioForward = new THREE.Vector3();
const tempAudioUp = new THREE.Vector3();
const tempListenerPosition = new THREE.Vector3();
const tempInstrumentToListener = new THREE.Vector3();

const PROCEDURAL_MORPH_TARGET_SPHERES = INTERACTION_COLLIDERS;

export function findMorphMesh(root) {
  const meshes = [];
  root.traverse((object) => {
    if (object.isMesh && object.morphTargetDictionary) {
      meshes.push(object);
    }
  });
  return meshes;
}

export function collectHitTargets(root) {
  const hitTargets = {};

  root.traverse((object) => {
    if (!object.name || !object.name.startsWith("HIT_")) {
      return;
    }

    hitTargets[object.name] = object;
    object.userData.isHitTarget = true;
    object.userData.baseHitOpacity = HIT_MARKER_OPACITY;

    if (object.isMesh) {
      if (!object.userData.isProceduralMorphTarget) {
        object.material = makeHitTargetMaterial(object.name);
      }
      object.material.opacity = object.userData.baseHitOpacity;
      object.material.transparent = true;
      object.material.depthWrite = false;
      object.renderOrder = object.userData.isProceduralMorphTarget ? 20 : 10;
    }
  });

  return hitTargets;
}

export function applyStandardInstrumentMaterials(root, textures = {}) {
  root.traverse((object) => {
    if (!object.isMesh || object.userData.isHitTarget) {
      return;
    }

    object.material = makeStandardInstrumentMaterial(object.material, textures);
    object.castShadow = true;
    object.receiveShadow = true;
  });
}

function makeStandardInstrumentMaterial(sourceMaterial, textures = {}) {
  return new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.baseMap ?? null,
    normalMap: textures.normalMap ?? null,
    roughnessMap: textures.roughnessMap ?? null,
    roughness: textures.roughnessMap ? 1 : sourceMaterial?.roughness ?? 0.48,
    metalness: sourceMaterial?.metalness ?? 0.02,
    side: THREE.DoubleSide,
  });
}

async function loadInstrumentMaterialTextures(textureLoader) {
  const [baseMap, normalMap, roughnessMap] = await Promise.all([
    textureLoader.loadAsync(INSTRUMENT_TEXTURE_PATHS.baseMap),
    textureLoader.loadAsync(INSTRUMENT_TEXTURE_PATHS.normalMap),
    textureLoader.loadAsync(INSTRUMENT_TEXTURE_PATHS.roughnessMap),
  ]);

  baseMap.colorSpace = THREE.SRGBColorSpace;

  for (const texture of [baseMap, normalMap, roughnessMap]) {
    texture.flipY = false;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
  }

  return { baseMap, normalMap, roughnessMap };
}

function makeHitTargetMaterial(name) {
  return new THREE.MeshBasicMaterial({
    color: getHitTargetColor(name),
    transparent: true,
    opacity: HIT_MARKER_OPACITY,
    depthWrite: false,
    wireframe: DEBUG_SHOW_COLLIDERS,
  });
}

function getHitTargetColor(name) {
  return {
    HIT_mouth: 0xf0a23c,
    HIT_horn: 0xf7d04a,
    HIT_nose: 0x5ac8fa,
    HIT_leftEar: 0x72d572,
    HIT_rightEar: 0x9e8cff,
    HIT_body: 0xffffff,
  }[name] || 0xffffff;
}

export class InstrumentController {
  constructor({ scene, camera, renderer, synth }) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.synth = synth;
    this.loader = new GLTFLoader();
    this.textureLoader = new THREE.TextureLoader();
    this.raycaster = new THREE.Raycaster();

    this.instrumentTemplate = null;
    this.instrumentMaterialTextures = null;
    this.nextInstrumentId = 1;
    this.instrumentStates = [];
    this.activeInstrumentState = null;

    this.controllers = [];
    this.controllerStates = new Map();

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
  }

  setupControllers() {
    for (let i = 0; i < 2; i += 1) {
      const controller = this.renderer.xr.getController(i);
      controller.userData.index = i;
      controller.userData.handedness = i === 1 ? "right" : "left";
      controller.addEventListener("connected", (event) => {
        controller.userData.handedness = event.data.handedness || controller.userData.handedness;
        controller.userData.gamepad = event.data.gamepad || null;
      });
      controller.addEventListener("disconnected", () => {
        controller.userData.gamepad = null;
      });

      const rayLine = this.createRayLine();
      controller.add(rayLine);
      controller.userData.rayLine = rayLine;

      this.controllers.push(controller);
      this.controllerStates.set(controller, {
        trigger: false,
        grip: false,
        a: false,
        x: false,
        hoveredTarget: null,
        activeTriggerInteraction: null,
        gripHeld: false,
        gripInstrumentState: null,
        gripOffsetMatrix: new THREE.Matrix4(),
      });
      this.scene.add(controller);

      const grip = this.renderer.xr.getControllerGrip(i);
      this.scene.add(grip);
    }
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

  createInstructionPanel() {
    const panelGroup = new THREE.Group();
    panelGroup.name = "InstructionPanel";

    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 720;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "rgba(20, 20, 18, 0.92)";
    roundRect(ctx, 0, 0, canvas.width, canvas.height, 36);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.22)";
    ctx.lineWidth = 5;
    ctx.stroke();

    ctx.fillStyle = "#f7efe2";
    ctx.font = "700 58px Arial";
    ctx.fillText("Face Orchestra XR", 72, 100);

    ctx.font = "38px Arial";
    ctx.fillStyle = "rgba(247, 239, 226, 0.92)";
    const lines = [
      "Close this panel to spawn the first face instrument.",
      "After closing, press A on the right controller to spawn another.",
      "Aim at the mouth and press trigger to cycle vowels.",
      "Aim at the horn and hold trigger to squeeze and play sound.",
      "Aim at ears or nose and hold trigger, then move up/down.",
      "Hold grip on the instrument to move and rotate it.",
    ];
    lines.forEach((line, index) => {
      ctx.fillText(line, 72, 176 + index * 70);
    });

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(1.45, 0.87),
      new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        side: THREE.DoubleSide,
      }),
    );
    panelGroup.add(panel);

    const closeButton = new THREE.Mesh(
      new THREE.PlaneGeometry(0.12, 0.12),
      new THREE.MeshBasicMaterial({
        color: 0x2a2925,
        transparent: true,
        opacity: 0.95,
        side: THREE.DoubleSide,
      }),
    );
    closeButton.name = "PANEL_CLOSE";
    closeButton.position.set(0.635, 0.355, 0.004);
    closeButton.userData.isCloseButton = true;
    panelGroup.add(closeButton);

    const xCanvas = document.createElement("canvas");
    xCanvas.width = 256;
    xCanvas.height = 256;
    const xCtx = xCanvas.getContext("2d");
    xCtx.fillStyle = "#f7efe2";
    xCtx.font = "700 170px Arial";
    xCtx.textAlign = "center";
    xCtx.textBaseline = "middle";
    xCtx.fillText("X", 128, 134);
    const xTexture = new THREE.CanvasTexture(xCanvas);
    xTexture.colorSpace = THREE.SRGBColorSpace;
    const xLabel = new THREE.Mesh(
      new THREE.PlaneGeometry(0.12, 0.12),
      new THREE.MeshBasicMaterial({ map: xTexture, transparent: true, side: THREE.DoubleSide }),
    );
    xLabel.name = "PANEL_CLOSE";
    xLabel.userData.isCloseButton = true;
    xLabel.position.z = 0.006;
    closeButton.add(xLabel);

    panelGroup.visible = false;
    this.instructionPanel = panelGroup;
    this.closeButton = closeButton;
    this.scene.add(panelGroup);
  }

  async loadInstrument() {
    const gltf = await this.loader.loadAsync(MODEL_PATH);
    this.instrumentMaterialTextures = await loadInstrumentMaterialTextures(this.textureLoader);
    this.instrumentTemplate = gltf.scene;
    this.instrumentTemplate.name = "FaceInstrumentTemplate";
    this.instrumentTemplate.visible = false;
    applyStandardInstrumentMaterials(this.instrumentTemplate, this.instrumentMaterialTextures);

    const templateMorphMeshes = findMorphMesh(this.instrumentTemplate);
    const templateHitTargets = collectHitTargets(this.instrumentTemplate);
    this.createBodyGripTarget(this.instrumentTemplate, templateHitTargets);
    this.createMorphTargetSpheres(this.instrumentTemplate, templateHitTargets);
    const templateState = this.createInstrumentState(
      this.instrumentTemplate,
      templateMorphMeshes,
      templateHitTargets,
      false,
    );

    this.logModelDiagnostics(templateState);
    this.initializeInstrumentState(templateState);
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
      missingMorphWarnings: new Set(),
      currentVowelIndex: -1,
      currentVowelLetter: "neutral",
      hornHolders: new Set(),
      hornSqueezeValue: 0,
      bendValue: 0,
      targetBendValue: 0,
      activeBends: new Map(),
    };
    state.morphController = new MorphTargetController(root);
    state.debugVisuals = DEBUG_SHOW_BOUNDING_BOXES ? new DebugVisuals(root, hitTargets) : null;
    this.nextInstrumentId += 1;

    if (attachToHitTargets) {
      root.traverse((object) => {
        if (object.userData.isHitTarget) {
          object.userData.instrumentState = state;
        }
      });
    }

    return state;
  }

  createBodyGripTarget(root, hitTargets) {
    const bodyBox = new THREE.Box3();
    let hasVisibleMesh = false;
    root.traverse((object) => {
      if (object.isMesh && !object.userData.isHitTarget) {
        object.updateWorldMatrix(true, false);
        bodyBox.expandByObject(object);
        hasVisibleMesh = true;
      }
    });

    if (!hasVisibleMesh || bodyBox.isEmpty()) {
      return;
    }

    bodyBox.getCenter(tempBoxCenter);
    bodyBox.getSize(tempBoxSize);
    const bodyTarget = new THREE.Mesh(
      new THREE.BoxGeometry(tempBoxSize.x * 1.12, tempBoxSize.y * 1.12, tempBoxSize.z * 1.12),
      makeHitTargetMaterial("HIT_body"),
    );
    bodyTarget.name = "HIT_body";
    bodyTarget.position.copy(tempBoxCenter);
    bodyTarget.userData.isHitTarget = true;
    bodyTarget.userData.isBodyGripTarget = true;
    bodyTarget.userData.baseHitOpacity = HIT_MARKER_OPACITY;
    bodyTarget.material.opacity = bodyTarget.userData.baseHitOpacity;
    bodyTarget.renderOrder = 5;

    root.add(bodyTarget);
    hitTargets.HIT_body = bodyTarget;
  }

  createMorphTargetSpheres(root, hitTargets) {
    tempBox.setFromObject(root);
    tempBox.getCenter(tempBoxCenter);
    tempBox.getSize(tempBoxSize);

    const maxSize = Math.max(tempBoxSize.x, tempBoxSize.y, tempBoxSize.z);

    for (const target of PROCEDURAL_MORPH_TARGET_SPHERES) {
      const radius = maxSize * target.size;
      const travel = tempBoxSize.y * target.movementRange;
      const neutralY = tempBoxCenter.y + target.y * tempBoxSize.y;
      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(radius, 24, 16),
        new THREE.MeshBasicMaterial({
          color: target.color,
          transparent: true,
          opacity: HIT_MARKER_OPACITY,
          depthWrite: false,
        }),
      );

      sphere.name = target.name;
      sphere.userData.isHitTarget = true;
      sphere.userData.isProceduralMorphTarget = true;
      sphere.userData.baseHitOpacity = HIT_MARKER_OPACITY;
      sphere.userData.interactionType = target.type;
      sphere.userData.side = target.side;
      sphere.userData.morphName = target.type === "nose" ? MORPH_TARGET_NAMES.nose : null;
      sphere.userData.invertVerticalMorph = Boolean(target.invertVerticalMorph);
      sphere.material.wireframe = DEBUG_SHOW_COLLIDERS;
      sphere.renderOrder = 20;
      sphere.userData.neutralY = neutralY;
      sphere.userData.minY = neutralY - travel;
      sphere.userData.maxY = neutralY + travel;
      sphere.position.set(
        tempBoxCenter.x + target.x * tempBoxSize.x,
        neutralY,
        tempBoxCenter.z + target.z * tempBoxSize.z,
      );

      root.add(sphere);
      hitTargets[target.name] = sphere;
    }

    console.log(
      "Procedural morph target spheres:",
      PROCEDURAL_MORPH_TARGET_SPHERES.map((target) => target.name),
    );
  }

  initializeInstrumentState(state) {
    state.morphController.resetAll();
    this.setVowel(null, state);
    for (const sphere of this.getProceduralMorphTargetSpheres(state)) {
      this.setSpherePositionFromSignedValue(sphere, 0);
    }
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

  showInstructionPanel() {
    if (!this.instructionPanel) {
      return;
    }

    this.instructionPanel.visible = true;
    this.panelVisible = true;
    this.pendingPanelPlacementFrames = 4;
  }

  hideInstructionPanel() {
    this.instructionPanel.visible = false;
    this.panelVisible = false;
  }

  closeInstructionPanel() {
    this.hideInstructionPanel();
    this.instructionPanelClosed = true;

    if (this.instrumentStates.length === 0) {
      this.spawnDefaultInstrumentPreview();
    }
  }

  update() {
    this.updatePendingPanelPlacement();
    this.pollControllers();
    this.updateRaycastHover();
    this.updateTriggerInteraction();
    this.updateGripTransform();
    this.updateHorn();
  }

  updatePendingPanelPlacement() {
    if (!this.pendingPanelPlacementFrames || !this.instructionPanel?.visible) {
      return;
    }

    this.positionPanelInFrontOfCamera(this.instructionPanel, 1.15);
    this.pendingPanelPlacementFrames -= 1;
  }

  pollControllers() {
    for (const controller of this.controllers) {
      this.pollController(controller);
    }
  }

  pollController(controller) {
    const state = this.controllerStates.get(controller);
    if (!state) {
      return;
    }

    const gamepad = controller.userData.gamepad || this.findGamepad(controller.userData.handedness);
    if (!gamepad) {
      return;
    }

    controller.userData.gamepad = gamepad;
    const next = {
      trigger: Boolean(gamepad.buttons[XR_BUTTONS.trigger]?.pressed),
      grip: Boolean(gamepad.buttons[XR_BUTTONS.grip]?.pressed),
      a: Boolean(gamepad.buttons[XR_BUTTONS.primary]?.pressed),
      x: Boolean(gamepad.buttons[XR_BUTTONS.primary]?.pressed),
    };

    if (controller.userData.handedness === "right" && next.a && !state.a) {
      this.handleAPress();
    }
    if (controller.userData.handedness === "left" && next.x && !state.x) {
      this.handleDeletePress(controller);
    }
    if (next.trigger && !state.trigger) {
      this.handleTriggerPress(controller);
    }
    if (!next.trigger && state.trigger) {
      this.handleTriggerRelease(controller);
    }
    if (next.grip && !state.grip) {
      this.handleGripPress(controller);
    }
    if (!next.grip && state.grip) {
      this.handleGripRelease(controller);
    }

    Object.assign(state, next);
  }

  findGamepad(handedness) {
    const gamepads = navigator.getGamepads ? [...navigator.getGamepads()] : [];
    return gamepads.find((gamepad) => gamepad?.hand === handedness) || null;
  }

  getRightController() {
    return this.controllers.find((controller) => controller.userData.handedness === "right") || this.controllers[1];
  }

  getControllerVoiceId(controller) {
    return controller.userData.handedness || `controller-${controller.userData.index}`;
  }

  getInstrumentVoiceId(controllerVoiceId, instrumentState) {
    return `${controllerVoiceId}:instrument-${instrumentState.id}`;
  }

  handleAPress() {
    if (!this.instructionPanelClosed) {
      return;
    }

    this.synth.ensureAudio();
    this.spawnInstrumentInFrontOfCamera();
  }

  handleDeletePress(controller) {
    const hit = this.getCurrentHit(controller);
    const instrumentState = hit?.object?.userData.instrumentState;
    if (!instrumentState) {
      return;
    }

    this.deleteInstrument(instrumentState);
  }

  deleteInstrument(instrumentState) {
    for (const controller of this.controllers) {
      const controllerState = this.controllerStates.get(controller);
      const interaction = controllerState?.activeTriggerInteraction;
      if (interaction?.activeVoiceIds?.has(this.getInstrumentVoiceId(interaction.voiceId, instrumentState))) {
        this.synth.resetPitchBend(this.getInstrumentVoiceId(interaction.voiceId, instrumentState));
        this.synth.release(this.getInstrumentVoiceId(interaction.voiceId, instrumentState));
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

      if (controllerState?.hoveredTarget && this.isObjectInInstrument(controllerState.hoveredTarget, instrumentState)) {
        this.setTargetHighlight(controllerState.hoveredTarget, false);
        controllerState.hoveredTarget = null;
      }
    }

    instrumentState.root.removeFromParent();
    this.instrumentStates = this.instrumentStates.filter((state) => state !== instrumentState);

    if (this.activeInstrumentState === instrumentState) {
      this.activeInstrumentState = this.instrumentStates.at(-1) || null;
    }
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
    const hit = this.getCurrentHit(controller);

    if (hit?.object?.userData.isCloseButton) {
      this.closeInstructionPanel();
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
      const voiceId = this.getControllerVoiceId(controller);
      controllerState.activeTriggerInteraction = {
        type: "holdSqueeze",
        targetName,
        instrumentState,
        voiceId,
        activeVoiceIds: new Set(),
        bendStartX: controller.position.x,
      };
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
    if (interaction?.type === "holdSqueeze") {
      for (const activeVoiceId of interaction.activeVoiceIds || []) {
        this.synth.resetPitchBend(activeVoiceId);
        this.synth.release(activeVoiceId);
      }
      interaction.instrumentState?.activeBends?.delete(interaction.voiceId);
    }
    controllerState.activeTriggerInteraction = null;
  }

  updateTriggerInteraction() {
    for (const controller of this.controllers) {
      const controllerState = this.controllerStates.get(controller);
      const interaction = controllerState?.activeTriggerInteraction;
      if (!interaction || interaction.type !== "verticalDragMorph") {
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
      interaction.instrumentState.morphController.setEar(interaction.side, value);
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
    const controllerState = this.controllerStates.get(controller);
    const hit = this.getCurrentHit(controller);
    const instrumentState = hit?.object?.userData.instrumentState;
    if (!instrumentState?.root || !instrumentState.root.visible || !hit?.object?.userData.isHitTarget) {
      return;
    }

    controllerState.gripHeld = true;
    controllerState.gripInstrumentState = instrumentState;
    controller.updateMatrixWorld(true);
    instrumentState.root.updateMatrixWorld(true);
    controllerState.gripOffsetMatrix.copy(controller.matrixWorld).invert().multiply(instrumentState.root.matrixWorld);
  }

  handleGripRelease(controller) {
    const controllerState = this.controllerStates.get(controller);
    controllerState.gripHeld = false;
    controllerState.gripInstrumentState = null;
  }

  updateGripTransform() {
    for (const controller of this.controllers) {
      const controllerState = this.controllerStates.get(controller);
      if (!controllerState?.gripHeld || !controllerState.gripInstrumentState?.root) {
        continue;
      }

      controller.updateMatrixWorld(true);
      tempMatrix.multiplyMatrices(controller.matrixWorld, controllerState.gripOffsetMatrix);
      tempMatrix.decompose(tempVector, tempQuaternion, tempScale);
      controllerState.gripInstrumentState.root.position.copy(tempVector);
      controllerState.gripInstrumentState.root.quaternion.copy(tempQuaternion);
      controllerState.gripInstrumentState.root.scale.copy(tempScale);
    }
  }

  updateHorn() {
    this.updateAudioListener();

    for (const state of this.instrumentStates) {
      state.hornHolders.clear();
      state.activeBends.clear();
    }

    const activeHoldInteractions = [];
    for (const controller of this.controllers) {
      const interaction = this.controllerStates.get(controller)?.activeTriggerInteraction;
      if (interaction?.type === "holdSqueeze" && interaction.instrumentState?.root?.visible) {
        activeHoldInteractions.push({ interaction, controller });
      }
    }

    for (const { interaction, controller } of activeHoldInteractions) {
      const chain = this.getTouchingInstrumentChain(interaction.instrumentState);
      const desiredVoiceIds = new Set();
      const bendAmount = THREE.MathUtils.clamp(
        (controller.position.x - interaction.bendStartX) * BEND_SENSITIVITY,
        -1,
        1,
      );

      for (const chainState of chain) {
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

      interaction.activeVoiceIds = desiredVoiceIds;
      interaction.activeChain = chain;
    }

    for (const state of this.instrumentStates) {
      state.hornSqueezeValue = THREE.MathUtils.lerp(
        state.hornSqueezeValue,
        state.hornHolders.size > 0 ? 1 : 0,
        SQUEEZE_SENSITIVITY,
      );
      state.morphController.setSqueeze(state.hornSqueezeValue);

      const bendSum = [...state.activeBends.values()].reduce((sum, value) => sum + value, 0);
      state.targetBendValue = state.hornHolders.size > 0 ? THREE.MathUtils.clamp(bendSum, -1, 1) : 0;
      state.bendValue = THREE.MathUtils.lerp(state.bendValue, state.targetBendValue, BEND_SMOOTHING);
      state.morphController.setBend(state.bendValue);

      const pulse = 1 + state.hornSqueezeValue * 0.035;
      state.root.scale.setScalar(INSTRUMENT_BASE_SCALE * pulse);
      state.debugVisuals?.update();
    }

    for (const { interaction } of activeHoldInteractions) {
      for (const synthState of interaction.activeChain || []) {
        const voiceId = this.getInstrumentVoiceId(interaction.voiceId, synthState);
        const pitchBendSemitones = synthState.targetBendValue * MAX_PITCH_BEND_SEMITONES;
        this.synth.update({
          voiceId,
          hornAmount: synthState.hornSqueezeValue,
          spatialGain: 1,
          masterGain: SPATIAL_AUDIO_SETTINGS.masterGain,
          leftEar: Math.abs(synthState.morphController.getEarAmount("left")),
          rightEar: Math.abs(synthState.morphController.getEarAmount("right")),
          nose: synthState.morphController.getValue(MORPH_TARGET_NAMES.nose),
          vowel: synthState.currentVowelLetter === "neutral" ? "A" : synthState.currentVowelLetter,
          pitchBendSemitones,
        });
        this.updateInstrumentSpatialVoice(voiceId, synthState);
      }
    }
  }

  updateAudioListener() {
    const userCamera = this.getUserCamera();
    userCamera.updateMatrixWorld(true);
    userCamera.getWorldPosition(tempAudioPosition);
    tempListenerPosition.copy(tempAudioPosition);
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

  getInstrumentSpatialGain(instrumentState) {
    instrumentState.root.updateWorldMatrix(true, true);
    instrumentState.root.getWorldPosition(tempAudioPosition);
    tempAudioForward.set(0, 0, 1).applyQuaternion(instrumentState.root.getWorldQuaternion(tempQuaternion)).normalize();

    const distanceSettings = SPATIAL_AUDIO_SETTINGS.distanceFalloff;
    const directionalSettings = SPATIAL_AUDIO_SETTINGS.directionalFalloff;
    const distance = tempAudioPosition.distanceTo(tempListenerPosition);
    const refDistance = distanceSettings.refDistance;
    const maxDistance = distanceSettings.maxDistance;
    const rolloff = distanceSettings.rolloffFactor;
    const clampedDistance = Math.min(distance, maxDistance);
    const distanceGain =
      clampedDistance <= refDistance
        ? 1
        : refDistance / (refDistance + rolloff * (clampedDistance - refDistance));

    tempInstrumentToListener.copy(tempListenerPosition).sub(tempAudioPosition).normalize();
    const angle = THREE.MathUtils.radToDeg(tempAudioForward.angleTo(tempInstrumentToListener));
    const inner = directionalSettings.coneInnerAngle * 0.5;
    const outer = directionalSettings.coneOuterAngle * 0.5;
    let directionalGain = 1;

    if (angle >= outer) {
      directionalGain = directionalSettings.coneOuterGain;
    } else if (angle > inner) {
      const t = (angle - inner) / Math.max(outer - inner, 0.0001);
      directionalGain = THREE.MathUtils.lerp(1, directionalSettings.coneOuterGain, t);
    }

    return THREE.MathUtils.clamp(distanceGain * directionalGain, 0.0001, 1);
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
    this.setInstrumentHitBodyBounds(firstState, tempBoxA).expandByScalar(SPATIAL_AUDIO_SETTINGS.contactChainMargin);
    this.setInstrumentHitBodyBounds(secondState, tempBoxB).expandByScalar(SPATIAL_AUDIO_SETTINGS.contactChainMargin);
    if (tempBoxA.isEmpty() || tempBoxB.isEmpty()) {
      return false;
    }
    return tempBoxA.intersectsBox(tempBoxB);
  }

  setInstrumentHitBodyBounds(instrumentState, targetBox) {
    const bodyTarget = instrumentState.hitTargets.HIT_body;
    targetBox.makeEmpty();

    if (bodyTarget) {
      bodyTarget.updateWorldMatrix(true, false);
      targetBox.setFromObject(bodyTarget);
      this.shrinkBoxForContactChain(targetBox);
      return targetBox;
    }

    return this.setInstrumentVisibleBounds(instrumentState, targetBox);
  }

  shrinkBoxForContactChain(targetBox) {
    if (targetBox.isEmpty()) {
      return;
    }

    targetBox.getCenter(tempBoxCenter);
    targetBox.getSize(tempBoxSize);
    tempBoxScaleSize.set(
      tempBoxSize.x * SPATIAL_AUDIO_SETTINGS.contactChainBoxScale.x,
      tempBoxSize.y * SPATIAL_AUDIO_SETTINGS.contactChainBoxScale.y,
      tempBoxSize.z * SPATIAL_AUDIO_SETTINGS.contactChainBoxScale.z,
    );
    targetBox.setFromCenterAndSize(tempBoxCenter, tempBoxScaleSize);
  }

  setInstrumentVisibleBounds(instrumentState, targetBox) {
    targetBox.makeEmpty();
    instrumentState.root.updateWorldMatrix(true, true);
    instrumentState.root.traverse((object) => {
      if (!object.isMesh || object.userData.isHitTarget) {
        return;
      }
      targetBox.expandByObject(object);
    });
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
          nextTarget?.userData.isProceduralMorphTarget ? RAY_COLOR_SPHERE_HOVER : RAY_COLOR_DEFAULT,
        );
      }
    }
  }

  setTargetHighlight(target, highlighted) {
    if (!target?.material) {
      return;
    }

    target.material.opacity = HIT_MARKER_OPACITY;
    target.material.transparent = true;
    target.material.depthWrite = false;
    target.material.color.setHex(getHitTargetColor(target.name));
  }

  getCurrentHit(controller) {
    if (!controller) {
      return null;
    }

    tempMatrix.identity().extractRotation(controller.matrixWorld);
    this.raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    this.raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

    const targets = [];
    if (this.panelVisible && this.closeButton) {
      targets.push(this.closeButton);
    }
    for (const state of this.instrumentStates) {
      if (state.root.visible) {
        targets.push(...state.hitTargetList);
      }
    }

    const intersections = this.raycaster.intersectObjects(targets, true);
    const hit =
      intersections.find((intersection) => intersection.object.userData.isProceduralMorphTarget) ||
      intersections.find((intersection) => intersection.object.name !== "HIT_body") ||
      intersections[0] ||
      null;

    if (DEBUG_RAYCAST && hit) {
      console.log("Ray hit:", hit.object.name);
    }

    return hit;
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
    if (!this.instrumentTemplate) {
      return;
    }

    const instrument = this.createSpawnedInstrument();
    this.positionObjectInFrontOfCamera(instrument, SPAWN_DISTANCE);
    instrument.scale.setScalar(INSTRUMENT_BASE_SCALE);
  }

  spawnDefaultInstrumentPreview() {
    if (!this.instrumentTemplate || this.instrumentStates.length > 0) {
      return;
    }

    const instrument = this.createSpawnedInstrument();
    this.positionObjectInFrontOfCamera(instrument, DEFAULT_INSTRUMENT_DISTANCE);
    instrument.position.y -= 0.38;
    instrument.scale.setScalar(INSTRUMENT_BASE_SCALE);
  }

  createSpawnedInstrument() {
    const instrument = cloneSkeletonAware(this.instrumentTemplate);
    instrument.name = `FaceInstrument_${this.instrumentStates.length + 1}`;
    instrument.visible = true;
    instrument.traverse((object) => {
      delete object.userData.instrumentState;
    });
    this.scene.add(instrument);

    const state = this.createInstrumentState(instrument);
    this.initializeInstrumentState(state);
    this.instrumentStates.push(state);
    this.activeInstrumentState = state;

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

  positionPanelInFrontOfCamera(object, distance) {
    const userCamera = this.getUserCamera();
    userCamera.updateMatrixWorld(true);
    userCamera.getWorldPosition(tempVector);
    userCamera.getWorldDirection(tempScale);

    object.position.copy(tempVector).addScaledVector(tempScale, distance);
    object.position.y = tempVector.y - 0.02;

    tempPanelTarget.copy(tempVector);
    tempPanelTarget.y = object.position.y;
    object.lookAt(tempPanelTarget);
  }

  getUserCamera() {
    if (this.renderer.xr.isPresenting) {
      return this.renderer.xr.getCamera(this.camera);
    }
    return this.camera;
  }
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}
