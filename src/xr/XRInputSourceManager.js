import { XR_AXES, XR_BUTTONS } from "./controllerBindings.js";
import { SCALE_JOYSTICK_DEADZONE } from "../config/spawning.js";

export class XRInputSourceManager {
  constructor({ renderer, scene, createRayLine, createRadialMenu, onInput = () => {} }) {
    this.renderer = renderer;
    this.scene = scene;
    this.createRayLine = createRayLine;
    this.createRadialMenu = createRadialMenu;
    this.onInput = onInput;
    this.controllers = [];
    this.hardwareStates = new Map();
  }

  setup(onController = null) {
    for (let index = 0; index < 2; index += 1) {
      const controller = this.renderer.xr.getController(index);
      controller.userData.index = index;
      controller.userData.controllerId = `controller-${index}`;
      controller.userData.handedness = index === 1 ? "right" : "left";
      controller.addEventListener("connected", (event) => {
        controller.userData.handedness = event.data.handedness || controller.userData.handedness;
        controller.userData.gamepad = event.data.gamepad || null;
      });
      controller.addEventListener("disconnected", () => {
        controller.userData.gamepad = null;
        this.hardwareStates.set(controller, createHardwareState());
      });

      const rayLine = this.createRayLine?.();
      if (rayLine) {
        controller.add(rayLine);
        controller.userData.rayLine = rayLine;
      }
      const radialMenu = this.createRadialMenu?.();
      if (radialMenu) {
        controller.add(radialMenu);
        controller.userData.radialMenu = radialMenu;
      }

      this.controllers.push(controller);
      this.hardwareStates.set(controller, createHardwareState());
      this.scene.add(controller);
      this.scene.add(this.renderer.xr.getControllerGrip(index));
      onController?.(controller);
    }
  }

  poll(now = performance.now()) {
    for (const controller of this.controllers) this.pollController(controller, now);
  }

  pollController(controller, now = performance.now()) {
    const state = this.hardwareStates.get(controller);
    const gamepad = this.getGamepad(controller);
    if (!state || !gamepad) return;

    const nextButtons = {
      trigger: Boolean(gamepad.buttons[XR_BUTTONS.trigger]?.pressed),
      grip: Boolean(gamepad.buttons[XR_BUTTONS.grip]?.pressed),
      primary: Boolean(gamepad.buttons[XR_BUTTONS.primary]?.pressed),
      secondary: Boolean(gamepad.buttons[XR_BUTTONS.secondary]?.pressed),
    };
    for (const [button, pressed] of Object.entries(nextButtons)) {
      if (state.buttons[button] === pressed) continue;
      state.buttons[button] = pressed;
      this.onInput({
        type: "button.transition",
        controller,
        controllerId: controller.userData.controllerId,
        handedness: controller.userData.handedness,
        button,
        pressed,
        timestamp: now,
      });
    }

    const direction = this.getThumbstickScaleDirection(gamepad);
    if (direction !== state.thumbstickDirection) {
      state.thumbstickDirection = direction;
      this.onInput({
        type: "axis.step",
        axis: "thumbstickY",
        controller,
        controllerId: controller.userData.controllerId,
        handedness: controller.userData.handedness,
        direction,
        timestamp: now,
      });
    }
  }

  getGamepad(controller) {
    return controller?.userData?.gamepad || this.findGamepad(controller?.userData?.handedness);
  }

  findGamepad(handedness) {
    const gamepads = navigator.getGamepads?.() || [];
    for (const gamepad of gamepads) {
      if (gamepad?.hand === handedness) return gamepad;
    }
    return null;
  }

  getThumbstickScaleDirection(gamepad) {
    const axes = gamepad?.axes || [];
    const configured = axes[XR_AXES.thumbstickY];
    const value = Number.isFinite(configured) ? configured : Number.isFinite(axes[1]) ? axes[1] : 0;
    if (value < -SCALE_JOYSTICK_DEADZONE) return 1;
    if (value > SCALE_JOYSTICK_DEADZONE) return -1;
    return 0;
  }

  getRightController() {
    return this.controllers.find(({ userData }) => userData.handedness === "right") || this.controllers[1];
  }

  resetSession() {
    for (const controller of this.controllers) {
      controller.userData.gamepad = null;
      this.hardwareStates.set(controller, createHardwareState());
      if (controller.userData.rayLine) controller.userData.rayLine.visible = false;
      if (controller.userData.radialMenu) controller.userData.radialMenu.visible = false;
    }
  }
}

function createHardwareState() {
  return {
    buttons: { trigger: false, grip: false, primary: false, secondary: false },
    thumbstickDirection: 0,
  };
}
