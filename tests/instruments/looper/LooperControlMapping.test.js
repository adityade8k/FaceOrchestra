import test from "node:test";
import assert from "node:assert/strict";
import {
  getLooperGapBeatsFromControl,
  getLooperGapControlFromBeats,
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

test("Looper gap defaults to the lowest control endpoint", () => {
  assert.equal(getLooperGapControlFromBeats(0), -1);
});
