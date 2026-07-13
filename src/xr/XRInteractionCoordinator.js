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
      case XRIntentType.ScaleStep:
        this.handlers.onScaleStep?.(controller, intent.direction);
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
    radialMenuSelectedIndex: 0,
    radialMenuControllerRoll: 0,
    radialMenuDialRotation: 0,
    radialMenuStartQuaternion: new THREE.Quaternion(),
  };
}
