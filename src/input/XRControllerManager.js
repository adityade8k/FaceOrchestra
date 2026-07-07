import * as THREE from "three";
import { XR_AXES, XR_BUTTONS } from "../config/xr.js";
import { SCALE_JOYSTICK_DEADZONE } from "../config/ui.js";

export class XRControllerManager {
  constructor({
    renderer,
    scene,
    createRayLine,
    createRadialMenu,
    handlers = {},
  }) {
    this.renderer = renderer;
    this.scene = scene;
    this.createRayLine = createRayLine;
    this.createRadialMenu = createRadialMenu;
    this.handlers = handlers;
    this.controllers = [];
    this.controllerStates = new Map();
  }

  setup() {
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

      const radialMenu = this.createRadialMenu();
      controller.add(radialMenu);
      controller.userData.radialMenu = radialMenu;

      this.controllers.push(controller);
      this.controllerStates.set(controller, createControllerState());
      this.scene.add(controller);

      const grip = this.renderer.xr.getControllerGrip(i);
      this.scene.add(grip);
    }
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
      b: Boolean(gamepad.buttons[XR_BUTTONS.secondary]?.pressed),
      x: Boolean(gamepad.buttons[XR_BUTTONS.primary]?.pressed),
      y: Boolean(gamepad.buttons[XR_BUTTONS.secondary]?.pressed),
    };
    const thumbstickScaleDirection = this.getThumbstickScaleDirection(gamepad);

    if (controller.userData.handedness === "right" && next.a && !state.a) {
      this.handlers.onAPress?.(controller, next.grip);
    }
    if (controller.userData.handedness === "right" && !next.a && state.a) {
      this.handlers.onARelease?.(controller);
    }
    if (controller.userData.handedness === "right" && next.b && !state.b) {
      this.handlers.onBPress?.(controller);
    }
    if (controller.userData.handedness === "left" && next.x && !state.x) {
      this.handlers.onDeletePress?.(controller);
    }
    if (controller.userData.handedness === "left" && next.y && !state.y) {
      this.handlers.onDisconnectPress?.(controller);
    }
    if (next.trigger && !state.trigger) {
      this.handlers.onTriggerPress?.(controller);
    }
    if (!next.trigger && state.trigger) {
      this.handlers.onTriggerRelease?.(controller);
    }
    if (next.grip && !state.grip && state.radialMenuOpen) {
      this.handlers.onRadialMenuCancel?.(controller);
    } else if (next.grip && !state.grip) {
      this.handlers.onGripPress?.(controller);
    }
    if (!next.grip && state.grip) {
      this.handlers.onGripRelease?.(controller);
    }
    this.handlers.onGripScaleThumbstick?.(controller, thumbstickScaleDirection);

    Object.assign(state, next);
  }

  findGamepad(handedness) {
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (let i = 0; i < gamepads.length; i += 1) {
      const gamepad = gamepads[i];
      if (gamepad?.hand === handedness) {
        return gamepad;
      }
    }
    return null;
  }

  getThumbstickScaleDirection(gamepad) {
    const axes = gamepad?.axes || [];
    const configuredY = axes[XR_AXES.thumbstickY];
    const fallbackY = axes[1];
    const y = Number.isFinite(configuredY) ? configuredY : Number.isFinite(fallbackY) ? fallbackY : 0;

    if (y < -SCALE_JOYSTICK_DEADZONE) {
      return 1;
    }
    if (y > SCALE_JOYSTICK_DEADZONE) {
      return -1;
    }
    return 0;
  }

  getRightController() {
    return this.controllers.find((controller) => controller.userData.handedness === "right") || this.controllers[1];
  }
}

function createControllerState() {
  return {
    trigger: false,
    grip: false,
    a: false,
    b: false,
    x: false,
    y: false,
    thumbstickScaleDirection: 0,
    hoveredTarget: null,
    activeTriggerInteraction: null,
    suppressTriggerUntilRelease: false,
    gripHeld: false,
    gripInstrumentState: null,
    gripOffsetMatrix: new THREE.Matrix4(),
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
