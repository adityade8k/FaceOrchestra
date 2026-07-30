import test from "node:test";
import assert from "node:assert/strict";
import {
  getLooperGapBeatsFromControl,
  getLooperGapControlFromBeats,
  LOOPER_SPEED_RANGE,
  getLooperSpeedFromControl,
} from "../../../src/instruments/looper/looperControlMapping.js";

test("Looper gap control snaps to zero through four whole beats", () => {
  assert.deepEqual(
    [-1, -0.5, 0, 0.5, 1].map(getLooperGapBeatsFromControl),
    [0, 1, 2, 3, 4],
  );
  assert.equal(getLooperGapBeatsFromControl(-0.8), 0);
  assert.equal(getLooperGapBeatsFromControl(-0.7), 1);
  assert.deepEqual(
    [0, 1, 2, 3, 4].map(getLooperGapControlFromBeats),
    [-1, -0.5, 0, 0.5, 1],
  );
});

test("neutral Looper speed replays actions at their recorded timing", () => {
  assert.equal(getLooperSpeedFromControl(0), 1);
});

test("Looper speed retains its slower and faster ranges around neutral", () => {
  assert.equal(getLooperSpeedFromControl(-1), LOOPER_SPEED_RANGE.min);
  assert.equal(getLooperSpeedFromControl(1), LOOPER_SPEED_RANGE.max);
  assert.ok(Math.abs(getLooperSpeedFromControl(-0.5) - 0.725) < 1e-12);
  assert.equal(getLooperSpeedFromControl(0.5), 1.5);
});

test("Looper speed clamps control input before mapping", () => {
  assert.equal(getLooperSpeedFromControl(-10), LOOPER_SPEED_RANGE.min);
  assert.equal(getLooperSpeedFromControl(10), LOOPER_SPEED_RANGE.max);
});
