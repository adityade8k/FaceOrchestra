import test from "node:test";
import assert from "node:assert/strict";

import {
  colliderScaleToRadius,
  normalizedPositionToModel,
} from "../../../src/instruments/core/calibrationMath.js";

test("runtime outlet positions convert from normalized bounds coordinates", () => {
  assert.deepEqual(
    normalizedPositionToModel(
      { x: -0.62, y: -0.25, z: 0.01 },
      { x: 2, y: 3, z: 4 },
      { x: 10, y: 20, z: 30 },
    ),
    { x: -4.2, y: -2, z: 4.3 },
  );
});

test("runtime outlet collider scale converts to model-space radius", () => {
  assert.equal(colliderScaleToRadius(0.035, 12.5), 0.43750000000000006);
  assert.throws(() => colliderScaleToRadius(0.1, 0), /greater than zero/);
});
