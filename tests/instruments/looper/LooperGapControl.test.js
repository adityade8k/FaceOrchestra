import test from "node:test";
import assert from "node:assert/strict";

import {
  LOOPER_CONTROL_COLLIDERS,
  LOOPER_CONTROL_DEFAULT_VALUES,
  LOOPER_CONTROL_MORPH_TARGETS,
} from "../../../src/config/looper.js";
import { LooperController } from "../../../src/instruments/looper/LooperController.js";
import {
  getLooperControlColliderPosition,
  getLooperControlMorphWeights,
} from "../../../src/instruments/looper/view/looperControlPresentation.js";

test("Gap is the right-hand arc lever and defaults visually to its lowest endpoint", () => {
  assert.deepEqual(LOOPER_CONTROL_DEFAULT_VALUES, { volume: 0, gap: -1 });
  assert.deepEqual(Object.keys(LOOPER_CONTROL_COLLIDERS).sort(), ["gap", "volume"]);
  assert.equal(LOOPER_CONTROL_COLLIDERS.gap.x, 0.18);
  assert.equal(LOOPER_CONTROL_COLLIDERS.gap.rotationDegrees.z, 45);
  assert.equal(LOOPER_CONTROL_COLLIDERS.gap.arc.side, -1);
  assert.deepEqual(LOOPER_CONTROL_MORPH_TARGETS.gap, {
    down: "Right_handle_down",
    up: "right_handle_up",
  });

  const degrees = Math.PI / 180;
  const userData = {
    movementMode: "arc",
    neutralX: 0.18,
    neutralY: 0.16,
    neutralZ: 0,
    arcRadius: LOOPER_CONTROL_COLLIDERS.gap.arc.radius,
    arcSide: LOOPER_CONTROL_COLLIDERS.gap.arc.side,
    arcMinAngle: LOOPER_CONTROL_COLLIDERS.gap.arc.minDegrees * degrees,
    arcMaxAngle: LOOPER_CONTROL_COLLIDERS.gap.arc.maxDegrees * degrees,
    arcRotationZ: LOOPER_CONTROL_COLLIDERS.gap.rotationDegrees.z * degrees,
  };
  const lowest = getLooperControlColliderPosition(userData, -1);
  const highest = getLooperControlColliderPosition(userData, 1);
  assert.ok(lowest.y < highest.y);
  assert.deepEqual(getLooperControlMorphWeights(-1), { up: 0, down: 1 });
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
