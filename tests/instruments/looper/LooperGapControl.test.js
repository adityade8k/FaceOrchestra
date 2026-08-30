import test from "node:test";
import assert from "node:assert/strict";

import {
  LOOPER_CONTROL_COLLIDERS,
  LOOPER_CONTROL_DEFAULT_VALUES,
  LOOPER_CONTROL_MORPH_TARGETS,
} from "../../../src/config/looper.js";
import { LooperController } from "../../../src/instruments/looper/LooperController.js";
import {
  getClosestLooperControlValue,
  getLooperControlColliderPosition,
  getLooperControlMorphWeights,
  getLooperControlValueFromDrag,
} from "../../../src/instruments/looper/view/looperControlPresentation.js";

test("Gap keeps its exact morph binding and defaults to the physical down endpoint", () => {
  assert.deepEqual(LOOPER_CONTROL_DEFAULT_VALUES, { volume: 0, gap: -1 });
  assert.deepEqual(Object.keys(LOOPER_CONTROL_COLLIDERS).sort(), ["gap", "volume"]);
  assert.deepEqual(LOOPER_CONTROL_MORPH_TARGETS.gap, {
    down: "Right_handle_down",
    up: "right_handle_up",
  });

  const controlPath = {
    downAnchor: { x: 2, y: -4, z: 1 },
    neutralAnchor: { x: 1, y: 0, z: 2 },
    upAnchor: { x: 4, y: 3, z: 5 },
  };
  assert.deepEqual(getLooperControlColliderPosition({ looperControlPath: controlPath }, -1), controlPath.downAnchor);
  assert.deepEqual(getLooperControlMorphWeights(-1), { up: 0, down: 1 });
});

test("geometry-derived collider positions interpolate the two exact morph segments", () => {
  const userData = { looperControlPath: {
    downAnchor: { x: -2, y: -4, z: -6 },
    neutralAnchor: { x: 0, y: 0, z: 0 },
    upAnchor: { x: 4, y: 8, z: 12 },
  } };
  const expected = new Map([
    [-1, { x: -2, y: -4, z: -6 }],
    [-0.25, { x: -0.5, y: -1, z: -1.5 }],
    [0, { x: 0, y: 0, z: 0 }],
    [0.5, { x: 2, y: 4, z: 6 }],
    [1, { x: 4, y: 8, z: 12 }],
  ]);
  for (const [value, position] of expected) {
    assert.deepEqual(getLooperControlColliderPosition(userData, value), position);
  }
});

test("closest-path dragging maps both segments to signed values", () => {
  const path = {
    downAnchor: { x: -2, y: 0, z: 0 },
    neutralAnchor: { x: 0, y: 0, z: 0 },
    upAnchor: { x: 0, y: 4, z: 0 },
  };
  assert.equal(getClosestLooperControlValue(path, { x: -1, y: 0.2, z: 0 }), -0.5);
  assert.equal(getClosestLooperControlValue(path, { x: 0.1, y: 3, z: 0 }), 0.75);
  assert.equal(getClosestLooperControlValue(path, { x: -20, y: 0, z: 0 }), -1);
  assert.equal(getClosestLooperControlValue(path, { x: 0, y: 20, z: 0 }), 1);
});

test("dragging applies root-local controller displacement without a trigger-press jump", () => {
  const path = {
    downAnchor: { x: -2, y: 0, z: 0 },
    neutralAnchor: { x: 0, y: 0, z: 0 },
    upAnchor: { x: 0, y: 4, z: 0 },
  };
  const startingController = { x: 8, y: 9, z: 10 };
  const startingCollider = getLooperControlColliderPosition({ looperControlPath: path }, 0.5);
  assert.equal(
    getLooperControlValueFromDrag(path, startingController, startingCollider, startingController),
    0.5,
  );
  assert.equal(
    getLooperControlValueFromDrag(path, startingController, startingCollider, { x: 8, y: 11, z: 10 }),
    1,
  );
});

test("Looper control config contains no manual position, arc, or per-control radius", () => {
  const forbidden = ["x", "y", "z", "rotationDegrees", "arc", "colliderRadius", "movementMode", "dragSensitivity"];
  for (const config of Object.values(LOOPER_CONTROL_COLLIDERS)) {
    for (const key of forbidden) assert.equal(key in config, false, key);
  }
});

test("Looper morph weights remain unchanged for endpoints and intermediate values", () => {
  for (const [value, expected] of [
    [-1, { up: 0, down: 1 }],
    [-0.4, { up: 0, down: 0.4 }],
    [0, { up: 0, down: 0 }],
    [0.35, { up: 0.35, down: 0 }],
    [1, { up: 1, down: 0 }],
  ]) assert.deepEqual(getLooperControlMorphWeights(value), expected);
});

test("Looper durable state exposes only Volume and Gap controls", () => {
  const controller = new LooperController();
  const looper = { id: "looper-gap", root: { visible: true }, hitTargets: {} };
  looper.looperData = controller.createStateData(looper, { trackCount: 1 });

  assert.equal(looper.looperData.gapControlValue, -1);
  assert.deepEqual(
    Object.keys(looper.looperData).filter((key) => key.endsWith("ControlValue")).sort(),
    ["gapControlValue", "volumeControlValue"],
  );
  assert.equal(controller.setControlValue(looper, "tempo", 1), null);

  controller.restoreState(looper, {
    controls: { volume: 0.25, gap: 0.5 },
    timeline: {},
  });
  assert.equal(looper.looperData.gapControlValue, 0.5);
  assert.deepEqual(controller.serializeState(looper).controls, { volume: 0.25, gap: 0.5 });
});
