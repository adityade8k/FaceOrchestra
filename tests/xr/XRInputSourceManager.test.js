import test from "node:test";
import assert from "node:assert/strict";

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
