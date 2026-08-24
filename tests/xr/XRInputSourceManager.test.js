import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { XRInputSourceManager } from "../../src/xr/XRInputSourceManager.js";
import { XRIntentMapper, XRIntentType } from "../../src/xr/XRIntentMapper.js";

function createController() {
  return {
    userData: {},
    children: [],
    listeners: new Map(),
    add(child) {
      this.children.push(child);
    },
    addEventListener(type, listener) {
      this.listeners.set(type, listener);
    },
  };
}

function createGamepad() {
  return {
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 6 }, () => ({ pressed: false })),
  };
}

function createHarness() {
  const controllers = [createController(), createController()];
  const events = [];
  const manager = new XRInputSourceManager({
    renderer: {
      xr: {
        getController: (index) => controllers[index],
        getControllerGrip: (index) => ({ type: "grip", index }),
      },
    },
    scene: { add: () => {} },
    onInput: (event) => events.push(event),
  });
  manager.setup();
  return { controllers, events, manager };
}

test("simultaneous Grip+A emits Grip first and only one primary press transition", () => {
  const { controllers, events, manager } = createHarness();
  const controller = controllers[1];
  const gamepad = createGamepad();
  controller.userData.gamepad = gamepad;
  gamepad.buttons[1].pressed = true;
  gamepad.buttons[4].pressed = true;

  manager.pollController(controller, 100);

  assert.deepEqual(
    events.map(({ button, pressed }) => ({ button, pressed })),
    [
      { button: "grip", pressed: true },
      { button: "primary", pressed: true },
    ],
  );

  manager.pollController(controller, 101);
  assert.equal(events.length, 2);

  gamepad.buttons[4].pressed = false;
  manager.pollController(controller, 102);
  assert.deepEqual(
    events.slice(2).map(({ button, pressed }) => ({ button, pressed })),
    [{ button: "primary", pressed: false }],
  );
});

test("right primary maps to spawn open/confirm without changing the left-hand delete mapping", () => {
  const mapper = new XRIntentMapper();
  const base = {
    type: "button.transition",
    button: "primary",
    controller: {},
    controllerId: "controller-right",
    timestamp: 100,
  };

  assert.equal(
    mapper.map({ ...base, handedness: "right", pressed: true })[0].type,
    XRIntentType.SpawnMenuOpen,
  );
  assert.equal(
    mapper.map({ ...base, handedness: "right", pressed: false })[0].type,
    XRIntentType.SpawnMenuConfirm,
  );
  assert.equal(
    mapper.map({ ...base, handedness: "left", pressed: true })[0].type,
    XRIntentType.InstrumentDelete,
  );
});

test("thumbstick X and Y emit independent edge-triggered steps with intuitive signs", () => {
  const { controllers, events, manager } = createHarness();
  const controller = controllers[1];
  const gamepad = createGamepad();
  controller.userData.gamepad = gamepad;

  gamepad.axes[2] = 0.8;
  gamepad.axes[3] = -0.8;
  manager.pollController(controller, 100);
  assert.deepEqual(
    events.map(({ axis, direction }) => ({ axis, direction })),
    [
      { axis: "thumbstickX", direction: 1 },
      { axis: "thumbstickY", direction: 1 },
    ],
  );

  manager.pollController(controller, 101);
  assert.equal(events.length, 2);

  gamepad.axes[2] = 0;
  gamepad.axes[3] = 0;
  manager.pollController(controller, 102);
  gamepad.axes[2] = -0.8;
  gamepad.axes[3] = 0.8;
  manager.pollController(controller, 103);
  assert.deepEqual(
    events.slice(2).map(({ axis, direction }) => ({ axis, direction })),
    [
      { axis: "thumbstickX", direction: 0 },
      { axis: "thumbstickY", direction: 0 },
      { axis: "thumbstickX", direction: -1 },
      { axis: "thumbstickY", direction: -1 },
    ],
  );
});

test("thumbstick X maps to horizontal scaling while Y maps only to preview distance", () => {
  const mapper = new XRIntentMapper();
  const base = {
    type: "axis.step",
    controller: {},
    controllerId: "controller-right",
    handedness: "right",
    timestamp: 100,
    direction: 1,
  };
  assert.equal(
    mapper.map({ ...base, axis: "thumbstickX" })[0].type,
    XRIntentType.HorizontalScaleStep,
  );
  assert.equal(
    mapper.map({ ...base, axis: "thumbstickY" })[0].type,
    XRIntentType.PreviewDistanceStep,
  );
});

test("horizontal steps drive both preview and grip scaling while vertical steps only drive preview distance", () => {
  const source = readFileSync(
    new URL("../../src/app/runtime/XRInteractionRuntime.js", import.meta.url),
    "utf8",
  );
  const horizontal = source.match(
    /handleHorizontalScaleStepIntent[\s\S]*?(?=handlePreviewDistanceStepIntent)/,
  )?.[0] || "";
  const vertical = source.match(
    /handlePreviewDistanceStepIntent[\s\S]*?(?=updateGripTransform)/,
  )?.[0] || "";

  assert.match(horizontal, /handlePendingSpawnScaleThumbstick/);
  assert.match(horizontal, /gripTransformSystem\?\.handleScaleStep/);
  assert.doesNotMatch(horizontal, /handlePendingSpawnDistanceThumbstick/);
  assert.match(vertical, /handlePendingSpawnDistanceThumbstick/);
  assert.doesNotMatch(vertical, /gripTransformSystem|handlePendingSpawnScaleThumbstick/);
});
