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
  assert.deepEqual(LOOPER_CONTROL_COLLIDERS.gap.arc.axis, { x: 0, y: 0, z: 1 });
  assert.equal(LOOPER_CONTROL_COLLIDERS.gap.arc.referenceAngleDegrees, 0);
  assert.deepEqual(LOOPER_CONTROL_MORPH_TARGETS.gap, {
    down: "Right_handle_down",
    up: "right_handle_up",
  });

  const userData = {
    movementMode: "arc",
    arc: LOOPER_CONTROL_COLLIDERS.gap.arc,
  };
  const lowest = getLooperControlColliderPosition(userData, -1);
  const highest = getLooperControlColliderPosition(userData, 1);
  assert.ok(lowest.y < highest.y);
  assert.deepEqual(getLooperControlMorphWeights(-1), { up: 0, down: 1 });
});

test("migrated Looper arc positions match the legacy calibration across the range", () => {
  const oldControls = {
    volume: { x: -0.32, y: 0.16, z: 0, side: 1, radius: 0.18, min: -30, max: 30, rotation: -45 },
    gap: { x: 0.18, y: 0.16, z: 0, side: -1, radius: 0.28, min: -20, max: 20, rotation: 45 },
  };
  for (const control of ["volume", "gap"]) {
    for (const value of [-1, -0.65, -0.2, 0, 0.35, 0.8, 1]) {
      const legacy = legacyPosition(oldControls[control], value);
      const migrated = getLooperControlColliderPosition({
        movementMode: "arc",
        arc: LOOPER_CONTROL_COLLIDERS[control].arc,
      }, value);
      for (const axis of ["x", "y", "z"]) {
        assert.ok(Math.abs(legacy[axis] - migrated[axis]) < 2e-9, `${control} ${value} ${axis}`);
      }
    }
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

function legacyPosition(config, value) {
  const scale = 0.009999999776482582;
  const min = [-15.620359420776367, -16.854137420654297, -56.356197357177734];
  const max = [22.489776611328125, 11.461462020874023, 1.3210140466690063];
  const boundsCenter = {
    x: (min[0] + max[0]) * 0.5 * scale,
    y: -(min[2] + max[2]) * 0.5 * scale,
    z: (min[1] + max[1]) * 0.5 * scale,
  };
  const boundsSize = {
    x: (max[0] - min[0]) * scale,
    y: (max[2] - min[2]) * scale,
    z: (max[1] - min[1]) * scale,
  };
  const neutral = {
    x: boundsCenter.x + boundsSize.x * config.x,
    y: boundsCenter.y + boundsSize.y * config.y,
    z: boundsCenter.z + boundsSize.z * config.z,
  };
  const radius = boundsSize.x * config.radius;
  const angle = (config.min + (value + 1) * 0.5 * (config.max - config.min)) * Math.PI / 180;
  const midpoint = (config.min + config.max) * 0.5 * Math.PI / 180;
  const local = {
    x: -config.side * Math.cos(angle) * radius + config.side * Math.cos(midpoint) * radius,
    y: Math.sin(angle) * radius - Math.sin(midpoint) * radius,
  };
  const rotation = config.rotation * Math.PI / 180;
  return {
    x: neutral.x + local.x * Math.cos(rotation) - local.y * Math.sin(rotation),
    y: neutral.y + local.x * Math.sin(rotation) + local.y * Math.cos(rotation),
    z: neutral.z,
  };
}
