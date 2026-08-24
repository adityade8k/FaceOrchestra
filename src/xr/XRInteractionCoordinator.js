import * as THREE from "three";
import { XRIntentType } from "./XRIntentMapper.js";

export const ControllerMode = Object.freeze({
  IDLE: "IDLE",
  MENU_OPEN: "MENU_OPEN",
  SPAWN_PREVIEW: "SPAWN_PREVIEW",
  RAY_INTERACTING: "RAY_INTERACTING",
  GRIP_TRANSFORMING: "GRIP_TRANSFORMING",
  STICK_EQUIPPED: "STICK_EQUIPPED",
});

export class XRInteractionCoordinator {
  constructor({ intentMapper, handlers = {} } = {}) {
    this.intentMapper = intentMapper;
    this.handlers = handlers;
    this.controllerStates = new Map();
    this.pendingInputs = [];
  }

  registerController(controller) {
    const state = createControllerInteractionState();
    this.controllerStates.set(controller, state);
    return state;
  }

  receiveInput(inputEvent) {
    const state = this.controllerStates.get(inputEvent.controller);
    if (!state) return;

    if (inputEvent.type === "button.transition") {
      state[inputEvent.button] = inputEvent.pressed;
    }
    for (const intent of this.intentMapper.map(inputEvent)) {
      this.route(intent, state);
    }
  }

  enqueueInput(inputEvent) {
    this.pendingInputs.push(inputEvent);
  }

  flushInputs() {
    const inputs = this.pendingInputs.splice(0);
    for (const input of inputs) this.receiveInput(input);
    return inputs.length;
  }

  route(intent, state) {
    const controller = intent.controller;
    switch (intent.type) {
      case XRIntentType.SpawnMenuOpen:
        this.handlers.onSpawnMenuOpen?.(controller, state.grip);
        break;
      case XRIntentType.SpawnMenuConfirm:
        this.handlers.onSpawnMenuConfirm?.(controller);
        break;
      case XRIntentType.ContextSecondary:
        this.handlers.onContextSecondary?.(controller);
        break;
      case XRIntentType.InstrumentDelete:
        this.handlers.onInstrumentDelete?.(controller);
        break;
      case XRIntentType.TriggerBegin:
        this.handlers.onTriggerBegin?.(controller);
        break;
      case XRIntentType.TriggerEnd:
        this.handlers.onTriggerEnd?.(controller);
        break;
      case XRIntentType.GripBegin:
        if (state.radialMenuOpen) this.handlers.onSpawnMenuCancel?.(controller);
        this.handlers.onGripBegin?.(controller);
        break;
      case XRIntentType.GripEnd:
        this.handlers.onGripEnd?.(controller);
        break;
      case XRIntentType.HorizontalScaleStep:
        this.handlers.onHorizontalScaleStep?.(controller, intent.direction);
        break;
      case XRIntentType.PreviewDistanceStep:
        this.handlers.onPreviewDistanceStep?.(controller, intent.direction);
        break;
      default:
        this.handlers.onIntent?.(intent);
    }
  }

  setMode(controller, mode) {
    const state = this.controllerStates.get(controller);
    if (state) state.mode = mode;
  }

  resetController(controller) {
    const previous = this.controllerStates.get(controller);
    if (!previous) return;
    const replacement = createControllerInteractionState();
    if (previous.gripOffsetMatrix) replacement.gripOffsetMatrix.copy(previous.gripOffsetMatrix.identity());
    this.controllerStates.set(controller, replacement);
  }

  resetSession() {
    this.pendingInputs.length = 0;
    for (const controller of this.controllerStates.keys()) {
      this.resetController(controller);
    }
  }
}

function createControllerInteractionState() {
  return {
    mode: ControllerMode.IDLE,
    trigger: false,
    grip: false,
    primary: false,
    secondary: false,
    thumbstickScaleDirection: 0,
    hoveredTarget: null,
    raycastContactTarget: null,
    raycastHapticCooldownUntilMs: 0,
    activeTriggerInteraction: null,
    suppressTriggerUntilRelease: false,
    gripHeld: false,
    gripInstrumentState: null,
    gripSourceInstrumentState: null,
    gripOffsetMatrix: new THREE.Matrix4(),
    equippedStickId: null,
    stickActive: false,
    raySqueezeVoiceId: null,
    raySqueezeActiveVoiceIds: new Set(),
    raySqueezeInstrumentState: null,
    raySqueezeStartQuaternion: new THREE.Quaternion(),
    raySqueezeStartInverseQuaternion: new THREE.Quaternion(),
    radialMenuOpen: false,
    radialMenuCancelled: false,
    radialMenuPhase: "parent",
    radialMenuParentSelectedIndex: 0,
    radialMenuChildSelectedIndex: 0,
    radialMenuLatchedParentIndex: null,
    radialMenuParentControllerRoll: 0,
    radialMenuChildControllerRoll: 0,
    radialMenuParentDialRotation: 0,
    radialMenuChildDialRotation: 0,
    radialMenuParentDialBaseRotation: 0,
    radialMenuChildDialBaseRotation: 0,
    radialMenuParentRingRotation: 0,
    radialMenuChildRingRotation: 0,
    radialMenuParentRingBaseRotation: 0,
    radialMenuChildRingBaseRotation: 0,
    radialMenuOpeningWorldPosition: new THREE.Vector3(),
    radialMenuOpeningViewerWorldPosition: new THREE.Vector3(),
    radialMenuOpeningMenuWorldPosition: new THREE.Vector3(),
    radialMenuOpeningWorldQuaternion: new THREE.Quaternion(),
    radialMenuParentStartQuaternion: new THREE.Quaternion(),
    radialMenuChildStartQuaternion: new THREE.Quaternion(),
    radialMenuPullAxis: new THREE.Vector3(0, 0, 1),
    radialMenuPullAxisLocalZSign: 1,
    radialMenuPullDistance: 0,
  };
}
