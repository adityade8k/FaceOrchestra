import assert from "node:assert/strict";
import test from "node:test";

import { HonkPerformanceState } from "../../../src/instruments/honk/HonkPerformanceState.js";

test("resolves live squeeze sources by max and bend sources additively", () => {
  const state = new HonkPerformanceState({ squeeze: 0.1, bend: 0.1 });
  state.beginSqueeze("left", 0.7);
  state.beginSqueeze("right", 0.4);
  state.setLiveBend("left", 0.25);
  state.setLiveBend("right", -0.05);
  assert.equal(state.resolve().squeeze, 0.7);
  assert.ok(Math.abs(state.resolve().bend - 0.3) < 1e-10);

  state.endSqueeze("left");
  state.clearLiveBend("left");
  assert.equal(state.resolve().squeeze, 0.4);
  assert.ok(Math.abs(state.resolve().bend - 0.05) < 1e-10);
});

test("automation preserves live input, takes max squeeze, and adds bend", () => {
  const state = new HonkPerformanceState({ squeeze: 0.35, bend: 0.2 });
  state.setAutomationLayer("track-1", { squeeze: 0.8, bend: 0.4 });
  state.setAutomationLayer("track-2", { squeeze: 0.5, bend: -0.1 });
  const resolved = state.resolve();
  assert.equal(resolved.squeeze, 0.8);
  assert.ok(Math.abs(resolved.bend - 0.5) < 1e-10);
});

test("most recently updated automation layer wins morph and vowel fields", () => {
  const state = new HonkPerformanceState({ earLeft: -0.2, nose: 0.1, vowel: "A" });
  state.setAutomationLayer("first", { earLeft: 0.4, nose: 0.6, vowel: "I" });
  state.setAutomationLayer("second", { earLeft: -0.8, vowel: "O" });
  assert.deepEqual(
    pick(state.resolve(), ["earLeft", "nose", "vowel"]),
    { earLeft: -0.8, nose: 0.6, vowel: "O" },
  );
  state.setAutomationLayer("first", { earLeft: 0.2 });
  assert.equal(state.resolve().earLeft, 0.2);
});

test("empty automation actions clear their layer without a looper dependency", () => {
  const state = new HonkPerformanceState();
  state.setAutomationLayer("track", { squeeze: 1 });
  assert.equal(state.hasAutomation(), true);
  state.setAutomationLayer("track", {});
  assert.equal(state.hasAutomation(), false);
});

test("clearing one automation layer preserves every other layer", () => {
  const state = new HonkPerformanceState({ squeeze: 0.2 });
  state.setAutomationLayer("track-a", { squeeze: 0.9, bend: 0.3 });
  state.setAutomationLayer("track-b", { squeeze: 0.6, bend: -0.1 });

  state.clearAutomationLayer("track-a");

  assert.equal(state.hasAutomationLayer("track-a"), false);
  assert.equal(state.hasAutomationLayer("track-b"), true);
  assert.equal(state.resolve().squeeze, 0.6);
  assert.ok(Math.abs(state.resolve().bend + 0.1) < 1e-10);
});

function pick(value, fields) {
  return Object.fromEntries(fields.map((field) => [field, value[field]]));
}
